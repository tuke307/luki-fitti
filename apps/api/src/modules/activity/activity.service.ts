import { BadRequestException, Injectable } from '@nestjs/common';
import {
  HEALTH_ACTIVITY_RANGE_MAX_DAYS,
  type HealthActivityDto,
  type HealthDailyEnergyDto,
  type HealthWorkoutDto,
  type ImportHealthActivityDto,
  type ImportHealthActivityResultDto,
} from '@luki-fitti/common/schemas';
import { PrismaService } from '../database/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Rows returned per listing; a 400-day window of workouts stays well below this. */
export const MAX_LIST_WORKOUTS = 5000;

type DailyEnergyRecord = { day: string; activeKcal: number; updatedAt: Date };

type WorkoutRecord = {
  id: string;
  healthKitUuid: string;
  activityType: string;
  sourceName: string;
  isOwn: boolean;
  startedAt: Date;
  endedAt: Date;
  activeKcal: number | null;
  distanceMeters: number | null;
};

/** A first full import (400 days + 2000 workouts) needs more than Prisma's 5 s default. */
const IMPORT_TRANSACTION_TIMEOUT_MS = 30_000;

const WORKOUT_SELECT = {
  id: true,
  healthKitUuid: true,
  activityType: true,
  sourceName: true,
  isOwn: true,
  startedAt: true,
  endedAt: true,
  activeKcal: true,
  distanceMeters: true,
} as const;

/** UTC calendar day (YYYY-MM-DD) of `date`. */
const utcDayKey = (date: Date): string => date.toISOString().slice(0, 10);

