import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ExerciseType, SessionStatus, SetType, WeightUnit } from '../enums';
import type { WorkoutSessionDto } from '../schemas';
import { buildExerciseHistoryLog } from './exercise-history.util';

type LoggedSet = [SetType, number | null, number | null, number | null];

interface HistoryCase {
  name: string;
  exerciseId: string;
  exerciseType?: ExerciseType;
  unit: WeightUnit;
  sessions: Array<{ day: number; unit?: WeightUnit; sets: LoggedSet[] }>;
  /** Shared with `ExerciseHistoryLogTests.swift` to keep both ports in sync. */
  expect: {
    metric: string;
    sessionDays: number[];
    bestEstimated1RM: number | null;
    heaviestSet: [number, number] | null;
    prDay: number | null;
    trend: number[];
    warmupsInNewest: number;
  };
}

const cases = JSON.parse(
  readFileSync(new URL('./__fixtures__/exercise-history-cases.json', import.meta.url), 'utf8'),
) as HistoryCase[];

const START = Date.parse('2026-08-01T17:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const dayOf = (iso: string) => Math.round((Date.parse(iso) - START) / DAY_MS);

function session(
  exerciseId: string,
  day: number,
  sets: LoggedSet[],
  unit: WeightUnit = WeightUnit.KG,
  exerciseType: ExerciseType = ExerciseType.STRENGTH,
): WorkoutSessionDto {
  const id = `s-${exerciseId}-${day}`;
  const startedAt = new Date(START + day * DAY_MS).toISOString();
  return {
    clientSessionId: id,
    workoutNameSnapshot: 'Workout',
    status: SessionStatus.COMPLETED,
    startedAt,
    completedAt: startedAt,
    exercises: [
      {
        exerciseId,
        exerciseNameSnapshot: exerciseId,
        exerciseTypeSnapshot: exerciseType,
        sets: sets.map(([setType, weight, reps, durationSeconds]) => ({
          setType,
          weight,
          weightUnit: unit,
          reps,
          durationSeconds,
          rpe: null,
          completed: true,
        })),
      },
    ],
  } as unknown as WorkoutSessionDto;
}

describe('buildExerciseHistoryLog — shared cases', () => {
  for (const c of cases) {
    it(c.name, () => {
      const log = buildExerciseHistoryLog({
        exerciseId: c.exerciseId,
        exerciseType: c.exerciseType ?? ExerciseType.STRENGTH,
        historySessions: c.sessions.map((s) =>
          session(c.exerciseId, s.day, s.sets, s.unit, c.exerciseType),
        ),
        weightUnit: c.unit,
      });
      assert.equal(log.metric, c.expect.metric);
      assert.deepEqual(
        log.sessions.map((s) => dayOf(s.startedAt)),
        c.expect.sessionDays,
      );
      assert.equal(log.bestEstimated1RM, c.expect.bestEstimated1RM);
      assert.deepEqual(
        log.heaviestSet ? [log.heaviestSet.weight, log.heaviestSet.reps] : null,
        c.expect.heaviestSet,
      );
      const pr = log.sessions.filter((s) => s.isPersonalRecord);
      assert.deepEqual(
        pr.map((s) => dayOf(s.startedAt)),
        c.expect.prDay === null ? [] : [c.expect.prDay],
      );
      assert.deepEqual(
        log.trend.map((p) => p.value),
        c.expect.trend,
      );
      assert.equal(
        log.sessions[0]?.sets.filter((s) => s.warmup).length ?? 0,
        c.expect.warmupsInNewest,
      );
    });
  }
});

describe('buildExerciseHistoryLog', () => {
  it('matches sessions logged without an id by name', () => {
    const logged = session('ex-bench', 0, [[SetType.WORKING, 60, 8, null]]);
    logged.exercises[0]!.exerciseId = null;
    logged.exercises[0]!.exerciseNameSnapshot = ' Bench Press ';
    const log = buildExerciseHistoryLog({
      exerciseId: 'ex-bench',
      exerciseName: 'bench press',
      historySessions: [logged, session('ex-other', 1, [[SetType.WORKING, 80, 5, null]])],
    });
    assert.equal(log.sessions.length, 1);
  });

  it('ignores unfinished sessions and incomplete sets', () => {
    const open = session('ex-bench', 0, [[SetType.WORKING, 60, 8, null]]);
    open.status = SessionStatus.IN_PROGRESS;
    open.completedAt = null;
    const skipped = session('ex-bench', 1, [[SetType.WORKING, 60, 8, null]]);
    skipped.exercises[0]!.sets[0]!.completed = false;
    const log = buildExerciseHistoryLog({
      exerciseId: 'ex-bench',
      historySessions: [open, skipped],
    });
    assert.equal(log.sessions.length, 0);
  });
});
