import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  INITIAL_EXERCISE_CATALOG,
  localizeExercise,
  resolveExerciseMedia,
} from '@luki-fitti/common/catalog';
import type {
  CreateExerciseDto,
  ExerciseDto,
  ExerciseQueryDto,
  UpdateExerciseDto,
} from '@luki-fitti/common/schemas';
import type { MuscleGroup, SupportedLocale } from '@luki-fitti/common/enums';

@Injectable()
export class ExerciseService {
  private seeded = false;

  constructor(private readonly prisma: PrismaService) {}

  private async ensureCatalogSeeded(): Promise<void> {
    if (this.seeded) return;
    const count = await this.prisma.exercise.count({ where: { isSystem: true } });
    if (count < INITIAL_EXERCISE_CATALOG.length) {
      for (const item of INITIAL_EXERCISE_CATALOG) {
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

        for (const sec of item.secondaryMuscleGroups) {
          await this.prisma.exerciseMuscleGroup.upsert({
            where: {
              exerciseId_muscleGroup: {
                exerciseId: item.id,
                muscleGroup: sec,
              },
            },
            update: {},
            create: {
              exerciseId: item.id,
              muscleGroup: sec,
              isPrimary: false,
            },
          });
        }
      }

      for (const item of INITIAL_EXERCISE_CATALOG) {
        for (const altId of item.alternativeExerciseIds) {
          await this.prisma.exerciseAlternative.upsert({
            where: {
              exerciseId_alternativeExerciseId: {
                exerciseId: item.id,
                alternativeExerciseId: altId,
              },
            },
            update: {},
            create: {
              exerciseId: item.id,
              alternativeExerciseId: altId,
              reason: 'Biomechanical / equipment alternative',
            },
          });
        }
      }
    }
    this.seeded = true;
  }

  async findAll(
    userId: string | null,
    query: ExerciseQueryDto,
    locale: SupportedLocale,
  ): Promise<ExerciseDto[]> {
    await this.ensureCatalogSeeded();

    const records = await this.prisma.exercise.findMany({
      where: {
        OR: [{ isSystem: true }, ...(userId ? [{ userId }] : [])],
        ...(query.exerciseType ? { exerciseType: query.exerciseType } : {}),
        ...(query.equipment ? { equipment: query.equipment } : {}),
        ...(query.category ? { category: query.category } : {}),
        ...(query.muscleGroup
          ? {
              OR: [
                { primaryMuscleGroup: query.muscleGroup },
                { muscleGroups: { some: { muscleGroup: query.muscleGroup } } },
              ],
            }
          : {}),
      },
      include: {
        muscleGroups: true,
        alternatives: {
          include: {
            alternativeExercise: true,
          },
        },
        media: true,
      },
    });

    const mapped = records
      .map((r) => this.mapExerciseDto(r, locale))
      .sort(
        (a, b) => Number(b.isSystem) - Number(a.isSystem) || a.name.localeCompare(b.name, locale),
      );

    if (query.search?.trim()) {
      const q = query.search.trim().toLowerCase();
      return mapped.filter(
        (ex) =>
          ex.name.toLowerCase().includes(q) ||
          ex.description.toLowerCase().includes(q) ||
          ex.primaryMuscleGroup.toLowerCase().includes(q) ||
          ex.equipment.toLowerCase().includes(q) ||
          ex.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    return mapped;
  }

  async findById(userId: string | null, id: string, locale: SupportedLocale): Promise<ExerciseDto> {
    await this.ensureCatalogSeeded();
    const record = await this.prisma.exercise.findFirst({
      where: {
        id,
        OR: [{ isSystem: true }, ...(userId ? [{ userId }] : [])],
      },
      include: {
        muscleGroups: true,
        alternatives: {
          include: { alternativeExercise: true },
        },
        media: true,
      },
    });

    if (!record) {
      throw new NotFoundException('Exercise not found');
    }

    return this.mapExerciseDto(record, locale);
  }

  async createCustom(
    userId: string,
    dto: CreateExerciseDto,
    locale: SupportedLocale,
  ): Promise<ExerciseDto> {
    const baseSlug = dto.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    const created = await this.prisma.$transaction(async (tx) => {
      const ex = await tx.exercise.create({
        data: {
          slug,
          userId,
          name: dto.name,
          description: dto.description,
          instructions: dto.instructions ?? [],
          category: dto.category,
          exerciseType: dto.exerciseType,
          primaryMuscleGroup: dto.primaryMuscleGroup,
          equipment: dto.equipment,
          recommendedDurationSeconds: dto.recommendedDurationSeconds ?? null,
          tags: dto.tags ?? [],
          isSystem: false,
        },
      });

      await tx.exerciseMuscleGroup.create({
        data: {
          exerciseId: ex.id,
          muscleGroup: dto.primaryMuscleGroup,
          isPrimary: true,
        },
      });

      for (const sec of dto.secondaryMuscleGroups ?? []) {
        if (sec !== dto.primaryMuscleGroup) {
          await tx.exerciseMuscleGroup.create({
            data: {
              exerciseId: ex.id,
              muscleGroup: sec,
              isPrimary: false,
            },
          });
        }
      }

      for (const altId of dto.alternativeExerciseIds ?? []) {
        await tx.exerciseAlternative.create({
          data: {
            exerciseId: ex.id,
            alternativeExerciseId: altId,
          },
        });
      }

      if (dto.mediaUrl?.trim()) {
        await tx.exerciseMedia.create({
          data: {
            exerciseId: ex.id,
            mediaType: dto.mediaUrl.toLowerCase().endsWith('.gif') ? 'GIF' : 'IMAGE',
            url: dto.mediaUrl.trim(),
            caption: `${dto.name} demonstration`,
            sortOrder: 0,
          },
        });
      }

      return tx.exercise.findUniqueOrThrow({
        where: { id: ex.id },
        include: {
          muscleGroups: true,
          alternatives: { include: { alternativeExercise: true } },
          media: true,
        },
      });
    });

    return this.mapExerciseDto(created, locale);
  }

  async updateCustom(
    userId: string,
    exerciseId: string,
    dto: UpdateExerciseDto,
    locale: SupportedLocale,
  ): Promise<ExerciseDto> {
    const existing = await this.prisma.exercise.findUnique({ where: { id: exerciseId } });
    if (!existing) {
      throw new NotFoundException('Exercise not found');
    }
    if (existing.isSystem || existing.userId !== userId) {
      throw new ForbiddenException('You can only edit your own custom exercises');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.exercise.update({
        where: { id: exerciseId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.instructions !== undefined ? { instructions: dto.instructions } : {}),
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.exerciseType !== undefined ? { exerciseType: dto.exerciseType } : {}),
          ...(dto.primaryMuscleGroup !== undefined
            ? { primaryMuscleGroup: dto.primaryMuscleGroup }
            : {}),
          ...(dto.equipment !== undefined ? { equipment: dto.equipment } : {}),
          ...(dto.recommendedDurationSeconds !== undefined
            ? { recommendedDurationSeconds: dto.recommendedDurationSeconds }
            : {}),
          ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        },
      });

      if (dto.secondaryMuscleGroups !== undefined || dto.primaryMuscleGroup !== undefined) {
        const primary = dto.primaryMuscleGroup ?? existing.primaryMuscleGroup;
        await tx.exerciseMuscleGroup.deleteMany({ where: { exerciseId } });
        await tx.exerciseMuscleGroup.create({
          data: { exerciseId, muscleGroup: primary, isPrimary: true },
        });
        for (const sec of dto.secondaryMuscleGroups ?? []) {
          if (sec !== primary) {
            await tx.exerciseMuscleGroup.create({
              data: { exerciseId, muscleGroup: sec, isPrimary: false },
            });
          }
        }
      }

      if (dto.alternativeExerciseIds !== undefined) {
        await tx.exerciseAlternative.deleteMany({ where: { exerciseId } });
        for (const altId of dto.alternativeExerciseIds) {
          await tx.exerciseAlternative.create({
            data: { exerciseId, alternativeExerciseId: altId },
          });
        }
      }

      return tx.exercise.findUniqueOrThrow({
        where: { id: exerciseId },
        include: {
          muscleGroups: true,
          alternatives: { include: { alternativeExercise: true } },
          media: true,
        },
      });
    });

