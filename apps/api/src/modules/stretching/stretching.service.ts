import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  DEFAULT_STRETCHING_ROUTINES,
  INITIAL_EXERCISE_CATALOG,
  resolveExerciseMedia,
} from '@luki-fitti/common/catalog';
import type {
  CreateStretchingRoutineDto,
  UpdateStretchingRoutineDto,
  StretchingRoutineDto,
} from '@luki-fitti/common/schemas';

@Injectable()
export class StretchingService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureDefaultRoutinesForUser(userId: string): Promise<void> {
    if (!this.prisma.stretchingRoutine?.findMany) return;
    const existing = await this.prisma.stretchingRoutine.findMany({
      where: { userId },
      select: { name: true },
    });
    const existingNames = new Set(existing.map((r) => r.name.toLowerCase()));
    const missingRoutines = DEFAULT_STRETCHING_ROUTINES.filter(
      (r) => !existingNames.has(r.name.toLowerCase()),
    );
    if (missingRoutines.length === 0) return;

    // Ensure referenced stretching exercises exist in Exercise table
    if (this.prisma.exercise?.upsert) {
      const stretchCatalog = INITIAL_EXERCISE_CATALOG.filter((e) =>
        missingRoutines.some((r) => r.exercises.some((re) => re.exerciseId === e.id)),
      );
      for (const item of stretchCatalog) {
        await this.prisma.exercise.upsert({
          where: { slug: item.slug },
          update: {},
          create: {
            id: item.id,
            slug: item.slug,
            name: item.name,
            description: item.description,
            instructions: item.instructions,
            category: item.category,
            exerciseType: item.exerciseType,
            primaryMuscleGroup: item.primaryMuscleGroup,
            equipment: item.equipment,
            recommendedDurationSeconds: item.recommendedDurationSeconds,
            tags: item.tags,
            isSystem: true,
          },
        });
      }
    }

