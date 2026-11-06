import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';
import { logger } from '@luki-fitti/logger';
import { PrismaService } from '../database/prisma.service';
import { SessionService } from '../session/session.service';
import { ExerciseService } from '../exercise/exercise.service';
import {
  ExerciseCategory,
  ExerciseType,
  SessionExerciseOrigin,
  SessionExerciseStatus,
  SessionSourceDevice,
  SessionStatus,
  SessionType,
  SetType,
  WeightUnit,
  type MuscleGroup,
  type SupportedLocale,
} from '@luki-fitti/common/enums';
import { ALL_SYSTEM_EXERCISES } from '@luki-fitti/common/catalog/extended';
import { getExerciseText } from '@luki-fitti/common/catalog';
import {
  DEFAULT_FOLDER_COLOR,
  deriveRepRange,
  estimateWorkoutEnergy,
  summarizeTemplateSets,
} from '@luki-fitti/common/utils';
import {
  IMPORT_FORMAT,
  IMPORT_LIMITS,
  ImportFileSchema,
  formatImportIssues,
  type ImportCommitResultDto,
  type ImportExerciseRef,
  type ImportFile,
  type ImportPreviewDto,
  type ImportWarningDto,
  type SyncSessionPayloadDto,
} from '@luki-fitti/common/schemas';
import type { Prisma } from '@luki-fitti/database';
import { importId } from './uuid-v5';

type ImportDb = Pick<
  PrismaService,
  | 'exercise'
  | 'exerciseMuscleGroup'
  | 'workoutFolder'
  | 'workoutTemplate'
  | 'workoutTemplateExercise'
  | 'workoutSession'
  | 'sessionExercise'
  | 'sessionSet'
  | 'userPreferences'
>;

interface ResolvedExercise {
  id: string;
  name: string;
  primaryMuscleGroup: `${MuscleGroup}`;
  exerciseType: `${ExerciseType}`;
}

interface ImportPlan {
  preview: ImportPreviewDto;
  resolveRef: (ref: ImportExerciseRef) => ResolvedExercise;
  folderIdByKey: Map<string, string>;
  newCustomExerciseKeys: Set<string>;
  newFolderKeys: Set<string>;
  newTemplateKeys: Set<string>;
  newSessionKeys: Set<string>;
}

export type ImportErrorCode = 'INVALID_FILE' | 'UNKNOWN_SLUGS' | 'COMMIT_FAILED';

const QUERY_CHUNK = 5_000;
const INSERT_CHUNK = 2_000;
/** Big files take a while; Prisma's 5 s default would roll them back. */
const COMMIT_TX_OPTIONS = { maxWait: 10_000, timeout: 180_000 };

const chunks = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

const refKey = (ref: ImportExerciseRef) =>
  'slug' in ref ? `slug:${ref.slug}` : `custom:${ref.customKey}`;

