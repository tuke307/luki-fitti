import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { localizeFolder, localizeTemplate, resolveExerciseMedia } from '@luki-fitti/common/catalog';
import type { SupportedLocale } from '@luki-fitti/common/enums';
import {
  buildTemplateExercisesFromSession,
  DEFAULT_FOLDER_COLOR,
  summarizeTemplateSets,
} from '@luki-fitti/common/utils';
import { TemplateSetSchema } from '@luki-fitti/common/schemas';
import type {
  TemplateExerciseInputDto,
  WorkoutSessionDto,
  CreateFolderDto,
  UpdateFolderDto,
  CreateTemplateDto,
  UpdateTemplateDto,
  WorkoutFolderDto,
  WorkoutTemplateDto,
} from '@luki-fitti/common/schemas';

@Injectable()
export class WorkoutService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(
    userId: string,
    locale: SupportedLocale,
  ): Promise<{
    folders: WorkoutFolderDto[];
    unfiledTemplates: WorkoutTemplateDto[];
  }> {
    const [folders, unfiled] = await Promise.all([
      this.prisma.workoutFolder.findMany({
        where: { userId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          templates: {
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            include: {
              exercises: {
                orderBy: { orderIndex: 'asc' },
                include: { exercise: true },
              },
            },
          },
        },
      }),
      this.prisma.workoutTemplate.findMany({
        where: { userId, folderId: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          exercises: {
            orderBy: { orderIndex: 'asc' },
            include: { exercise: true },
          },
        },
      }),
    ]);

    return {
      folders: folders.map((f) => this.mapFolderDto(f, locale)),
      unfiledTemplates: unfiled.map((t) => localizeTemplate(this.mapTemplateDto(t), locale)),
    };
  }

  async createFolder(userId: string, dto: CreateFolderDto): Promise<WorkoutFolderDto> {
    const existing = await this.prisma.workoutFolder.findUnique({
      where: { userId_name: { userId, name: dto.name.trim() } },
    });
    if (existing) {
      throw new ConflictException('A folder with this name already exists');
    }

    const folder = await this.prisma.workoutFolder.create({
      data: {
        userId,
        name: dto.name.trim(),
        color: dto.color ?? DEFAULT_FOLDER_COLOR,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    return {
      id: folder.id,
      systemKey: folder.systemKey,
      userId: folder.userId,
      name: folder.name,
      color: folder.color,
      sortOrder: folder.sortOrder,
      templates: [],
    };
  }

  async updateFolder(
    userId: string,
    folderId: string,
    dto: UpdateFolderDto,
    locale: SupportedLocale,
  ): Promise<WorkoutFolderDto> {
    const folder = await this.prisma.workoutFolder.findUnique({ where: { id: folderId } });
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }
    if (folder.userId !== userId) {
      throw new ForbiddenException('Access denied to this folder');
    }

    const updated = await this.prisma.workoutFolder.update({
      where: { id: folderId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim(), systemKey: null } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
      include: {
        templates: {
          orderBy: { sortOrder: 'asc' },
          include: {
            exercises: {
              orderBy: { orderIndex: 'asc' },
              include: { exercise: true },
            },
          },
        },
      },
    });

    return this.mapFolderDto(updated, locale);
  }

  async deleteFolder(userId: string, folderId: string): Promise<{ success: boolean }> {
    const folder = await this.prisma.workoutFolder.findUnique({ where: { id: folderId } });
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }
    if (folder.userId !== userId) {
      throw new ForbiddenException('Access denied to this folder');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.workoutTemplate.updateMany({
        where: { folderId, userId },
        data: { folderId: null },
      });
      await tx.workoutFolder.delete({ where: { id: folderId } });
    });

    return { success: true };
  }

  async getTemplateById(
    userId: string,
    templateId: string,
    locale: SupportedLocale,
  ): Promise<WorkoutTemplateDto> {
    const tpl = await this.prisma.workoutTemplate.findUnique({
      where: { id: templateId },
      include: {
        exercises: {
          orderBy: { orderIndex: 'asc' },
          include: { exercise: true },
        },
      },
    });
    if (!tpl) {
      throw new NotFoundException('Workout template not found');
    }
    if (tpl.userId !== userId) {
      throw new ForbiddenException('Access denied to this workout template');
    }
    return localizeTemplate(this.mapTemplateDto(tpl), locale);
  }

  /**
   * Row data for a template exercise. With an explicit per-set plan the summary columns are
   * derived from it, so older clients reading only the summary still see the same workout.
   */
  private templateExerciseData(ex: TemplateExerciseInputDto, idx: number) {
    const sets = ex.sets && ex.sets.length > 0 ? ex.sets : null;
    const summary = sets ? summarizeTemplateSets(sets) : null;
    return {
      exerciseId: ex.exerciseId,
      orderIndex: ex.orderIndex ?? idx,
      // Rows are always re-created on update, so omitting the column stores NULL.
      ...(sets ? { sets } : {}),
      plannedSets: summary?.plannedSets ?? ex.plannedSets,
      warmupSets: summary?.warmupSets ?? ex.warmupSets ?? 0,
      targetRepsMin: ex.targetRepsMin ?? null,
      targetRepsMax: ex.targetRepsMax ?? null,
      targetWeight: summary ? summary.targetWeight : (ex.targetWeight ?? null),
      weightUnit: ex.weightUnit,
      restSeconds: ex.restSeconds,
      targetDurationSeconds: ex.targetDurationSeconds ?? null,
      targetDistanceMeters: ex.targetDistanceMeters ?? null,
      notes: ex.notes ?? null,
      alternativeExerciseIds: ex.alternativeExerciseIds ?? [],
    };
  }

  async createTemplate(
    userId: string,
    dto: CreateTemplateDto,
    locale: SupportedLocale,
  ): Promise<WorkoutTemplateDto> {
    if (dto.folderId) {
      const folder = await this.prisma.workoutFolder.findUnique({
        where: { id: dto.folderId },
      });
      if (!folder || folder.userId !== userId) {
        throw new ForbiddenException('Invalid target folder');
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const tpl = await tx.workoutTemplate.create({
        data: {
          userId,
          folderId: dto.folderId ?? null,
          name: dto.name.trim(),
          description: dto.description ?? null,
          estimatedDurationMinutes: dto.estimatedDurationMinutes ?? 60,
          sortOrder: dto.sortOrder ?? 0,
        },
      });

      for (const [idx, ex] of (dto.exercises ?? []).entries()) {
        await tx.workoutTemplateExercise.create({
          data: { templateId: tpl.id, ...this.templateExerciseData(ex, idx) },
        });
      }

      return tx.workoutTemplate.findUniqueOrThrow({
        where: { id: tpl.id },
        include: {
          exercises: {
            orderBy: { orderIndex: 'asc' },
            include: { exercise: true },
          },
        },
      });
    });

    return localizeTemplate(this.mapTemplateDto(created), locale);
  }

  async updateTemplate(
    userId: string,
    templateId: string,
    dto: UpdateTemplateDto,
    locale: SupportedLocale,
  ): Promise<WorkoutTemplateDto> {
    const existing = await this.prisma.workoutTemplate.findUnique({
      where: { id: templateId },
      include: { exercises: { orderBy: { orderIndex: 'asc' }, include: { exercise: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Workout template not found');
    }
    if (existing.userId !== userId) {
      throw new ForbiddenException('Access denied to this workout template');
    }

    if (dto.folderId) {
      const folder = await this.prisma.workoutFolder.findUnique({
        where: { id: dto.folderId },
      });
      if (!folder || folder.userId !== userId) {
        throw new ForbiddenException('Invalid target folder');
      }
    }

    // Editing the text of a starter copy turns it into user content: persist what the user sees
    // (the localized catalog text) for every field they did not change, and unlink it.
    const detach =
      existing.systemKey &&
      (dto.name !== undefined || dto.description !== undefined || dto.exercises !== undefined)
        ? localizeTemplate(this.mapTemplateDto(existing), locale)
        : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.workoutTemplate.update({
        where: { id: templateId },
        data: {
          ...(detach
            ? { systemKey: null, name: detach.name, description: detach.description }
            : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.folderId !== undefined ? { folderId: dto.folderId } : {}),
          ...(dto.estimatedDurationMinutes !== undefined
            ? { estimatedDurationMinutes: dto.estimatedDurationMinutes }
            : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      });

      if (detach && dto.exercises === undefined) {
        for (const te of detach.exercises) {
          await tx.workoutTemplateExercise.update({
            where: { id: te.id },
            data: { notes: te.notes },
          });
        }
      }

      if (dto.exercises !== undefined) {
        await tx.workoutTemplateExercise.deleteMany({ where: { templateId } });
        for (const [idx, ex] of dto.exercises.entries()) {
          await tx.workoutTemplateExercise.create({
            data: { templateId, ...this.templateExerciseData(ex, idx) },
          });
        }
      }

      return tx.workoutTemplate.findUniqueOrThrow({
        where: { id: templateId },
        include: {
          exercises: {
            orderBy: { orderIndex: 'asc' },
            include: { exercise: true },
          },
        },
      });
    });

    return localizeTemplate(this.mapTemplateDto(updated), locale);
  }

  async duplicateTemplate(
    userId: string,
    templateId: string,
    locale: SupportedLocale,
  ): Promise<WorkoutTemplateDto> {
    const source = await this.getTemplateById(userId, templateId, locale);

    const siblings = await this.prisma.workoutTemplate.findMany({
      where: { userId, folderId: source.folderId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });

    const sourceIdx = siblings.findIndex((s) => s.id === source.id);
    const targetSortOrder = sourceIdx >= 0 ? sourceIdx + 1 : siblings.length;

    const duplicated = await this.createTemplate(
      userId,
      {
        name: `${source.name} (Copy)`,
        description: source.description,
        folderId: source.folderId,
        estimatedDurationMinutes: source.estimatedDurationMinutes ?? 60,
        sortOrder: targetSortOrder,
        exercises: source.exercises.map((ex, idx) => ({
          exerciseId: ex.exerciseId,
          sets: ex.sets ?? null,
          orderIndex: idx,
          plannedSets: ex.plannedSets,
          warmupSets: ex.warmupSets,
          targetRepsMin: ex.targetRepsMin,
          targetRepsMax: ex.targetRepsMax,
          targetWeight: ex.targetWeight,
          weightUnit: ex.weightUnit,
          restSeconds: ex.restSeconds,
          targetDurationSeconds: ex.targetDurationSeconds,
          targetDistanceMeters: ex.targetDistanceMeters,
          notes: ex.notes,
          alternativeExerciseIds: ex.alternativeExerciseIds,
        })),
      },
      locale,
    );

    if (siblings.length > 0) {
      const orderedIds = siblings.map((s) => s.id);
      if (sourceIdx >= 0) {
        orderedIds.splice(sourceIdx + 1, 0, duplicated.id);
      } else {
        orderedIds.push(duplicated.id);
      }
      await this.prisma.$transaction(async (tx) => {
        for (const [idx, id] of orderedIds.entries()) {
          await tx.workoutTemplate.update({
            where: { id },
            data: { sortOrder: idx },
          });
        }
      });
      duplicated.sortOrder = targetSortOrder;
    }

    return duplicated;
  }

  async moveTemplate(
    userId: string,
    templateId: string,
    folderId: string | null,
    locale: SupportedLocale,
  ): Promise<WorkoutTemplateDto> {
    return this.updateTemplate(userId, templateId, { folderId }, locale);
  }

  async deleteTemplate(userId: string, templateId: string): Promise<{ success: boolean }> {
    const existing = await this.prisma.workoutTemplate.findUnique({
      where: { id: templateId },
    });
    if (!existing) {
      throw new NotFoundException('Workout template not found');
    }
    if (existing.userId !== userId) {
      throw new ForbiddenException('Access denied to this workout template');
    }

    await this.prisma.workoutTemplate.delete({ where: { id: templateId } });
    return { success: true };
  }

  private mapFolderDto(
    folder: {
      id: string;
      systemKey: string | null;
      userId: string;
      name: string;
      color: string;
      sortOrder: number;
      templates: Parameters<WorkoutService['mapTemplateDto']>[0][];
    },
    locale: SupportedLocale,
  ): WorkoutFolderDto {
    return localizeFolder(
      {
        id: folder.id,
        systemKey: folder.systemKey,
        userId: folder.userId,
        name: folder.name,
        color: folder.color,
        sortOrder: folder.sortOrder,
        templates: folder.templates.map((t) => this.mapTemplateDto(t)),
      },
      locale,
    );
  }

  /** The JSON column is untrusted input from the DB's point of view: validate before use. */
  private parseTemplateSets(raw: unknown): WorkoutTemplateDto['exercises'][number]['sets'] {
    if (raw === null || raw === undefined) return null;
    const parsed = TemplateSetSchema.array().safeParse(raw);
    return parsed.success && parsed.data.length > 0 ? parsed.data : null;
  }

  /**
   * Applies a finished workout to the template it was started from (structure, set types,
   * logged weights/reps). Runs when the completed session is first synced, so it also works
   * for workouts finished offline. No-op when nothing changed or the template is not the user's.
   */
  async applyCompletedSessionToTemplate(
    userId: string,
    session: WorkoutSessionDto,
    locale: SupportedLocale,
  ): Promise<void> {
    if (!session.templateId) return;
    const tpl = await this.prisma.workoutTemplate.findUnique({
      where: { id: session.templateId },
      include: { exercises: { orderBy: { orderIndex: 'asc' }, include: { exercise: true } } },
    });
    if (!tpl || tpl.userId !== userId) return;

    const exercises = buildTemplateExercisesFromSession(this.mapTemplateDto(tpl), session);
    if (!exercises) return;

    const knownIds = new Set(
      (
        await this.prisma.exercise.findMany({
          where: { id: { in: exercises.map((e) => e.exerciseId) } },
          select: { id: true },
        })
      ).map((e) => e.id),
    );
    await this.updateTemplate(
      userId,
      tpl.id,
      { exercises: exercises.filter((e) => knownIds.has(e.exerciseId)) },
      locale,
    );
  }

  private mapTemplateDto(tpl: {
    id: string;
    systemKey?: string | null;
    userId: string;
    folderId: string | null;
    name: string;
    description: string | null;
    estimatedDurationMinutes: number | null;
    sortOrder: number;
    createdAt: Date | string;
    updatedAt: Date | string;
    exercises?: Array<{
      id: string;
      templateId: string;
      exerciseId: string;
      sets?: unknown;
      orderIndex: number;
      plannedSets: number;
      warmupSets: number;
      targetRepsMin: number | null;
      targetRepsMax: number | null;
      targetWeight: number | null;
      weightUnit: string;
      restSeconds: number;
      targetDurationSeconds: number | null;
      targetDistanceMeters: number | null;
      notes: string | null;
      alternativeExerciseIds?: string[];
      exercise?: {
        id: string;
        slug: string;
        userId: string | null;
        name: string;
        description: string;
        instructions?: string[];
        category: string;
        exerciseType: string;
        primaryMuscleGroup: string;
        equipment: string;
        recommendedDurationSeconds: number | null;
        tags?: string[];
        isSystem: boolean;
      } | null;
    }>;
  }): WorkoutTemplateDto {
    return {
      id: tpl.id,
      systemKey: tpl.systemKey ?? null,
      userId: tpl.userId,
      folderId: tpl.folderId,
      name: tpl.name,
      description: tpl.description,
      estimatedDurationMinutes: tpl.estimatedDurationMinutes,
      sortOrder: tpl.sortOrder,
      createdAt: tpl.createdAt instanceof Date ? tpl.createdAt.toISOString() : tpl.createdAt,
      updatedAt: tpl.updatedAt instanceof Date ? tpl.updatedAt.toISOString() : tpl.updatedAt,
      exercises: (tpl.exercises ?? []).map((e) => ({
        id: e.id,
        templateId: e.templateId,
        exerciseId: e.exerciseId,
        sets: this.parseTemplateSets(e.sets),
        orderIndex: e.orderIndex,
        plannedSets: e.plannedSets,
        warmupSets: e.warmupSets,
        targetRepsMin: e.targetRepsMin,
        targetRepsMax: e.targetRepsMax,
        targetWeight: e.targetWeight,
        weightUnit: e.weightUnit as WorkoutTemplateDto['exercises'][number]['weightUnit'],
        restSeconds: e.restSeconds,
        targetDurationSeconds: e.targetDurationSeconds,
        targetDistanceMeters: e.targetDistanceMeters,
        notes: e.notes,
        alternativeExerciseIds: e.alternativeExerciseIds ?? [],
        exercise: e.exercise
          ? {
              id: e.exercise.id,
              slug: e.exercise.slug,
              userId: e.exercise.userId,
              name: e.exercise.name,
              description: e.exercise.description,
              instructions: e.exercise.instructions ?? [],
              category: e.exercise.category as NonNullable<
                WorkoutTemplateDto['exercises'][number]['exercise']
              >['category'],
              exerciseType: e.exercise.exerciseType as NonNullable<
                WorkoutTemplateDto['exercises'][number]['exercise']
              >['exerciseType'],
              primaryMuscleGroup: e.exercise.primaryMuscleGroup as NonNullable<
                WorkoutTemplateDto['exercises'][number]['exercise']
              >['primaryMuscleGroup'],
              secondaryMuscleGroups: [],
              equipment: e.exercise.equipment as NonNullable<
                WorkoutTemplateDto['exercises'][number]['exercise']
              >['equipment'],
              recommendedDurationSeconds: e.exercise.recommendedDurationSeconds,
              tags: e.exercise.tags ?? [],
              isSystem: e.exercise.isSystem,
              alternativeExerciseIds: e.alternativeExerciseIds ?? [],
              media: resolveExerciseMedia({
                id: e.exercise.id,
                slug: e.exercise.slug,
                name: e.exercise.name,
                primaryMuscleGroup: e.exercise.primaryMuscleGroup as NonNullable<
                  WorkoutTemplateDto['exercises'][number]['exercise']
                >['primaryMuscleGroup'],
                isSystem: e.exercise.isSystem,
              }),
            }
          : undefined,
      })),
    };
  }
}
