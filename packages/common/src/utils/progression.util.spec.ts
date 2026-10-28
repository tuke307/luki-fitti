import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ExerciseType,
  MuscleGroup,
  SessionExerciseOrigin,
  SessionExerciseStatus,
  SessionStatus,
  SessionType,
  SetType,
  WeightUnit,
} from '../enums';
import type { WorkoutSessionDto } from '../schemas';
import { INITIAL_EXERCISE_CATALOG } from '../catalog/data';
import {
  analyzeExerciseTrend,
  computeExerciseProgression,
  computeWorkoutExerciseSuggestion,
  extractGlobalExerciseHistory,
  toDismissedSuggestion,
  type DismissedWorkoutSuggestion,
  type WorkoutSuggestionInputExercise,
} from './progression.util';

const BENCH = 'ex-barbell-bench-press-medium-grip';
const SHOULDER_PRESS = 'ex-dumbbell-shoulder-press';
const PUSHDOWN = 'ex-triceps-pushdown-rope-attachment';

const catalog = INITIAL_EXERCISE_CATALOG;
const DAY_MS = 24 * 60 * 60 * 1000;
const START = Date.parse('2026-08-01T17:00:00.000Z');

interface LoggedSet {
  weight: number;
  reps: number;
  rpe: number | null;
}

function buildSession(
  dayOffset: number,
  exerciseId: string,
  sets: LoggedSet[],
  targetRepsMin = 8,
  targetRepsMax = 12,
): WorkoutSessionDto {
  const ex = catalog.find((c) => c.id === exerciseId)!;
  const startedAt = new Date(START + dayOffset * DAY_MS).toISOString();
  const id = `hist-${exerciseId}-${dayOffset}`;
  return {
    id,
    clientSessionId: id,
    userId: 'user-1',
    templateId: null,
    stretchingRoutineId: null,
    sessionType: SessionType.STRENGTH,
    workoutNameSnapshot: 'Push Day',
    status: SessionStatus.COMPLETED,
    startedAt,
    pausedAt: null,
    completedAt: startedAt,
    activeDurationSeconds: 3600,
    weightUnit: WeightUnit.KG,
    totalVolumeKg: 0,
    totalSetsCompleted: sets.length,
    totalRepsCompleted: 0,
    totalStretchSeconds: 0,
    notes: null,
    restTimerEndsAt: null,
    restTimerDurationSec: null,
    restTimerPausedRemSec: null,
    version: 1,
    lastSyncedAt: startedAt,
    exercises: [
      {
        id: `${id}-ex`,
        clientExerciseId: `${id}-ex`,
        sessionId: id,
        exerciseId,
        replacedExerciseId: null,
        replacedExerciseName: null,
        exerciseNameSnapshot: ex.name,
        primaryMuscleSnapshot: ex.primaryMuscleGroup,
        exerciseTypeSnapshot: ExerciseType.STRENGTH,
        origin: SessionExerciseOrigin.PLANNED,
        status: SessionExerciseStatus.COMPLETED,
        orderIndex: 0,
        plannedSets: sets.length,
        plannedWarmupSets: 0,
        targetRepsMin,
        targetRepsMax,
        targetWeight: sets[0]?.weight ?? null,
        targetDurationSeconds: null,
        restSeconds: 90,
        alternativeExerciseIds: [],
        notes: null,
        sets: sets.map((s, idx) => ({
          id: `${id}-s${idx}`,
          clientSetId: `${id}-s${idx}`,
          sessionExerciseId: `${id}-ex`,
          setNumber: idx + 1,
          setType: SetType.WORKING,
          weight: s.weight,
          weightUnit: WeightUnit.KG,
          reps: s.reps,
          durationSeconds: null,
          distanceMeters: null,
          rpe: s.rpe,
          completed: true,
          completedAt: startedAt,
          isPersonalRecord: false,
          notes: null,
        })),
      },
    ],
  } as WorkoutSessionDto;
}

const threeSets = (weight: number, reps: number, rpe: number | null): LoggedSet[] => [
  { weight, reps, rpe },
  { weight, reps, rpe },
  { weight, reps, rpe },
];

