import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AnalyticsService } from './analytics.service';
import {
  ExerciseType,
  MuscleGroup,
  SessionStatus,
  SessionType,
  SetType,
  WeightUnit,
} from '@luki-fitti/common/enums';

describe('AnalyticsService — Frequency, Volume, PRs & Stretching Separation', () => {
  it('computes strength volume, Epley 1RM personal records, muscle distribution, and separates stretching duration', async () => {
    const now = new Date();
    const mockPrisma: any = {
      workoutSession: {
        findMany: async () => [
          {
            id: 's1',
            userId: 'user-1',
            sessionType: SessionType.STRENGTH,
            workoutNameSnapshot: 'Day 1 — Chest & Triceps',
            status: SessionStatus.COMPLETED,
            startedAt: now,
            activeDurationSeconds: 3600,
            activeCaloriesKcal: 420,
            avgHeartRateBpm: 142,
            exercises: [
              {
                exerciseId: 'ex-barbell-bench-press',
                exerciseNameSnapshot: 'Barbell Bench Press',
                primaryMuscleSnapshot: MuscleGroup.CHEST,
                exerciseTypeSnapshot: ExerciseType.STRENGTH,
                sets: [
                  {
                    completed: true,
                    setType: SetType.WARMUP,
                    weight: 50,
                    weightUnit: WeightUnit.KG,
                    reps: 10,
                  },
                  {
                    completed: true,
                    setType: SetType.WORKING,
                    weight: 100,
                    weightUnit: WeightUnit.KG,
                    reps: 6,
                  },
                ],
              },
            ],
          },
          {
            id: 's2',
            userId: 'user-1',
            sessionType: SessionType.STRETCHING,
            workoutNameSnapshot: 'Lower Body Mobility',
            status: SessionStatus.COMPLETED,
            startedAt: now,
            activeDurationSeconds: 600,
            exercises: [
              {
                exerciseId: 'ex-couch-hip-flexor-stretch',
                exerciseNameSnapshot: 'Couch Stretch',
                primaryMuscleSnapshot: MuscleGroup.HIP_FLEXORS,
                exerciseTypeSnapshot: ExerciseType.STRETCHING,
                sets: [
                  {
                    completed: true,
                    setType: SetType.STRETCH,
                    weight: null,
                    weightUnit: WeightUnit.KG,
                    reps: null,
                    durationSeconds: 120,
                  },
                ],
              },
            ],
          },
        ],
      },
      userPreferences: {
        findUnique: async () => ({ weeklyGoalSessions: 4 }),
      },
    };

    const service = new AnalyticsService(mockPrisma);
    const summary = await service.getSummary('user-1', { period: 'month' });

    assert.equal(summary.totalSessionsCompleted, 2);
    assert.equal(summary.totalStrengthSessions, 1);
    assert.equal(summary.totalStretchingSessions, 1);
    // Only working strength set counts toward volume: 100 * 6 = 600 kg
    assert.equal(summary.totalVolumeKg, 600);
    // Stretching duration tracked separately: 120s
    assert.equal(summary.totalStretchSeconds, 120);
    assert.equal(summary.personalRecords.length, 1);
    assert.equal(summary.personalRecords[0]?.maxWeightKg, 100);
    assert.equal(summary.personalRecords[0]?.estimatedOneRepMaxKg, 120);
    assert.equal(summary.totalActiveCaloriesKcal, 420);
    assert.equal(summary.avgWorkoutHeartRateBpm, 142);
  });
});
