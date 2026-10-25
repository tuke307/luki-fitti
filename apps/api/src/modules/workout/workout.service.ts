import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { resolveExerciseMedia } from '@luki-fitti/common/catalog';
import { DEFAULT_FOLDER_COLOR } from '@luki-fitti/common/utils';
import type {
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

  async getOverview(userId: string): Promise<{
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
      folders: folders.map((f) => ({
        id: f.id,
        userId: f.userId,
        name: f.name,
        color: f.color,
        sortOrder: f.sortOrder,
        templates: f.templates.map((t) => this.mapTemplateDto(t)),
      })),
      unfiledTemplates: unfiled.map((t) => this.mapTemplateDto(t)),
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
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
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

    return {
      id: updated.id,
      userId: updated.userId,
      name: updated.name,
      color: updated.color,
      sortOrder: updated.sortOrder,
      templates: updated.templates.map((t) => this.mapTemplateDto(t)),
    };
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

  async getTemplateById(userId: string, templateId: string): Promise<WorkoutTemplateDto> {
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
    return this.mapTemplateDto(tpl);
  }

  async createTemplate(userId: string, dto: CreateTemplateDto): Promise<WorkoutTemplateDto> {
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
          data: {
            templateId: tpl.id,
            exerciseId: ex.exerciseId,
            orderIndex: ex.orderIndex ?? idx,
            plannedSets: ex.plannedSets,
            warmupSets: ex.warmupSets ?? 0,
            targetRepsMin: ex.targetRepsMin ?? null,
            targetRepsMax: ex.targetRepsMax ?? null,
            targetWeight: ex.targetWeight ?? null,
            weightUnit: ex.weightUnit,
            restSeconds: ex.restSeconds,
            targetDurationSeconds: ex.targetDurationSeconds ?? null,
            targetDistanceMeters: ex.targetDistanceMeters ?? null,
            notes: ex.notes ?? null,
            alternativeExerciseIds: ex.alternativeExerciseIds ?? [],
          },
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

    return this.mapTemplateDto(created);
  }

  async updateTemplate(
    userId: string,
    templateId: string,
    dto: UpdateTemplateDto,
  ): Promise<WorkoutTemplateDto> {
    const existing = await this.prisma.workoutTemplate.findUnique({
      where: { id: templateId },
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

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.workoutTemplate.update({
        where: { id: templateId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.folderId !== undefined ? { folderId: dto.folderId } : {}),
          ...(dto.estimatedDurationMinutes !== undefined
            ? { estimatedDurationMinutes: dto.estimatedDurationMinutes }
            : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      });

      if (dto.exercises !== undefined) {
        await tx.workoutTemplateExercise.deleteMany({ where: { templateId } });
        for (const [idx, ex] of dto.exercises.entries()) {
          await tx.workoutTemplateExercise.create({
            data: {
              templateId,
              exerciseId: ex.exerciseId,
              orderIndex: ex.orderIndex ?? idx,
              plannedSets: ex.plannedSets,
              warmupSets: ex.warmupSets ?? 0,
              targetRepsMin: ex.targetRepsMin ?? null,
              targetRepsMax: ex.targetRepsMax ?? null,
              targetWeight: ex.targetWeight ?? null,
              weightUnit: ex.weightUnit,
              restSeconds: ex.restSeconds,
              targetDurationSeconds: ex.targetDurationSeconds ?? null,
              targetDistanceMeters: ex.targetDistanceMeters ?? null,
              notes: ex.notes ?? null,
              alternativeExerciseIds: ex.alternativeExerciseIds ?? [],
            },
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

    return this.mapTemplateDto(updated);
  }

  async duplicateTemplate(userId: string, templateId: string): Promise<WorkoutTemplateDto> {
    const source = await this.getTemplateById(userId, templateId);

    const siblings = await this.prisma.workoutTemplate.findMany({
      where: { userId, folderId: source.folderId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });

    const sourceIdx = siblings.findIndex((s) => s.id === source.id);
    const targetSortOrder = sourceIdx >= 0 ? sourceIdx + 1 : siblings.length;

    const duplicated = await this.createTemplate(userId, {
      name: `${source.name} (Copy)`,
      description: source.description,
      folderId: source.folderId,
      estimatedDurationMinutes: source.estimatedDurationMinutes ?? 60,
      sortOrder: targetSortOrder,
      exercises: source.exercises.map((ex, idx) => ({
        exerciseId: ex.exerciseId,
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
    });

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
  ): Promise<WorkoutTemplateDto> {
    return this.updateTemplate(userId, templateId, { folderId });
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

  private mapTemplateDto(tpl: {
    id: string;
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
              }),
            }
          : undefined,
      })),
    };
  }
}