const balancedPush: WorkoutSuggestionInputExercise[] = [
  { exerciseId: BENCH, plannedSets: 3 },
  { exerciseId: SHOULDER_PRESS, plannedSets: 3 },
  { exerciseId: PUSHDOWN, plannedSets: 3 },
];

function suggest(
  exercises: WorkoutSuggestionInputExercise[],
  historySessions: WorkoutSessionDto[] = [],
  dismissed: DismissedWorkoutSuggestion[] = [],
) {
  return computeWorkoutExerciseSuggestion({
    workoutName: 'Push Day',
    exercises,
    catalog,
    historySessions,
    weightUnit: WeightUnit.KG,
    dismissed,
  });
}

describe('analyzeExerciseTrend', () => {
  it('counts sessions and weeks since the last new best, ignoring ties', () => {
    const history = extractGlobalExerciseHistory(
      SHOULDER_PRESS,
      null,
      [0, 10, 20, 30, 42].map((d) => buildSession(d, SHOULDER_PRESS, threeSets(28, 8, 8))),
    );
    const trend = analyzeExerciseTrend(history);
    assert.equal(trend.sessionsCount, 5);
    assert.equal(trend.sessionsSinceBest, 4);
    assert.equal(trend.weeksSinceBest, 6);
    assert.equal(trend.hardSessionsRecent, 0);
    assert.equal(trend.recentWindow, 3);
    assert.equal(trend.changePct, 0);
  });
});

describe('computeWorkoutExerciseSuggestion — honest stall detection', () => {
  it('does not flag a single max-effort session', () => {
    const history = [buildSession(0, SHOULDER_PRESS, threeSets(28, 8, 9.5))];
    assert.equal(suggest(balancedPush, history), null);
  });

  it('does not flag repeated max effort while performance keeps improving', () => {
    const history = [
      buildSession(0, SHOULDER_PRESS, threeSets(28, 6, 9.5)),
      buildSession(7, SHOULDER_PRESS, threeSets(28, 7, 9.5)),
      buildSession(14, SHOULDER_PRESS, threeSets(28, 8, 9.5)),
    ];
    assert.equal(suggest(balancedPush, history), null);
  });

  it('flags GRINDING when max effort repeats without any gain', () => {
    const history = [0, 7, 14].map((d) => buildSession(d, SHOULDER_PRESS, threeSets(28, 6, 9.5)));
    const suggestion = suggest(balancedPush, history)!;
    assert.equal(suggestion.reasonType, 'GRINDING');
    assert.equal(suggestion.targetMuscle, MuscleGroup.SHOULDERS);
    assert.equal(suggestion.stallingExerciseId, SHOULDER_PRESS);
    assert.equal(suggestion.evidence.hardSessionsRecent, 3);
    assert.equal(suggestion.evidence.recentWindow, 3);
    assert.equal(suggestion.evidence.changePct, 0);
  });

  it('flags PLATEAU after weeks without a new best', () => {
    const history = [0, 10, 20, 30, 42].map((d) =>
      buildSession(d, SHOULDER_PRESS, threeSets(28, 8, 8)),
    );
    const suggestion = suggest(balancedPush, history)!;
    assert.equal(suggestion.reasonType, 'PLATEAU');
    assert.equal(suggestion.stallingExerciseId, SHOULDER_PRESS);
    assert.equal(suggestion.evidence.sessionsSinceBest, 4);
    assert.equal(suggestion.evidence.weeksSinceBest, 6);
  });

  it('flags REGRESSION when the estimated 1RM trends down', () => {
    const history = [
      buildSession(0, SHOULDER_PRESS, threeSets(30, 8, 8)),
      buildSession(7, SHOULDER_PRESS, threeSets(28, 8, 8)),
      buildSession(14, SHOULDER_PRESS, threeSets(26, 8, 8)),
    ];
    const suggestion = suggest(balancedPush, history)!;
    assert.equal(suggestion.reasonType, 'REGRESSION');
    assert.ok(suggestion.evidence.changePct <= -4);
  });

  it('flags MISSING_MUSCLE without a swap target when a key split muscle has no sets', () => {
    const suggestion = suggest([
      { exerciseId: BENCH, plannedSets: 3 },
      { exerciseId: SHOULDER_PRESS, plannedSets: 3 },
    ])!;
    assert.equal(suggestion.reasonType, 'MISSING_MUSCLE');
    assert.equal(suggestion.targetMuscle, MuscleGroup.TRICEPS);
    assert.equal(suggestion.stallingExerciseId, null);
    assert.equal(suggestion.stallingExerciseName, null);
    assert.equal(suggestion.evidence.setsForMuscle, 0);
    assert.equal(suggestion.evidence.setsTotal, 6);
  });

  it('flags LOW_VOLUME when a key muscle gets far fewer sets than the others', () => {
    const suggestion = suggest([
      { exerciseId: BENCH, plannedSets: 6 },
      { exerciseId: SHOULDER_PRESS, plannedSets: 4 },
      { exerciseId: PUSHDOWN, plannedSets: 1 },
    ])!;
    assert.equal(suggestion.reasonType, 'LOW_VOLUME');
    assert.equal(suggestion.targetMuscle, MuscleGroup.TRICEPS);
    assert.equal(suggestion.stallingExerciseId, null);
    assert.equal(suggestion.evidence.setsForMuscle, 1);
    assert.equal(suggestion.evidence.setsTotal, 11);
  });

  it('returns nothing for a balanced workout without stalls', () => {
    assert.equal(suggest(balancedPush), null);
  });
});