const sameWorkout = (
  current: WorkoutRecord,
  next: Omit<WorkoutRecord, 'id' | 'healthKitUuid'>,
): boolean =>
  current.activityType === next.activityType &&
  current.sourceName === next.sourceName &&
  current.isOwn === next.isOwn &&
  current.startedAt.getTime() === next.startedAt.getTime() &&
  current.endedAt.getTime() === next.endedAt.getTime() &&
  current.activeKcal === next.activeKcal &&
  current.distanceMeters === next.distanceMeters;

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Applies an Apple Health activity delta in one transaction: days are upserted by
   * (user, day), workouts by (user, HealthKit UUID), deleted UUIDs remove the user's workouts.
   */
  async importHealthKit(
    userId: string,
    dto: ImportHealthActivityDto,
  ): Promise<ImportHealthActivityResultDto> {
    const deletedUuids = [...new Set(dto.deletedWorkoutUuids)];
    const deletedSet = new Set(deletedUuids);
    // Last value wins for duplicates; a workout that is also reported deleted is dropped.
    const days = [...new Map(dto.days.map((d) => [d.day, d])).values()];
    const workouts = [
      ...new Map(
        dto.workouts
          .filter((w) => !deletedSet.has(w.healthKitUuid))
          .map((w) => [w.healthKitUuid, w]),
      ).values(),
    ];

    return this.prisma.$transaction(
      async (tx) => {
        // Upsert in bulk: create the new rows at once and only write rows whose values changed,
        // so a full re-sync of unchanged history is cheap.
        const existingDays: Array<{ id: string; day: string; activeKcal: number }> = days.length
          ? await tx.healthDailyEnergy.findMany({
              where: { userId, day: { in: days.map((d) => d.day) } },
              select: { id: true, day: true, activeKcal: true },
            })
          : [];
        const dayByKey = new Map(existingDays.map((d) => [d.day, d]));
        const newDays = days.filter((d) => !dayByKey.has(d.day));
        if (newDays.length > 0) {
          await tx.healthDailyEnergy.createMany({
            data: newDays.map((d) => ({ userId, day: d.day, activeKcal: d.activeKcal })),
            skipDuplicates: true,
          });
        }
        for (const day of days) {
          const current = dayByKey.get(day.day);
          if (!current || current.activeKcal === day.activeKcal) continue;
          await tx.healthDailyEnergy.updateMany({
            where: { id: current.id, userId },
            data: { activeKcal: day.activeKcal },
          });
        }

        const existingWorkouts: Array<WorkoutRecord> = workouts.length
          ? await tx.healthWorkout.findMany({
              where: { userId, healthKitUuid: { in: workouts.map((w) => w.healthKitUuid) } },
              select: WORKOUT_SELECT,
            })
          : [];
        const workoutByUuid = new Map(existingWorkouts.map((w) => [w.healthKitUuid, w]));
        const rows = workouts.map((w) => ({
          healthKitUuid: w.healthKitUuid,
          activityType: w.activityType,
          sourceName: w.sourceName,
          isOwn: w.isOwn,
          startedAt: new Date(w.startedAt),
          endedAt: new Date(w.endedAt),
          activeKcal: w.activeKcal,
          distanceMeters: w.distanceMeters,
        }));
        const newWorkouts = rows.filter((w) => !workoutByUuid.has(w.healthKitUuid));
        if (newWorkouts.length > 0) {
          await tx.healthWorkout.createMany({
            data: newWorkouts.map((w) => ({ userId, ...w })),
            skipDuplicates: true,
          });
        }
        for (const { healthKitUuid, ...data } of rows) {
          const current = workoutByUuid.get(healthKitUuid);
          if (!current || sameWorkout(current, data)) continue;
          await tx.healthWorkout.updateMany({ where: { id: current.id, userId }, data });
        }

        const workoutsDeleted =
          deletedUuids.length > 0
            ? (
                await tx.healthWorkout.deleteMany({
                  where: { userId, healthKitUuid: { in: deletedUuids } },
                })
              ).count
            : 0;

        return {
          daysUpserted: days.length,
          workoutsUpserted: workouts.length,
          workoutsDeleted,
        };
      },
      { timeout: IMPORT_TRANSACTION_TIMEOUT_MS },
    );
  }

  /**
   * Daily energy whose day lies within the UTC days of [from, to] (±1 day of slack for time zones)
   * and workouts that started in [from, to], both oldest first.
   */
  async listActivity(userId: string, from: string, to: string): Promise<HealthActivityDto> {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (
      Number.isNaN(fromDate.getTime()) ||
      Number.isNaN(toDate.getTime()) ||
      fromDate > toDate ||
      toDate.getTime() - fromDate.getTime() > HEALTH_ACTIVITY_RANGE_MAX_DAYS * DAY_MS
    ) {
      throw new BadRequestException('Invalid date range');
    }
    const fromDay = utcDayKey(new Date(fromDate.getTime() - DAY_MS));
    const toDay = utcDayKey(new Date(toDate.getTime() + DAY_MS));

    const [days, workouts] = await Promise.all([
      this.prisma.healthDailyEnergy.findMany({
        where: { userId, day: { gte: fromDay, lte: toDay } },
        orderBy: { day: 'asc' },
        select: { day: true, activeKcal: true, updatedAt: true },
      }),
      this.prisma.healthWorkout.findMany({
        where: { userId, startedAt: { gte: fromDate, lte: toDate } },
        orderBy: { startedAt: 'asc' },
        take: MAX_LIST_WORKOUTS,
        select: WORKOUT_SELECT,
      }),
    ]);

    return {
      days: days.map((d) => this.toDayDto(d)),
      workouts: workouts.map((w) => this.toWorkoutDto(w)),
    };
  }

  toDayDto(day: DailyEnergyRecord): HealthDailyEnergyDto {
    return { day: day.day, activeKcal: day.activeKcal, updatedAt: day.updatedAt.toISOString() };
  }

  toWorkoutDto(workout: WorkoutRecord): HealthWorkoutDto {
    return {
      id: workout.id,
      healthKitUuid: workout.healthKitUuid,
      activityType: workout.activityType,
      sourceName: workout.sourceName,
      isOwn: workout.isOwn,
      startedAt: workout.startedAt.toISOString(),
      endedAt: workout.endedAt.toISOString(),
      activeKcal: workout.activeKcal,
      distanceMeters: workout.distanceMeters,
    };
  }
}
