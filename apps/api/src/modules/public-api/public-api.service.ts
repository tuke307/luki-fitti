import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Exercise, ExerciseMuscleGroup } from '@luki-fitti/database';
import {
  BodyGoal,
  BodyWeightSource,
  DistanceUnit,
  EquipmentType,
  ExerciseCategory,
  ExerciseType,
  MealAmountUnit,
  MealType,
  MuscleGroup,
  ProgressPhotoKind,
  ProgressPose,
  SessionExerciseOrigin,
  SessionExerciseStatus,
  SessionSourceDevice,
  SessionStatus,
  SessionType,
  SetType,
  TrainingGoal,
  WeightUnit,
} from '@luki-fitti/common/enums';
import type {
  PublicActivityWorkoutDto,
  PublicBodyWeightEntryDto,
  PublicDailyEnergyDto,
  PublicExerciseDto,
  PublicListDto,
  PublicListQueryDto,
  PublicMealEntryDto,
  PublicMeDto,
  PublicPersonalRecordDto,
  PublicProgressCheckInDto,
  PublicRangeQueryDto,
  PublicSessionDto,
  PublicSessionExerciseDto,
  PublicSessionListItemDto,
  PublicSessionSetDto,
  PublicStretchingRoutineDto,
  PublicWorkoutFolderDto,
  PublicWorkoutTemplateDto,
} from '@luki-fitti/common/schemas';
import { PrismaService } from '../database/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { cursorWhere, decodeCursor, toPage, type Page } from './pagination.util';

const LBS_TO_KG = 0.45359237;

const toKg = (weight: number | null, unit: WeightUnit): number | null =>
  weight === null ? null : unit === WeightUnit.LBS ? weight * LBS_TO_KG : weight;

const iso = (d: Date | null): string | null => d?.toISOString() ?? null;

type SessionRow = Prisma.WorkoutSessionGetPayload<{
  include: { exercises: { include: { sets: true } } };
}>;
type ExerciseRow = Exercise & { muscleGroups: ExerciseMuscleGroup[] };

/**
 * Read-only queries backing `/api/v1`. Every method filters by `userId` — keys
 * can only ever read their owner's data — and maps rows to the stable public
 * DTOs (no `version`, `lastWriterDeviceId`, client ids or userId).
 */