function customSlug(name: string, id: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return `${base || 'custom'}-${id.slice(0, 8)}`;
}

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
    @Optional() private readonly exerciseService?: ExerciseService,
  ) {}

  /** Validates the uploaded file; 400 with at most 50 `{ path, message }` issues. */
  parse(body: unknown): ImportFile {
    const result = ImportFileSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Invalid import file',
        code: 'IMPORT_INVALID_FILE',
        errors: formatImportIssues(result.error),
      });
    }
    return result.data;
  }

  async preview(userId: string, body: unknown, locale: SupportedLocale): Promise<ImportPreviewDto> {
    const file = this.parse(body);
    return (await this.plan(this.prisma, userId, file, locale)).preview;
  }

  async commit(
    userId: string,
    body: unknown,
    locale: SupportedLocale,
  ): Promise<ImportCommitResultDto> {
    const meta = ImportService.describe(body);
    let file: ImportFile;
    try {
      file = this.parse(body);
    } catch (error) {
      await this.recordJob(userId, meta, 'FAILED', {}, 'INVALID_FILE');
      throw error;
    }

    const state: { preview?: ImportPreviewDto } = {};
    try {
      const jobId = await this.prisma.$transaction(async (tx) => {
        const plan = await this.plan(tx, userId, file, locale);
        state.preview = plan.preview;
        if (plan.preview.unknownSlugCount > 0) {
          throw new BadRequestException({
            message: 'The file references exercises that do not exist',
            code: 'IMPORT_UNKNOWN_SLUGS',
            errors: plan.preview.unknownSlugs.map((slug) => ({
              path: 'exercise.slug',
              message: `Unknown slug ${slug}`,
            })),
          });
        }
        await this.write(tx, userId, file, plan);
        const job = await tx.importJob.create({
          data: {
            userId,
            format: file.format,
            sourceApp: file.source.app,
            status: 'SUCCESS',
            counts: ImportService.jobCounts(plan.preview),
          },
          select: { id: true },
        });
        return job.id;
      }, COMMIT_TX_OPTIONS);
      return { ...state.preview!, jobId };
    } catch (error) {
      const unknown = error instanceof BadRequestException;
      await this.recordJob(
        userId,
        meta,
        'FAILED',
        state.preview ? ImportService.jobCounts(state.preview) : {},
        unknown ? 'UNKNOWN_SLUGS' : 'COMMIT_FAILED',
      );
      if (error instanceof HttpException) throw error;
      // Database errors can quote the rows they failed on; keep file data out of logs and responses.
      logger.error(
        `Import commit failed (${error instanceof Error ? error.name : 'unknown error'})`,
      );
      throw new InternalServerErrorException({ message: 'Import failed', code: 'IMPORT_FAILED' });
    }
  }

  private static describe(body: unknown) {
    const b = (body ?? {}) as { format?: unknown; source?: { app?: unknown } };
    const str = (v: unknown, fallback: string) =>
      typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : fallback;
    return { format: str(b.format, 'unknown'), sourceApp: str(b.source?.app, 'unknown') };
  }

  private static jobCounts(
    preview: ImportPreviewDto,
  ): Record<string, number | { total: number; new: number; existing: number }> {
    return {
      ...preview.counts,
      totalSets: preview.totalSets,
      newSets: preview.newSets,
      unknownSlugCount: preview.unknownSlugCount,
      warnings: preview.warnings.length,
    };
  }

  private async recordJob(
    userId: string,
    meta: { format: string; sourceApp: string },
    status: 'SUCCESS' | 'FAILED',
    counts: object,
    errorCode: ImportErrorCode,
  ) {
    await this.prisma.importJob
      .create({ data: { userId, ...meta, status, counts, errorCode } })
      .catch(() => undefined);
  }

  private async existingIds(
    find: (ids: string[]) => Promise<Array<{ id: string }>>,
    ids: string[],
  ): Promise<Set<string>> {
    const found = new Set<string>();
    for (const part of chunks(ids, QUERY_CHUNK)) {
      for (const row of await find(part)) found.add(row.id);
    }
    return found;
  }

  private async loadExercises(db: ImportDb, userId: string, slugs: string[]) {
    const query = async () => {
      const rows: Array<ResolvedExercise & { slug: string }> = [];
      for (const part of chunks(slugs, QUERY_CHUNK)) {
        rows.push(
          ...(await db.exercise.findMany({
            where: { slug: { in: part }, OR: [{ isSystem: true }, { userId }] },
            select: {
              id: true,
              slug: true,
              name: true,
              primaryMuscleGroup: true,
              exerciseType: true,
            },
          })),
        );
      }
      return new Map(rows.map((r) => [r.slug, r]));
    };
    let bySlug = await query();
    const systemSlugs = new Set(ALL_SYSTEM_EXERCISES.map((e) => e.slug));
    if (this.exerciseService && slugs.some((s) => !bySlug.has(s) && systemSlugs.has(s))) {
      // The system catalog is seeded lazily on the first exercise listing.
      await this.exerciseService.findAll(null, {}, 'en');
      bySlug = await query();
    }
    return bySlug;
  }

  /** Read-only analysis shared by preview and commit (commit runs it inside its transaction). */
  private async plan(
    db: ImportDb,
    userId: string,
    file: ImportFile,
    locale: SupportedLocale,
  ): Promise<ImportPlan> {
    const allRefs: ImportExerciseRef[] = [
      ...file.templates.flatMap((t) =>
        t.exercises.flatMap((e) => [e.exercise, ...(e.alternativeExercises ?? [])]),
      ),
      ...file.sessions.flatMap((s) => s.exercises.map((e) => e.exercise)),
    ];
    const slugs = [...new Set(allRefs.flatMap((r) => ('slug' in r ? [r.slug] : [])))];
    const bySlug = await this.loadExercises(db, userId, slugs);
    const unknownSlugs = slugs.filter((s) => !bySlug.has(s));

    const idsOf = (kind: Parameters<typeof importId>[1], keys: string[]) =>
      keys.map((key) => importId(userId, kind, key));
    const customIds = idsOf(
      'exercise',
      file.customExercises.map((e) => e.key),
    );
    const folderIds = idsOf(
      'folder',
      file.folders.map((f) => f.key),
    );
    const templateIds = idsOf(
      'template',
      file.templates.map((t) => t.key),
    );
    const sessionIds = idsOf(
      'session',
      file.sessions.map((s) => s.key),
    );

    const [existingCustom, existingFolders, existingTemplates, existingSessions] =
      await Promise.all([
        this.existingIds(
          (ids) =>
            db.exercise.findMany({ where: { id: { in: ids }, userId }, select: { id: true } }),
          customIds,
        ),
        this.existingIds(
          (ids) =>
            db.workoutFolder.findMany({ where: { id: { in: ids }, userId }, select: { id: true } }),
          folderIds,
        ),
        this.existingIds(
          (ids) =>
            db.workoutTemplate.findMany({
              where: { id: { in: ids }, userId },
              select: { id: true },
            }),
          templateIds,
        ),
        this.existingIds(
          (ids) =>
            db.workoutSession.findMany({
              where: { id: { in: ids }, userId },
              select: { id: true },
            }),
          sessionIds,
        ),
      ]);

    const customByKey = new Map<string, ResolvedExercise>();
    const newCustomExerciseKeys = new Set<string>();
    file.customExercises.forEach((e, i) => {
      const id = customIds[i]!;
      customByKey.set(e.key, {
        id,
        name: e.name,
        primaryMuscleGroup: e.primaryMuscleGroup,
        exerciseType: e.exerciseType,
      });
      if (!existingCustom.has(id)) newCustomExerciseKeys.add(e.key);
    });

    const warnings: ImportWarningDto[] = [];
    const folderIdByKey = new Map<string, string>();
    const newFolderKeys = new Set<string>();
    const candidateFolders = file.folders.filter((_, i) => !existingFolders.has(folderIds[i]!));
    const sameName = candidateFolders.length
      ? await db.workoutFolder.findMany({
          where: { userId, name: { in: candidateFolders.map((f) => f.name) } },
          select: { id: true, name: true },
        })
      : [];
    const folderByName = new Map(sameName.map((f) => [f.name, f.id]));
    file.folders.forEach((f, i) => {
      const id = folderIds[i]!;
      const reused = existingFolders.has(id) ? undefined : folderByName.get(f.name);
      folderIdByKey.set(f.key, reused ?? id);
      if (reused) warnings.push({ code: 'FOLDER_NAME_REUSED', key: f.key, name: f.name });
      else if (!existingFolders.has(id)) newFolderKeys.add(f.key);
    });

    const newTemplateKeys = new Set(
      file.templates.filter((_, i) => !existingTemplates.has(templateIds[i]!)).map((t) => t.key),
    );
    const newSessions = file.sessions.filter((_, i) => !existingSessions.has(sessionIds[i]!));
    const newSessionKeys = new Set(newSessions.map((s) => s.key));

    const countSets = (sessions: ImportFile['sessions']) =>
      sessions.reduce((n, s) => n + s.exercises.reduce((m, e) => m + e.sets.length, 0), 0);
    const counts = (total: number, created: number) => ({
      total,
      new: created,
      existing: total - created,
    });
    const starts = file.sessions.map((s) => Date.parse(s.startedAt));

    const preview: ImportPreviewDto = {
      format: IMPORT_FORMAT,
      sourceApp: file.source.app,
      counts: {
        customExercises: counts(file.customExercises.length, newCustomExerciseKeys.size),
        folders: counts(file.folders.length, newFolderKeys.size),
        templates: counts(file.templates.length, newTemplateKeys.size),
        sessions: counts(file.sessions.length, newSessionKeys.size),
      },
      totalSets: countSets(file.sessions),
      newSets: countSets(newSessions),
      earliestSessionAt: starts.length ? new Date(Math.min(...starts)).toISOString() : null,
      latestSessionAt: starts.length ? new Date(Math.max(...starts)).toISOString() : null,
      unknownSlugs: unknownSlugs.slice(0, IMPORT_LIMITS.issues),
      unknownSlugCount: unknownSlugs.length,
      warnings,
    };

    const resolveRef = (ref: ImportExerciseRef): ResolvedExercise => {
      const found = 'slug' in ref ? bySlug.get(ref.slug) : customByKey.get(ref.customKey);
      if (!found) throw new Error(`Unresolved exercise ${refKey(ref)}`);
      const text = 'slug' in ref ? getExerciseText(found.id, locale) : null;
      return text ? { ...found, name: text.name } : found;
    };

    return {
      preview,
      resolveRef,
      folderIdByKey,
      newCustomExerciseKeys,
      newFolderKeys,
      newTemplateKeys,
      newSessionKeys,
    };
  }

  private async write(db: ImportDb, userId: string, file: ImportFile, plan: ImportPlan) {
    const insert = async <T>(rows: T[], create: (data: T[]) => Promise<unknown>) => {
      for (const part of chunks(rows, INSERT_CHUNK)) await create(part);
    };

    const customs = file.customExercises.filter((e) => plan.newCustomExerciseKeys.has(e.key));
    const exerciseRows = customs.map((e) => {
      const id = importId(userId, 'exercise', e.key);
      return {
        id,
        slug: customSlug(e.name, id),
        userId,
        name: e.name,
        description: e.description ?? '',
        instructions: e.instructions ?? [],
        category: ExerciseCategory.COMPOUND,
        exerciseType: e.exerciseType,
        primaryMuscleGroup: e.primaryMuscleGroup,
        equipment: e.equipment,
        movementPattern: e.movementPattern ?? null,
        laterality: e.laterality ?? null,
        isSystem: false,
      };
    });
    await insert(exerciseRows, (data) => db.exercise.createMany({ data, skipDuplicates: true }));
    await insert(
      exerciseRows.map((e) => ({
        exerciseId: e.id,
        muscleGroup: e.primaryMuscleGroup,
        isPrimary: true,
      })),
      (data) => db.exerciseMuscleGroup.createMany({ data, skipDuplicates: true }),
    );

    await insert(
      file.folders
        .filter((f) => plan.newFolderKeys.has(f.key))
        .map((f) => ({
          id: plan.folderIdByKey.get(f.key)!,
          userId,
          name: f.name,
          color: f.color ?? DEFAULT_FOLDER_COLOR,
          sortOrder: f.sortOrder ?? 0,
        })),
      (data) => db.workoutFolder.createMany({ data, skipDuplicates: true }),
    );

    const templates = file.templates.filter((t) => plan.newTemplateKeys.has(t.key));
    await insert(
      templates.map((t) => ({
        id: importId(userId, 'template', t.key),
        userId,
        folderId: t.folderKey ? (plan.folderIdByKey.get(t.folderKey) ?? null) : null,
        name: t.name,
        description: t.description ?? null,
        estimatedDurationMinutes: t.estimatedDurationMinutes ?? 60,
        sortOrder: t.sortOrder ?? 0,
      })),
      (data) => db.workoutTemplate.createMany({ data, skipDuplicates: true }),
    );
    await insert(
      templates.flatMap((t) =>
        t.exercises.map((ex, i) => {
          const summary = summarizeTemplateSets(ex.sets);
          return {
            id: importId(userId, 'template-exercise', `${t.key}:${i}`),
            templateId: importId(userId, 'template', t.key),
            exerciseId: plan.resolveRef(ex.exercise).id,
            orderIndex: ex.orderIndex,
            sets: ex.sets,
            ...summary,
            ...deriveRepRange(ex.sets, {}),
            weightUnit: WeightUnit.KG,
            restSeconds: ex.restSeconds,
            alternativeExerciseIds: [
              ...new Set((ex.alternativeExercises ?? []).map((a) => plan.resolveRef(a).id)),
            ],
          };
        }),
      ),
      (data) => db.workoutTemplateExercise.createMany({ data, skipDuplicates: true }),
    );

    const prefs = await db.userPreferences.findUnique({
      where: { userId },
      select: { bodyWeightKg: true },
    });
    const sessions = file.sessions.filter((s) => plan.newSessionKeys.has(s.key));
    for (const part of chunks(sessions, 500)) {
      const sessionRows: Prisma.WorkoutSessionCreateManyInput[] = [];
      const exerciseRowsOfPart: Prisma.SessionExerciseCreateManyInput[] = [];
      const setRows: Prisma.SessionSetCreateManyInput[] = [];
      for (const s of part) {
        const sessionId = importId(userId, 'session', s.key);
        const completedAt = new Date(s.completedAt);
        const exercises = s.exercises.map((ex, e) => {
          const resolved = plan.resolveRef(ex.exercise);
          const id = importId(userId, 'session-exercise', `${s.key}:${e}`);
          return {
            id,
            resolved,
            ex,
            sync: {
              exerciseTypeSnapshot: resolved.exerciseType,
              sets: ex.sets.map((set) => ({
                setType: set.setType,
                weight: set.weight ?? null,
                weightUnit: set.weightUnit,
                reps: set.reps ?? null,
                durationSeconds: set.durationSeconds ?? null,
                completed: set.completed,
              })),
            },
          };
        });
        const syncExercises = exercises.map((e) => e.sync) as SyncSessionPayloadDto['exercises'];
        const metrics = this.sessionService.computeSessionMetrics(syncExercises);
        const activeDurationSeconds =
          s.activeDurationSeconds ??
          Math.min(86_400, Math.round((completedAt.getTime() - Date.parse(s.startedAt)) / 1000));
        const sessionType =
          s.sessionType ??
          (exercises.length > 0 &&
          exercises.every((e) => e.resolved.exerciseType === ExerciseType.STRETCHING)
            ? SessionType.STRETCHING
            : SessionType.STRENGTH);
        const estimatedCaloriesKcal = estimateWorkoutEnergy(
          {
            sessionType,
            activeDurationSeconds,
            activeCaloriesKcal: null,
            exercises: syncExercises,
          },
          prefs?.bodyWeightKg ?? null,
        ).kcal;

        sessionRows.push({
          id: sessionId,
          clientSessionId: sessionId,
          userId,
          templateId: s.templateKey ? importId(userId, 'template', s.templateKey) : null,
          sessionType,
          workoutNameSnapshot: s.workoutName,
          status: SessionStatus.COMPLETED,
          startedAt: new Date(s.startedAt),
          completedAt,
          activeDurationSeconds,
          weightUnit: s.exercises[0]?.sets[0]?.weightUnit ?? WeightUnit.KG,
          ...metrics,
          notes: s.notes ?? null,
          sourceDevice: SessionSourceDevice.IMPORT,
          estimatedCaloriesKcal,
          lastSyncedAt: new Date(),
        });
        for (const { id, resolved, ex } of exercises) {
          exerciseRowsOfPart.push({
            id,
            clientExerciseId: id,
            sessionId,
            exerciseId: resolved.id,
            exerciseNameSnapshot: resolved.name.slice(0, 160),
            primaryMuscleSnapshot: resolved.primaryMuscleGroup,
            exerciseTypeSnapshot: resolved.exerciseType,
            origin: SessionExerciseOrigin.PLANNED,
            status: SessionExerciseStatus.COMPLETED,
            orderIndex: ex.orderIndex,
            plannedSets: Math.max(1, ex.sets.filter((x) => x.setType !== SetType.WARMUP).length),
            plannedWarmupSets: ex.sets.filter((x) => x.setType === SetType.WARMUP).length,
            restSeconds: ex.restSeconds ?? 90,
          });
          ex.sets.forEach((set, i) => {
            const setId = importId(userId, 'session-set', `${id}:${i}`);
            setRows.push({
              id: setId,
              clientSetId: setId,
              sessionExerciseId: id,
              setNumber: set.setNumber,
              setType: set.setType,
              weight: set.weight ?? null,
              weightUnit: set.weightUnit,
              reps: set.reps ?? null,
              durationSeconds: set.durationSeconds ?? null,
              rpe: set.rpe ?? null,
              completed: set.completed,
              completedAt: set.completed ? completedAt : null,
            });
          });
        }
      }
      await db.workoutSession.createMany({ data: sessionRows, skipDuplicates: true });
      await insert(exerciseRowsOfPart, (data) =>
        db.sessionExercise.createMany({ data, skipDuplicates: true }),
      );
      await insert(setRows, (data) => db.sessionSet.createMany({ data, skipDuplicates: true }));
    }
  }
}