describe('computeWorkoutExerciseSuggestion — dismissed suggestions', () => {
  it('moves on to the next reason instead of repeating a dismissed suggestion', () => {
    const history = [
      ...[0, 7, 14].map((d) => buildSession(d, SHOULDER_PRESS, threeSets(28, 6, 9.5))),
      buildSession(0, PUSHDOWN, threeSets(30, 12, 8)),
      buildSession(7, PUSHDOWN, threeSets(28, 12, 8)),
      buildSession(14, PUSHDOWN, threeSets(26, 12, 8)),
    ];
    const first = suggest(balancedPush, history)!;
    assert.equal(first.reasonType, 'REGRESSION');
    assert.equal(first.stallingExerciseId, PUSHDOWN);

    const second = suggest(balancedPush, history, [toDismissedSuggestion(first)])!;
    assert.equal(second.reasonType, 'GRINDING');
    assert.equal(second.stallingExerciseId, SHOULDER_PRESS);
    assert.notEqual(second.suggestedExercise.id, first.suggestedExercise.id);
  });

  it('returns nothing once every honest reason was dismissed', () => {
    const history = [0, 7, 14].map((d) => buildSession(d, SHOULDER_PRESS, threeSets(28, 6, 9.5)));
    const first = suggest(balancedPush, history)!;
    assert.equal(suggest(balancedPush, history, [toDismissedSuggestion(first)]), null);
  });
});

describe('computeExerciseProgression — max effort still progresses', () => {
  const progress = (sets: LoggedSet[]) =>
    computeExerciseProgression({
      exerciseId: SHOULDER_PRESS,
      exerciseName: null,
      historySessions: [buildSession(0, SHOULDER_PRESS, sets)],
      catalogExercise: catalog.find((c) => c.id === SHOULDER_PRESS),
      plannedSets: 3,
      targetRepsMin: 8,
      targetRepsMax: 12,
      weightUnit: WeightUnit.KG,
    });

  it('increases weight when every set hit the top of the rep range at max effort', () => {
    const insight = progress(threeSets(20, 12, 9.5));
    assert.equal(insight.phase, 'INCREASE_WEIGHT');
    assert.ok(insight.setSuggestions[0]!.weightDelta > 0);
  });

  it('holds weight and reps when max effort was below the top of the range', () => {
    const insight = progress(threeSets(20, 9, 9.5));
    assert.equal(insight.phase, 'MAINTAIN');
    assert.equal(insight.setSuggestions[0]!.suggestedWeight, 20);
    assert.equal(insight.setSuggestions[0]!.suggestedReps, 9);
  });
});
