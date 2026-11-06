import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ExerciseType, MuscleGroup, SessionStatus, SetType, WeightUnit } from '../enums';
import type { WorkoutSessionDto } from '../schemas';
import { computeHistoryInsights } from './history-insights.util';

type LoggedSet = [SetType, number | null, number | null, boolean];

/** Shared with `HistoryInsightsTests.swift` to keep both ports in sync. */
interface InsightsCase {
  name: string;
  filter?: { muscle?: MuscleGroup; exerciseId?: string };
  sessions: Array<{
    day: number;
    unit?: WeightUnit;
    exercises: Array<{
      id: string;
      name: string;
      muscle: MuscleGroup;
      type?: ExerciseType;
      sets: LoggedSet[];
    }>;
  }>;
  expect: {
    /** `[muscle, sets, volumeKg, pct]` */
    muscles: Array<[MuscleGroup, number, number, number]>;
    /** `[key, name, muscle, maxWeightKg, reps, est1RM, day]` */
    bests: Array<[string, string, MuscleGroup, number, number, number, number]>;
  };
}

const cases = JSON.parse(
  readFileSync(new URL('./__fixtures__/history-insights-cases.json', import.meta.url), 'utf8'),
) as InsightsCase[];

const START = Date.parse('2026-08-01T17:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const dayOf = (iso: string) => Math.round((Date.parse(iso) - START) / DAY_MS);

function toSession(s: InsightsCase['sessions'][number]): WorkoutSessionDto {
  const startedAt = new Date(START + s.day * DAY_MS).toISOString();
  return {
    clientSessionId: `s-${s.day}`,
    workoutNameSnapshot: 'Workout',
    status: SessionStatus.COMPLETED,
    startedAt,
    completedAt: startedAt,
    exercises: s.exercises.map((e) => ({
      exerciseId: e.id,
      exerciseNameSnapshot: e.name,
      primaryMuscleSnapshot: e.muscle,
      exerciseTypeSnapshot: e.type ?? ExerciseType.STRENGTH,
      sets: e.sets.map(([setType, weight, reps, completed]) => ({
        setType,
        weight,
        weightUnit: s.unit ?? WeightUnit.KG,
        reps,
        completed,
      })),
    })),
  } as unknown as WorkoutSessionDto;
}

describe('computeHistoryInsights — shared cases', () => {
  for (const c of cases) {
    it(c.name, () => {
      // Newest first, like the history list.
      const sessions = c.sessions.map(toSession).reverse();
      const result = computeHistoryInsights(sessions, c.filter ?? {});
      assert.deepEqual(
        result.muscleDistribution.map((m) => [m.muscle, m.sets, m.volumeKg, m.pct]),
        c.expect.muscles,
      );
      assert.deepEqual(
        result.personalRecords.map((p) => [
          p.key,
          p.exerciseName,
          p.muscle,
          p.maxWeightKg,
          p.reps,
          p.est1RM,
          dayOf(p.startedAt),
        ]),
        c.expect.bests,
      );
    });
  }
});