@Injectable()
export class PublicApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

  // ── Profile ──

  async getMe(userId: string): Promise<PublicMeDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { preferences: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const p = user.preferences;
    return {
      id: user.id,
      name: user.name,
      handle: user.handle,
      weightUnit: (p?.weightUnit as WeightUnit | undefined) ?? WeightUnit.KG,
      distanceUnit: (p?.distanceUnit as DistanceUnit | undefined) ?? DistanceUnit.KM,
      goals: {
        weeklyGoalSessions: p?.weeklyGoalSessions ?? 0,
        dailyKcalGoal: p?.dailyKcalGoal ?? null,
        proteinGoalG: p?.proteinGoalG ?? null,
        carbsGoalG: p?.carbsGoalG ?? null,
        fatGoalG: p?.fatGoalG ?? null,
        bodyWeightKg: p?.bodyWeightKg ?? null,
        heightCm: p?.heightCm ?? null,
        bodyGoal: (p?.bodyGoal as BodyGoal | null | undefined) ?? null,
        trainingGoal: (p?.trainingGoal as TrainingGoal | null | undefined) ?? null,
      },
    };
  }

  // ── Sessions ──

  async listSessions(
    userId: string,
    query: PublicRangeQueryDto,
  ): Promise<PublicListDto<PublicSessionListItemDto>> {
    const page = await this.paginate(
      this.prisma.workoutSession.findMany({
        where: {
          userId,
          ...(query.from || query.to
            ? {
                startedAt: {
                  ...(query.from ? { gte: new Date(query.from) } : {}),
                  ...(query.to ? { lte: new Date(query.to) } : {}),
                },
              }
            : {}),
          AND: this.listFilters<Prisma.WorkoutSessionWhereInput>(query),
        },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: query.limit + 1,
      }),
      query,
    );
    return { data: page.data.map((s) => this.toSessionListItem(s)), nextCursor: page.nextCursor };
  }

  async getSession(userId: string, id: string): Promise<PublicSessionDto> {
    const session = await this.prisma.workoutSession.findFirst({
      where: { id, userId },
      include: { exercises: { include: { sets: true }, orderBy: { orderIndex: 'asc' } } },
    });
    if (!session) throw new NotFoundException('Session not found');
    return this.toSession(session);
  }

  async listPersonalRecords(userId: string): Promise<PublicPersonalRecordDto[]> {
    const summary = await this.analytics.getSummary(userId, { period: 'all' });
    return summary.personalRecords;
  }

  // ── Workouts ──

  async listWorkouts(
    userId: string,
    query: PublicListQueryDto,
  ): Promise<PublicListDto<PublicWorkoutTemplateDto>> {
    const page = await this.paginate(
      this.prisma.workoutTemplate.findMany({
        where: { userId, AND: this.listFilters<Prisma.WorkoutTemplateWhereInput>(query) },
        include: { exercises: { include: { exercise: true }, orderBy: { orderIndex: 'asc' } } },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: query.limit + 1,
      }),
      query,
    );
    return {
      data: page.data.map((t) => ({
        id: t.id,
        folderId: t.folderId,
        name: t.name,
        description: t.description,
        estimatedDurationMinutes: t.estimatedDurationMinutes,
        sortOrder: t.sortOrder,
        trainingGoal: t.trainingGoal as TrainingGoal | null,
        exercises: t.exercises.map((e) => ({
          exerciseId: e.exerciseId,
          exerciseName: e.exercise.name,
          orderIndex: e.orderIndex,
          plannedSets: e.plannedSets,
          warmupSets: e.warmupSets,
          targetRepsMin: e.targetRepsMin,
          targetRepsMax: e.targetRepsMax,
          targetWeightKg: toKg(e.targetWeight, e.weightUnit as WeightUnit),
          restSeconds: e.restSeconds,
          targetDurationSeconds: e.targetDurationSeconds,
          targetDistanceMeters: e.targetDistanceMeters,
          notes: e.notes,
        })),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }

  async listFolders(
    userId: string,
    query: PublicListQueryDto,
  ): Promise<PublicListDto<PublicWorkoutFolderDto>> {
    const page = await this.paginate(
      this.prisma.workoutFolder.findMany({
        where: { userId, AND: this.listFilters<Prisma.WorkoutFolderWhereInput>(query) },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: query.limit + 1,
      }),
      query,
    );
    return {
      data: page.data.map((f) => ({
        id: f.id,
        name: f.name,
        color: f.color,
        sortOrder: f.sortOrder,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }

  async listStretchingRoutines(
    userId: string,
    query: PublicListQueryDto,
  ): Promise<PublicListDto<PublicStretchingRoutineDto>> {
    const page = await this.paginate(
      this.prisma.stretchingRoutine.findMany({
        where: { userId, AND: this.listFilters<Prisma.StretchingRoutineWhereInput>(query) },
        include: { exercises: { include: { exercise: true }, orderBy: { orderIndex: 'asc' } } },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: query.limit + 1,
      }),
      query,
    );
    return {
      data: page.data.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        targetArea: r.targetArea,
        estimatedDurationSeconds: r.estimatedDurationSeconds,
        exercises: r.exercises.map((e) => ({
          exerciseId: e.exerciseId,
          exerciseName: e.exercise.name,
          orderIndex: e.orderIndex,
          sets: e.sets,
          durationSeconds: e.durationSeconds,
          reps: e.reps,
          transitionSeconds: e.transitionSeconds,
          notes: e.notes,
        })),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }

  async listExercises(
    userId: string,
    query: PublicListQueryDto,
    customOnly: boolean,
  ): Promise<PublicListDto<PublicExerciseDto>> {
    const where: Prisma.ExerciseWhereInput = customOnly
      ? { userId, isSystem: false, AND: this.listFilters<Prisma.ExerciseWhereInput>(query) }
      : {
          AND: [
            { OR: [{ userId }, { isSystem: true }] },
            ...this.listFilters<Prisma.ExerciseWhereInput>(query),
          ],
        };
    const page = await this.paginate(
      this.prisma.exercise.findMany({
        where,
        include: { muscleGroups: true },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: query.limit + 1,
      }),
      query,
    );
    return { data: page.data.map((e) => this.toExercise(e)), nextCursor: page.nextCursor };
  }

  // ── Nutrition ──

  async listMeals(
    userId: string,
    query: PublicRangeQueryDto,
  ): Promise<PublicListDto<PublicMealEntryDto>> {
    const page = await this.paginate(
      this.prisma.mealEntry.findMany({
        where: {
          userId,
          ...(query.from || query.to
            ? {
                eatenAt: {
                  ...(query.from ? { gte: new Date(query.from) } : {}),
                  ...(query.to ? { lte: new Date(query.to) } : {}),
                },
              }
            : {}),
          AND: this.listFilters<Prisma.MealEntryWhereInput>(query),
        },
        include: { items: { orderBy: { orderIndex: 'asc' } } },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: query.limit + 1,
      }),
      query,
    );
    return {
      data: page.data.map((m) => ({
        id: m.id,
        eatenAt: m.eatenAt.toISOString(),
        mealType: m.mealType as MealType,
        label: m.label,
        notes: m.notes,
        items: m.items.map((i) => ({
          name: i.name,
          grams: i.grams,
          amountUnit: i.amountUnit as MealAmountUnit,
          kcal: i.kcal,
          proteinG: i.proteinG,
          carbsG: i.carbsG,
          fatG: i.fatG,
          fiberG: i.fiberG,
          sugarG: i.sugarG,
        })),
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }

  // ── Body ──

  async listBodyWeight(
    userId: string,
    query: PublicRangeQueryDto,
  ): Promise<PublicListDto<PublicBodyWeightEntryDto>> {
    const page = await this.paginate(
      this.prisma.bodyWeightEntry.findMany({
        where: {
          userId,
          ...(query.from || query.to
            ? {
                measuredAt: {
                  ...(query.from ? { gte: new Date(query.from) } : {}),
                  ...(query.to ? { lte: new Date(query.to) } : {}),
                },
              }
            : {}),
          AND: this.listFilters<Prisma.BodyWeightEntryWhereInput>(query),
        },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: query.limit + 1,
      }),
      query,
    );
    return {
      data: page.data.map((e) => ({
        id: e.id,
        measuredAt: e.measuredAt.toISOString(),
        weightKg: e.weightKg,
        source: e.source as BodyWeightSource,
        note: e.note,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }

  async listProgressCheckIns(
    userId: string,
    query: PublicListQueryDto,
  ): Promise<PublicListDto<PublicProgressCheckInDto>> {
    const page = await this.paginate(
      this.prisma.progressCheckIn.findMany({
        where: { userId, AND: this.listFilters<Prisma.ProgressCheckInWhereInput>(query) },
        include: { photos: { select: { pose: true, kind: true, width: true, height: true } } },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: query.limit + 1,
      }),
      query,
    );
    return {
      data: page.data.map((c) => ({
        id: c.id,
        takenAt: c.takenAt.toISOString(),
        note: c.note,
        photos: c.photos.map((p) => ({
          pose: p.pose as ProgressPose,
          kind: p.kind as ProgressPhotoKind,
          width: p.width,
          height: p.height,
        })),
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }

  // ── Activity ──

  async listDailyEnergy(
    userId: string,
    query: PublicRangeQueryDto,
  ): Promise<PublicListDto<PublicDailyEnergyDto & { id: string }>> {
    const page = await this.paginate(
      this.prisma.healthDailyEnergy.findMany({
        where: {
          userId,
          ...(query.from || query.to
            ? {
                day: {
                  ...(query.from ? { gte: query.from.slice(0, 10) } : {}),
                  ...(query.to ? { lte: query.to.slice(0, 10) } : {}),
                },
              }
            : {}),
          AND: this.listFilters<Prisma.HealthDailyEnergyWhereInput>(query),
        },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: query.limit + 1,
      }),
      query,
    );
    return {
      data: page.data.map((d) => ({ id: d.id, day: d.day, activeKcal: d.activeKcal })),
      nextCursor: page.nextCursor,
    };
  }

  async listActivityWorkouts(
    userId: string,
    query: PublicRangeQueryDto,
  ): Promise<PublicListDto<PublicActivityWorkoutDto>> {
    const page = await this.paginate(
      this.prisma.healthWorkout.findMany({
        where: {
          userId,
          ...(query.from || query.to
            ? {
                startedAt: {
                  ...(query.from ? { gte: new Date(query.from) } : {}),
                  ...(query.to ? { lte: new Date(query.to) } : {}),
                },
              }
            : {}),
          AND: this.listFilters<Prisma.HealthWorkoutWhereInput>(query),
        },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: query.limit + 1,
      }),
      query,
    );
    return {
      data: page.data.map((w) => ({
        id: w.id,
        activityType: w.activityType,
        sourceName: w.sourceName,
        isOwn: w.isOwn,
        startedAt: w.startedAt.toISOString(),
        endedAt: w.endedAt.toISOString(),
        activeKcal: w.activeKcal,
        distanceMeters: w.distanceMeters,
      })),
      nextCursor: page.nextCursor,
    };
  }

  // ── Mappers & shared pagination ──

  /**
   * AND-fragments for `updatedSince` (incremental sync) and `cursor`
   * (position) — applied in the database query, not in memory. Every list is
   * ordered by `updatedAt asc, id asc` and fetches `limit + 1` rows.
   */
  private listFilters<W extends object>(query: PublicListQueryDto): W[] {
    const and: W[] = [];
    if (query.updatedSince) and.push({ updatedAt: { gt: new Date(query.updatedSince) } } as W);
    // Every listed model shares `updatedAt`/`id`, so the fragment type-checks for all of them.
    if (query.cursor) {
      and.push(cursorWhere(decodeCursor(query.cursor)) as W);
    }
    return and;
  }

  private async paginate<T extends { id: string; updatedAt: Date }>(
    rowsPromise: Promise<T[]>,
    query: PublicListQueryDto,
  ): Promise<Page<T>> {
    return toPage(await rowsPromise, query.limit, (r) => r.updatedAt);
  }

  private toSessionListItem(
    s: SessionRow | Prisma.WorkoutSessionGetPayload<object>,
  ): PublicSessionListItemDto {
    return {
      id: s.id,
      templateId: s.templateId,
      stretchingRoutineId: s.stretchingRoutineId,
      sessionType: s.sessionType as SessionType,
      workoutName: s.workoutNameSnapshot,
      status: s.status as SessionStatus,
      startedAt: s.startedAt.toISOString(),
      pausedAt: iso(s.pausedAt),
      completedAt: iso(s.completedAt),
      activeDurationSeconds: s.activeDurationSeconds,
      totalVolumeKg: s.totalVolumeKg,
      totalSetsCompleted: s.totalSetsCompleted,
      totalRepsCompleted: s.totalRepsCompleted,
      totalStretchSeconds: s.totalStretchSeconds,
      notes: s.notes,
      sourceDevice: s.sourceDevice as SessionSourceDevice,
      activeCaloriesKcal: s.activeCaloriesKcal,
      totalCaloriesKcal: s.totalCaloriesKcal,
      estimatedCaloriesKcal: s.estimatedCaloriesKcal,
      avgHeartRateBpm: s.avgHeartRateBpm,
      maxHeartRateBpm: s.maxHeartRateBpm,
      minHeartRateBpm: s.minHeartRateBpm,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }

  private toSession(s: SessionRow): PublicSessionDto {
    return {
      ...this.toSessionListItem(s),
      exercises: s.exercises.map((e) => this.toSessionExercise(e, s.weightUnit as WeightUnit)),
    };
  }

  private toSessionExercise(
    e: SessionRow['exercises'][number],
    sessionWeightUnit: WeightUnit,
  ): PublicSessionExerciseDto {
    return {
      id: e.id,
      exerciseId: e.exerciseId,
      exerciseName: e.exerciseNameSnapshot,
      primaryMuscle: e.primaryMuscleSnapshot as MuscleGroup,
      exerciseType: e.exerciseTypeSnapshot as ExerciseType,
      origin: e.origin as SessionExerciseOrigin,
      status: e.status as SessionExerciseStatus,
      orderIndex: e.orderIndex,
      plannedSets: e.plannedSets,
      plannedWarmupSets: e.plannedWarmupSets,
      targetRepsMin: e.targetRepsMin,
      targetRepsMax: e.targetRepsMax,
      targetWeightKg: toKg(e.targetWeight, sessionWeightUnit),
      targetDurationSeconds: e.targetDurationSeconds,
      restSeconds: e.restSeconds,
      notes: e.notes,
      sets: e.sets.sort((a, b) => a.setNumber - b.setNumber).map((s) => this.toSessionSet(s)),
    };
  }

  private toSessionSet(s: SessionRow['exercises'][number]['sets'][number]): PublicSessionSetDto {
    return {
      setNumber: s.setNumber,
      setType: s.setType as SetType,
      weightKg: toKg(s.weight, s.weightUnit as WeightUnit),
      reps: s.reps,
      durationSeconds: s.durationSeconds,
      distanceMeters: s.distanceMeters,
      rpe: s.rpe,
      completed: s.completed,
      completedAt: iso(s.completedAt),
      isPersonalRecord: s.isPersonalRecord,
      notes: s.notes,
      avgHeartRateBpm: s.avgHeartRateBpm,
      peakHeartRateBpm: s.peakHeartRateBpm,
      restEndHeartRateBpm: s.restEndHeartRateBpm,
    };
  }

  private toExercise(e: ExerciseRow): PublicExerciseDto {
    return {
      id: e.id,
      name: e.name,
      description: e.description,
      instructions: e.instructions,
      category: e.category as ExerciseCategory,
      exerciseType: e.exerciseType as ExerciseType,
      primaryMuscleGroup: e.primaryMuscleGroup as MuscleGroup,
      muscleGroups: e.muscleGroups.map((m) => m.muscleGroup as MuscleGroup),
      equipment: e.equipment as EquipmentType,
      tags: e.tags,
      custom: !e.isSystem,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }
}