    return this.mapExerciseDto(updated, locale);
  }

  async deleteCustom(userId: string, exerciseId: string): Promise<{ success: boolean }> {
    const existing = await this.prisma.exercise.findUnique({ where: { id: exerciseId } });
    if (!existing) {
      throw new NotFoundException('Exercise not found');
    }
    if (existing.isSystem || existing.userId !== userId) {
      throw new ForbiddenException('You can only delete your own custom exercises');
    }

    await this.prisma.exercise.delete({ where: { id: exerciseId } });
    return { success: true };
  }

  private mapExerciseDto(record: any, locale: SupportedLocale): ExerciseDto {
    const catalogFallback = INITIAL_EXERCISE_CATALOG.find((c) => c.id === record.id);
    const secondaryFromDb = (record.muscleGroups ?? [])
      .filter((m: any) => !m.isPrimary && m.muscleGroup !== record.primaryMuscleGroup)
      .map((m: any) => m.muscleGroup as MuscleGroup);

    const secondaryMuscleGroups =
      secondaryFromDb.length > 0 ? secondaryFromDb : (catalogFallback?.secondaryMuscleGroups ?? []);

    const alternativesFromDb = (record.alternatives ?? []).map((a: any) => ({
      id: a.alternativeExercise.id,
      name: a.alternativeExercise.name,
      equipment: a.alternativeExercise.equipment,
      primaryMuscleGroup: a.alternativeExercise.primaryMuscleGroup,
      reason: a.reason,
    }));

    const alternativeExerciseIds =
      alternativesFromDb.length > 0
        ? alternativesFromDb.map((a: any) => a.id)
        : (catalogFallback?.alternativeExerciseIds ?? []);

    return localizeExercise(
      {
        id: record.id,
        slug: record.slug,
        userId: record.userId,
        name: record.name,
        description: record.description,
        instructions: record.instructions ?? [],
        category: record.category,
        exerciseType: record.exerciseType,
        primaryMuscleGroup: record.primaryMuscleGroup,
        secondaryMuscleGroups,
        equipment: record.equipment,
        recommendedDurationSeconds: record.recommendedDurationSeconds,
        tags: record.tags ?? [],
        isSystem: record.isSystem,
        alternativeExerciseIds,
        alternatives: alternativesFromDb,
        media:
          record.media && record.media.length > 0
            ? record.media
            : resolveExerciseMedia({
                id: record.id,
                slug: record.slug,
                name: record.name,
                primaryMuscleGroup: record.primaryMuscleGroup,
              }),
      },
      locale,
    );
  }
}