    for (const def of missingRoutines) {
      await this.prisma.$transaction(async (tx) => {
        const created = await tx.stretchingRoutine.create({
          data: {
            userId,
            name: def.name,
            description: def.description,
            targetArea: def.targetArea,
            estimatedDurationSeconds: def.estimatedDurationSeconds,
            isSystem: true,
          },
        });
        for (const ex of def.exercises) {
          const foundEx = await tx.exercise?.findFirst?.({
            where: {
              OR: [{ id: ex.exerciseId }, { slug: ex.exerciseId.replace(/^ex-/, '') }],
            },
            select: { id: true },
          });
          const resolvedExId = foundEx?.id ?? ex.exerciseId;
          await tx.stretchingRoutineExercise.create({
            data: {
              routineId: created.id,
              exerciseId: resolvedExId,
              orderIndex: ex.orderIndex,
              sets: ex.sets,
              durationSeconds: ex.durationSeconds,
              reps: ex.reps,
              transitionSeconds: ex.transitionSeconds,
              notes: ex.notes,
            },
          });
        }
      });
    }
  }

  async findAll(userId: string): Promise<StretchingRoutineDto[]> {
    await this.ensureDefaultRoutinesForUser(userId).catch(() => undefined);
    const routines = await this.prisma.stretchingRoutine.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: {
        exercises: {
          orderBy: { orderIndex: 'asc' },
          include: { exercise: true },
        },
      },
    });

    return routines.map((r) => this.mapRoutineDto(r));
  }

  async findById(userId: string, routineId: string): Promise<StretchingRoutineDto> {
    const routine = await this.prisma.stretchingRoutine.findUnique({
      where: { id: routineId },
      include: {
        exercises: {
          orderBy: { orderIndex: 'asc' },
          include: { exercise: true },
        },
      },
    });
    if (!routine) {
      throw new NotFoundException('Stretching routine not found');
    }
    if (routine.userId !== userId) {
      throw new ForbiddenException('Access denied to this stretching routine');
    }
    return this.mapRoutineDto(routine);
  }

  async create(userId: string, dto: CreateStretchingRoutineDto): Promise<StretchingRoutineDto> {
    const created = await this.prisma.$transaction(async (tx) => {
      const routine = await tx.stretchingRoutine.create({
        data: {
          userId,
          name: dto.name.trim(),
          description: dto.description ?? null,
          targetArea: dto.targetArea ?? 'Full Body',
          estimatedDurationSeconds: dto.estimatedDurationSeconds ?? 600,
        },
      });

      for (const [idx, ex] of (dto.exercises ?? []).entries()) {
        await tx.stretchingRoutineExercise.create({
          data: {
            routineId: routine.id,
            exerciseId: ex.exerciseId,
            orderIndex: ex.orderIndex ?? idx,
            sets: ex.sets ?? 1,
            durationSeconds: ex.durationSeconds ?? 45,
            reps: ex.reps ?? null,
            transitionSeconds: ex.transitionSeconds ?? 15,
            notes: ex.notes ?? null,
          },
        });
      }

      return tx.stretchingRoutine.findUniqueOrThrow({
        where: { id: routine.id },
        include: {
          exercises: {
            orderBy: { orderIndex: 'asc' },
            include: { exercise: true },
          },
        },
      });
    });

    return this.mapRoutineDto(created);
  }

  async update(
    userId: string,
    routineId: string,
    dto: UpdateStretchingRoutineDto,
  ): Promise<StretchingRoutineDto> {
    const existing = await this.prisma.stretchingRoutine.findUnique({
      where: { id: routineId },
    });
    if (!existing) {
      throw new NotFoundException('Stretching routine not found');
    }
    if (existing.userId !== userId) {
      throw new ForbiddenException('Access denied to this stretching routine');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.stretchingRoutine.update({
        where: { id: routineId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.targetArea !== undefined ? { targetArea: dto.targetArea } : {}),
          ...(dto.estimatedDurationSeconds !== undefined
            ? { estimatedDurationSeconds: dto.estimatedDurationSeconds }
            : {}),
        },
      });

      if (dto.exercises !== undefined) {
        await tx.stretchingRoutineExercise.deleteMany({ where: { routineId } });
        for (const [idx, ex] of dto.exercises.entries()) {
          await tx.stretchingRoutineExercise.create({
            data: {
              routineId,
              exerciseId: ex.exerciseId,
              orderIndex: ex.orderIndex ?? idx,
              sets: ex.sets ?? 1,
              durationSeconds: ex.durationSeconds ?? 45,
              reps: ex.reps ?? null,
              transitionSeconds: ex.transitionSeconds ?? 15,
              notes: ex.notes ?? null,
            },
          });
        }
      }

      return tx.stretchingRoutine.findUniqueOrThrow({
        where: { id: routineId },
        include: {
          exercises: {
            orderBy: { orderIndex: 'asc' },
            include: { exercise: true },
          },
        },
      });
    });

    return this.mapRoutineDto(updated);
  }

  async delete(userId: string, routineId: string): Promise<{ success: boolean }> {
    const existing = await this.prisma.stretchingRoutine.findUnique({
      where: { id: routineId },
    });
    if (!existing) {
      throw new NotFoundException('Stretching routine not found');
    }
    if (existing.userId !== userId) {
      throw new ForbiddenException('Access denied to this stretching routine');
    }

    await this.prisma.stretchingRoutine.delete({ where: { id: routineId } });
    return { success: true };
  }

  private mapRoutineDto(routine: any): StretchingRoutineDto {
    return {
      id: routine.id,
      userId: routine.userId,
      name: routine.name,
      description: routine.description,
      targetArea: routine.targetArea,
      estimatedDurationSeconds: routine.estimatedDurationSeconds,
      createdAt:
        routine.createdAt instanceof Date ? routine.createdAt.toISOString() : routine.createdAt,
      updatedAt:
        routine.updatedAt instanceof Date ? routine.updatedAt.toISOString() : routine.updatedAt,
      exercises: (routine.exercises ?? []).map((e: any) => ({
        id: e.id,
        routineId: e.routineId,
        exerciseId: e.exerciseId,
        orderIndex: e.orderIndex,
        sets: e.sets,
        durationSeconds: e.durationSeconds,
        reps: e.reps,
        transitionSeconds: e.transitionSeconds,
        notes: e.notes,
        exercise: e.exercise
          ? {
              id: e.exercise.id,
              slug: e.exercise.slug,
              userId: e.exercise.userId,
              name: e.exercise.name,
              description: e.exercise.description,
              instructions: e.exercise.instructions ?? [],
              category: e.exercise.category,
              exerciseType: e.exercise.exerciseType,
              primaryMuscleGroup: e.exercise.primaryMuscleGroup,
              secondaryMuscleGroups: [],
              equipment: e.exercise.equipment,
              recommendedDurationSeconds: e.exercise.recommendedDurationSeconds,
              tags: e.exercise.tags ?? [],
              isSystem: e.exercise.isSystem,
              alternativeExerciseIds: [],
              media: resolveExerciseMedia({
                id: e.exercise.id,
                slug: e.exercise.slug,
                name: e.exercise.name,
                primaryMuscleGroup: e.exercise.primaryMuscleGroup,
              }),
            }
          : undefined,
      })),
    };
  }
}
