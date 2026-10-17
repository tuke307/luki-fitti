import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  ExerciseType,
  MUSCLE_GROUP_LABELS,
  MuscleGroup,
  SessionStatus,
  SessionType,
  SetType,
  WeightUnit,
} from '@luki-fitti/common/enums';
import type {
  AnalyticsQueryDto,
  AnalyticsSummaryDto,
  PersonalRecordDto,
} from '@luki-fitti/common/schemas';

const LBS_TO_KG = 0.45359237;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(userId: string, query: AnalyticsQueryDto): Promise<AnalyticsSummaryDto> {
    const now = new Date();
    let fromDate: Date | undefined;

    if (query.from) {
      fromDate = new Date(query.from);
    } else if (query.period === 'week') {
      fromDate = new Date(now.getTime() - 7 * 86400000);
    } else if (query.period === 'month') {
      fromDate = new Date(now.getTime() - 30 * 86400000);
    } else if (query.period === 'year') {
      fromDate = new Date(now.getTime() - 365 * 86400000);
    }

    const toDate = query.to ? new Date(query.to) : undefined;

    const [sessions, preferences] = await Promise.all([
      this.prisma.workoutSession.findMany({
        where: {
          userId,
          status: SessionStatus.COMPLETED,
          ...(query.templateId ? { templateId: query.templateId } : {}),
          ...(fromDate || toDate
            ? {
                startedAt: {
                  ...(fromDate ? { gte: fromDate } : {}),
                  ...(toDate ? { lte: toDate } : {}),
                },
              }
            : {}),
        },
        orderBy: { startedAt: 'asc' },
        include: {
          exercises: {
            include: { sets: true },
          },
        },
      }),
      this.prisma.userPreferences.findUnique({ where: { userId } }),
    ]);

    let totalSessionsCompleted = 0;
    let totalStrengthSessions = 0;
    let totalStretchingSessions = 0;
    let totalSetsCompleted = 0;
    let totalRepsCompleted = 0;
    let totalVolumeKg = 0;
    let totalDurationSeconds = 0;
    let totalStretchSeconds = 0;

    const muscleStats = new Map<
      MuscleGroup,
      { completedSets: number; totalVolumeKg: number }
    >();
    const prMap = new Map<string, PersonalRecordDto>();
    const exerciseProgression: AnalyticsSummaryDto['exerciseProgression'] = [];

    const weekBuckets = new Map<
      string,
      {
        weekStart: string;
        label: string;
        strengthSessions: number;
        stretchingSessions: number;
        totalVolumeKg: number;
        totalSets: number;
      }
    >();

    for (let i = 7; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 7 * 86400000);
      const wk = this.getMondayIso(d);
      weekBuckets.set(wk, {
        weekStart: wk,
        label: wk.slice(5),
        strengthSessions: 0,
        stretchingSessions: 0,
        totalVolumeKg: 0,
        totalSets: 0,
      });
    }

    const currentWeekMonday = this.getMondayIso(now);
    let sessionsThisWeek = 0;

    for (const s of sessions) {
      if (
        query.muscleGroup &&
        !s.exercises.some((e) => e.primaryMuscleSnapshot === query.muscleGroup)
      ) {
        continue;
      }
      if (query.exerciseId && !s.exercises.some((e) => e.exerciseId === query.exerciseId)) {
        continue;
      }

      totalSessionsCompleted += 1;
      if (s.sessionType === SessionType.STRETCHING) {
        totalStretchingSessions += 1;
      } else {
        totalStrengthSessions += 1;
      }

      totalDurationSeconds += s.activeDurationSeconds;
      const wkKey = this.getMondayIso(s.startedAt);
      if (wkKey === currentWeekMonday) {
        sessionsThisWeek += 1;
      }

      const bucket = weekBuckets.get(wkKey) ?? {
        weekStart: wkKey,
        label: wkKey.slice(5),
        strengthSessions: 0,
        stretchingSessions: 0,
        totalVolumeKg: 0,
        totalSets: 0,
      };
      if (s.sessionType === SessionType.STRETCHING) {
        bucket.stretchingSessions += 1;
      } else {
        bucket.strengthSessions += 1;
      }

      for (const ex of s.exercises) {
        if (query.muscleGroup && ex.primaryMuscleSnapshot !== query.muscleGroup) continue;

        const isStretchEx =
          ex.exerciseTypeSnapshot === ExerciseType.STRETCHING ||
          ex.exerciseTypeSnapshot === ExerciseType.MOBILITY;

        let exMaxWeightKg = 0;
        let exBestSetReps = 0;
        let exBest1RM = 0;
        let exVolumeKg = 0;

        for (const set of ex.sets) {
          if (!set.completed) continue;
          totalSetsCompleted += 1;
          bucket.totalSets += 1;

          if (isStretchEx || set.setType === SetType.STRETCH) {
            totalStretchSeconds += set.durationSeconds ?? 0;
            if (set.reps) totalRepsCompleted += set.reps;
          } else {
            const reps = set.reps ?? 0;
            totalRepsCompleted += reps;
            if (set.setType !== SetType.WARMUP && set.weight && set.weight > 0 && reps > 0) {
              const weightKg =
                set.weightUnit === WeightUnit.LBS ? set.weight * LBS_TO_KG : set.weight;
              const setVolume = weightKg * reps;
              totalVolumeKg += setVolume;
              exVolumeKg += setVolume;
              bucket.totalVolumeKg += setVolume;

              const est1RM = weightKg * (1 + reps / 30);
              if (weightKg > exMaxWeightKg) {
                exMaxWeightKg = weightKg;
                exBestSetReps = reps;
              }
              if (est1RM > exBest1RM) {
                exBest1RM = est1RM;
              }

              const exKey = ex.exerciseId ?? ex.exerciseNameSnapshot;
              const prevPr = prMap.get(exKey);
              if (
                !prevPr ||
                weightKg > prevPr.maxWeightKg ||
                (weightKg === prevPr.maxWeightKg && reps > prevPr.repsAtMaxWeight)
              ) {
                prMap.set(exKey, {
                  exerciseId: exKey,
                  exerciseName: ex.exerciseNameSnapshot,
                  primaryMuscle: ex.primaryMuscleSnapshot as MuscleGroup,
                  maxWeightKg: Math.round(weightKg * 10) / 10,
                  repsAtMaxWeight: reps,
                  estimatedOneRepMaxKg: Math.round(est1RM * 10) / 10,
                  bestVolumeSetKg: Math.round(setVolume * 10) / 10,
                  achievedAt: s.startedAt.toISOString(),
                });
              }
            }
          }

          const mGroup = ex.primaryMuscleSnapshot as MuscleGroup;
          const curM = muscleStats.get(mGroup) ?? { completedSets: 0, totalVolumeKg: 0 };
          curM.completedSets += 1;
          if (!isStretchEx && set.setType !== SetType.WARMUP && set.weight && set.reps) {
            const wKg =
              set.weightUnit === WeightUnit.LBS ? set.weight * LBS_TO_KG : set.weight;
            curM.totalVolumeKg += wKg * set.reps;
          }
          muscleStats.set(mGroup, curM);
        }

        if (
          (!query.exerciseId || ex.exerciseId === query.exerciseId) &&
          exMaxWeightKg > 0
        ) {
          exerciseProgression.push({
            date: s.startedAt.toISOString().slice(0, 10),
            workoutName: s.workoutNameSnapshot,
            maxWeightKg: Math.round(exMaxWeightKg * 10) / 10,
            totalVolumeKg: Math.round(exVolumeKg * 10) / 10,
            bestSetReps: exBestSetReps,
            estimated1RM: Math.round(exBest1RM * 10) / 10,
          });
        }
      }

      bucket.totalVolumeKg = Math.round(bucket.totalVolumeKg);
      weekBuckets.set(wkKey, bucket);
    }

    const totalMuscleSets = Array.from(muscleStats.values()).reduce(
      (acc, v) => acc + v.completedSets,
      0,
    );

    const muscleDistribution = Array.from(muscleStats.entries())
      .map(([muscleGroup, stats]) => ({
        muscleGroup,
        label: MUSCLE_GROUP_LABELS[muscleGroup] ?? muscleGroup,
        completedSets: stats.completedSets,
        totalVolumeKg: Math.round(stats.totalVolumeKg),
        percentage:
          totalMuscleSets > 0 ? Math.round((stats.completedSets / totalMuscleSets) * 100) : 0,
      }))
      .sort((a, b) => b.completedSets - a.completedSets);

    let currentStreakWeeks = 0;
    const sortedWeeks = Array.from(weekBuckets.values()).sort((a, b) =>
      b.weekStart.localeCompare(a.weekStart),
    );
    for (const wk of sortedWeeks) {
      if (wk.strengthSessions + wk.stretchingSessions > 0) {
        currentStreakWeeks += 1;
      } else if (wk.weekStart !== currentWeekMonday) {
        break;
      }
    }

    return {
      totalSessionsCompleted,
      totalStrengthSessions,
      totalStretchingSessions,
      totalSetsCompleted,
      totalRepsCompleted,
      totalVolumeKg: Math.round(totalVolumeKg),
      totalDurationSeconds,
      totalStretchSeconds,
      currentStreakWeeks,
      sessionsThisWeek,
      weeklyGoalSessions: preferences?.weeklyGoalSessions ?? 4,
      frequencyByWeek: Array.from(weekBuckets.values()).sort((a, b) =>
        a.weekStart.localeCompare(b.weekStart),
      ),
      muscleDistribution,
      personalRecords: Array.from(prMap.values()).sort(
        (a, b) => b.estimatedOneRepMaxKg - a.estimatedOneRepMaxKg,
      ),
      exerciseProgression,
    };
  }

  private getMondayIso(date: Date): string {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = d.getUTCDay() || 7;
    if (day !== 1) {
      d.setUTCDate(d.getUTCDate() - (day - 1));
    }
    return d.toISOString().slice(0, 10);
  }
}
