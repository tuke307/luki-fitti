import { SessionStatus } from '../enums';
import {
  IMPORT_FORMAT,
  IMPORT_LIMITS,
  type ExerciseDto,
  type ImportCustomExercise,
  type ImportExerciseRef,
  type ImportFile,
  type ImportSession,
  type ImportTemplate,
  type WorkoutFolderDto,
  type WorkoutSessionDto,
  type WorkoutTemplateDto,
} from '../schemas';
import { resolveTemplateSets } from './template-sets.util';

export interface BuildImportFileInput {
  folders: WorkoutFolderDto[];
  unfiledTemplates: WorkoutTemplateDto[];
  historySessions: WorkoutSessionDto[];
  /** Exercises visible to the user (system catalog, may include custom ones). */
  catalog: ExerciseDto[];
  customExercises: ExerciseDto[];
  sourceApp: string;
  exportedAt?: Date;
}

const MIN_DATE_MS = Date.UTC(2000, 0, 1);

const clip = (value: string | null | undefined, max: number) => (value ?? '').trim().slice(0, max);
const optionalText = (value: string | null | undefined, max: number) =>
  clip(value, max) || undefined;
const inRange = (value: number | null | undefined, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : undefined;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Writes the user's folders, templates, custom exercises and completed history as a
 * `luki-fitti-import@1` file (keys = entity ids), so a backup can be imported into any account.
 * Mirrored by `ImportFileBuilder` in LukiFittiDomain.
 */
export function buildImportFile(input: BuildImportFileInput): ImportFile {
  const customById = new Map<string, ExerciseDto>();
  for (const ex of [...input.customExercises, ...input.catalog]) {
    if (!ex.isSystem && !customById.has(ex.id)) customById.set(ex.id, ex);
  }
  const systemById = new Map(input.catalog.filter((e) => e.isSystem).map((e) => [e.id, e]));
  const refFor = (
    id: string | null | undefined,
    embedded?: ExerciseDto,
  ): ImportExerciseRef | null => {
    if (!id) return null;
    if (customById.has(id)) return { customKey: id };
    const slug = systemById.get(id)?.slug ?? (embedded?.isSystem ? embedded.slug : undefined);
    return slug ? { slug } : null;
  };

  const customExercises: ImportCustomExercise[] = [...customById.values()]
    .slice(0, IMPORT_LIMITS.customExercises)
    .map((ex) => ({
      key: ex.id,
      name: clip(ex.name, 120) || 'Exercise',
      primaryMuscleGroup: ex.primaryMuscleGroup,
      equipment: ex.equipment,
      exerciseType: ex.exerciseType,
      ...(ex.movementPattern ? { movementPattern: ex.movementPattern } : {}),
      ...(ex.laterality ? { laterality: ex.laterality } : {}),
      ...(optionalText(ex.description, 2000) ? { description: clip(ex.description, 2000) } : {}),
      ...(ex.instructions.some((s) => s.trim())
        ? {
            instructions: ex.instructions
              .map((s) => clip(s, 1000))
              .filter(Boolean)
              .slice(0, 30),
          }
        : {}),
    }));
  const exportedCustomKeys = new Set(customExercises.map((e) => e.key));
  const resolve = (id: string | null | undefined, embedded?: ExerciseDto) => {
    const ref = refFor(id, embedded);
    return ref && 'customKey' in ref && !exportedCustomKeys.has(ref.customKey) ? null : ref;
  };

  const folders = input.folders.slice(0, IMPORT_LIMITS.folders);
  const folderKeys = new Set(folders.map((f) => f.id));
  const allTemplates = [...folders.flatMap((f) => f.templates), ...input.unfiledTemplates].slice(
    0,
    IMPORT_LIMITS.templates,
  );

  const templates: ImportTemplate[] = allTemplates.map((t) => ({
    key: t.id,
    ...(t.folderId && folderKeys.has(t.folderId) ? { folderKey: t.folderId } : {}),
    name: clip(t.name, 100) || 'Workout',
    ...(optionalText(t.description, 500) ? { description: clip(t.description, 500) } : {}),
    ...(t.estimatedDurationMinutes
      ? { estimatedDurationMinutes: clamp(Math.round(t.estimatedDurationMinutes), 5, 360) }
      : {}),
    sortOrder: clamp(t.sortOrder, 0, 100_000),
    exercises: t.exercises
      .flatMap((te) => {
        const exercise = resolve(te.exerciseId, te.exercise);
        if (!exercise) return [];
        const alternatives = te.alternativeExerciseIds
          .map((id) => resolve(id))
          .filter((ref): ref is ImportExerciseRef => ref !== null)
          .slice(0, 20);
        return [
          {
            exercise,
            orderIndex: clamp(te.orderIndex, 0, 1_000),
            sets: resolveTemplateSets(te)
              .slice(0, 40)
              .map((s) => ({
                setType: s.setType,
                weight: inRange(s.weight, 0, 1500) ?? null,
                reps: inRange(s.reps, 0, 200) ?? null,
                durationSeconds: inRange(s.durationSeconds, 0, 14_400) ?? null,
              })),
            restSeconds: clamp(te.restSeconds, 0, 900),
            ...(alternatives.length > 0 ? { alternativeExercises: alternatives } : {}),
          },
        ];
      })
      .slice(0, IMPORT_LIMITS.exercisesPerTemplate),
  }));
  const templateKeys = new Set(templates.map((t) => t.key));

  const maxDateMs = Date.now() + 24 * 60 * 60 * 1000;
  const validDate = (iso: string | null | undefined) => {
    const ms = iso ? Date.parse(iso) : NaN;
    return ms >= MIN_DATE_MS && ms <= maxDateMs ? new Date(ms).toISOString() : null;
  };
  const sessions: ImportSession[] = input.historySessions
    .flatMap((s): ImportSession[] => {
      const startedAt = validDate(s.startedAt);
      const completedAt = validDate(s.completedAt);
      if (s.status !== SessionStatus.COMPLETED || !startedAt || !completedAt) return [];
      if (Date.parse(completedAt) < Date.parse(startedAt)) return [];
      return [
        {
          key: s.id,
          workoutName: clip(s.workoutNameSnapshot, 160) || 'Workout',
          ...(s.templateId && templateKeys.has(s.templateId) ? { templateKey: s.templateId } : {}),
          sessionType: s.sessionType,
          startedAt,
          completedAt,
          activeDurationSeconds: clamp(Math.round(s.activeDurationSeconds), 0, 86_400),
          ...(optionalText(s.notes, 2000) ? { notes: clip(s.notes, 2000) } : {}),
          exercises: s.exercises
            .flatMap((ex) => {
              const exercise = resolve(ex.exerciseId);
              if (!exercise) return [];
              return [
                {
                  exercise,
                  orderIndex: clamp(ex.orderIndex, 0, 1_000),
                  restSeconds: clamp(ex.restSeconds, 0, 1800),
                  sets: ex.sets.slice(0, IMPORT_LIMITS.setsPerExercise).map((set, i) => {
                    const weight = inRange(set.weight, 0, 1500);
                    const reps = inRange(set.reps, 0, 1000);
                    const durationSeconds = inRange(set.durationSeconds, 0, 86_400);
                    const rpe = inRange(set.rpe, 0, 10);
                    return {
                      setNumber: i + 1,
                      setType: set.setType,
                      ...(weight !== undefined ? { weight } : {}),
                      weightUnit: set.weightUnit,
                      ...(reps !== undefined ? { reps: Math.round(reps) } : {}),
                      ...(durationSeconds !== undefined
                        ? { durationSeconds: Math.round(durationSeconds) }
                        : {}),
                      ...(rpe !== undefined ? { rpe } : {}),
                      completed: set.completed,
                    };
                  }),
                },
              ];
            })
            .slice(0, IMPORT_LIMITS.exercisesPerSession),
        },
      ];
    })
    .slice(0, IMPORT_LIMITS.sessions);

  return {
    format: IMPORT_FORMAT,
    exportedAt: (input.exportedAt ?? new Date()).toISOString(),
    source: { app: clip(input.sourceApp, 60) || 'LukiFitti' },
    customExercises,
    folders: folders.map((f) => ({
      key: f.id,
      name: clip(f.name, 80) || 'Folder',
      ...(/^#[0-9A-Fa-f]{6}$/.test(f.color) ? { color: f.color } : {}),
      sortOrder: clamp(f.sortOrder, 0, 100_000),
    })),
    templates,
    sessions,
  };
}
