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
import type {
  SessionExerciseDto,
  SessionSetDto,
  WorkoutSessionDto,
  WorkoutTemplateDto,
  WorkoutTemplateExerciseDto,
} from '../schemas';
import {
  buildTemplateExercisesFromSession,
  deriveRepRange,
  resolveTemplateSets,
  summarizeTemplateSets,
} from './template-sets.util';

function templateExercise(
  id: string,
  exerciseId: string,
  overrides: Partial<WorkoutTemplateExerciseDto> = {},
): WorkoutTemplateExerciseDto {
  return {
    id,
    templateId: 'tpl-1',
    exerciseId,
    sets: null,
    orderIndex: 0,
    plannedSets: 3,
    warmupSets: 0,
    targetRepsMin: 8,
    targetRepsMax: 12,
    targetWeight: 60,
    weightUnit: WeightUnit.KG,
    restSeconds: 90,
    targetDurationSeconds: null,
    targetDistanceMeters: null,
    notes: null,
    alternativeExerciseIds: [],
    ...overrides,
  };
}

function template(exercises: WorkoutTemplateExerciseDto[]): WorkoutTemplateDto {
  return {
    id: 'tpl-1',
    userId: 'u1',
    folderId: null,
    name: 'Day 4 - Schultern',
    description: null,
    estimatedDurationMinutes: 60,
    sortOrder: 0,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    exercises: exercises.map((e, i) => ({ ...e, orderIndex: i })),
  };
}

function set(setType: SetType, weight: number, reps: number, completed = true): SessionSetDto {
  return {
    id: `s-${Math.random()}`,
    clientSetId: `cs-${Math.random()}`,
    sessionExerciseId: 'x',
    setNumber: 1,
    setType,
    weight,
    weightUnit: WeightUnit.KG,
    reps,
    durationSeconds: null,
    distanceMeters: null,
    rpe: null,
    completed,
    completedAt: completed ? '2026-10-26T10:00:00.000Z' : null,
    isPersonalRecord: false,
    notes: null,
  };
}

function sessionExercise(
  exerciseId: string,
  sets: SessionSetDto[],
  overrides: Partial<SessionExerciseDto> = {},
): SessionExerciseDto {
  return {
    id: `sex-${exerciseId}`,
    clientExerciseId: `sex-${exerciseId}`,
    sessionId: 'sess-1',
    exerciseId,
    replacedExerciseId: null,
    replacedExerciseName: null,
    exerciseNameSnapshot: exerciseId,
    primaryMuscleSnapshot: MuscleGroup.SHOULDERS,
    exerciseTypeSnapshot: ExerciseType.STRENGTH,
    origin: SessionExerciseOrigin.PLANNED,
    status: sets.some((s) => s.completed)
      ? SessionExerciseStatus.COMPLETED
      : SessionExerciseStatus.SKIPPED,
    orderIndex: 0,
    plannedSets: 3,
    plannedWarmupSets: 0,
    targetRepsMin: 8,
    targetRepsMax: 12,
    targetWeight: 60,
    targetDurationSeconds: null,
    restSeconds: 90,
    alternativeExerciseIds: [],
    notes: null,
    sets,
    ...overrides,
  };
}

function session(exercises: SessionExerciseDto[]): WorkoutSessionDto {
  return {
    id: 'sess-1',
    clientSessionId: 'sess-1',
    userId: 'u1',
    templateId: 'tpl-1',
    stretchingRoutineId: null,
    sessionType: SessionType.STRENGTH,
    workoutNameSnapshot: 'Day 4 - Schultern',
    status: SessionStatus.COMPLETED,
    startedAt: '2026-10-26T09:00:00.000Z',
    pausedAt: null,
    completedAt: '2026-10-26T10:00:00.000Z',
    activeDurationSeconds: 3600,
    weightUnit: WeightUnit.KG,
    totalVolumeKg: 0,
    totalSetsCompleted: 0,
    totalRepsCompleted: 0,
    totalStretchSeconds: 0,
    notes: null,
    restTimerEndsAt: null,
    restTimerDurationSec: null,
    restTimerPausedRemSec: null,
    version: 3,
    lastSyncedAt: '2026-10-26T10:00:00.000Z',
    exercises: exercises.map((e, i) => ({ ...e, orderIndex: i })),
  } as WorkoutSessionDto;
}

describe('template per-set plans', () => {
  it('expands summary-only templates into warm-up and working sets', () => {
    const sets = resolveTemplateSets(templateExercise('te', 'press', { warmupSets: 1 }));
    assert.deepEqual(
      sets.map((s) => [s.setType, s.weight, s.reps]),
      [
        [SetType.WARMUP, 36, 8],
        [SetType.WORKING, 60, 8],
        [SetType.WORKING, 60, 8],
        [SetType.WORKING, 60, 8],
      ],
    );
  });

  it('derives summary fields from explicit sets', () => {
    assert.deepEqual(
      summarizeTemplateSets([
        { setType: SetType.WARMUP, weight: 20, reps: 12, durationSeconds: null },
        { setType: SetType.WORKING, weight: 50, reps: 10, durationSeconds: null },
        { setType: SetType.WORKING, weight: 55, reps: 8, durationSeconds: null },
        { setType: SetType.DROPSET, weight: 40, reps: 10, durationSeconds: null },
      ]),
      { plannedSets: 3, warmupSets: 1, targetWeight: 55 },
    );
  });
});

describe('buildTemplateExercisesFromSession', () => {
  it('copies logged sets, puts an added warm-up first and keeps the rep range', () => {
    const tpl = template([templateExercise('te-press', 'press')]);
    const result = buildTemplateExercisesFromSession(
      tpl,
      session([
        sessionExercise('press', [
          set(SetType.WORKING, 62.5, 10),
          set(SetType.WORKING, 62.5, 9),
          set(SetType.WORKING, 60, 8),
          set(SetType.WARMUP, 30, 12),
        ]),
      ]),
    );
    assert.ok(result);
    const [press] = result;
    assert.equal(press!.id, 'te-press');
    assert.deepEqual(
      press!.sets!.map((s) => [s.setType, s.weight, s.reps]),
      [
        [SetType.WARMUP, 30, 12],
        [SetType.WORKING, 62.5, 10],
        [SetType.WORKING, 62.5, 9],
        [SetType.WORKING, 60, 8],
      ],
    );
    assert.equal(press!.warmupSets, 1);
    assert.equal(press!.plannedSets, 3);
    assert.equal(press!.targetWeight, 62.5);
    assert.equal(press!.targetRepsMin, 8);
    assert.equal(press!.targetRepsMax, 12);
  });

  it('keeps skipped exercises, drops removed ones and inserts added ones in place', () => {
    const tpl = template([
      templateExercise('te-a', 'a'),
      templateExercise('te-b', 'b'),
      templateExercise('te-c', 'c'),
    ]);
    const result = buildTemplateExercisesFromSession(
      tpl,
      session([
        sessionExercise('a', [set(SetType.WORKING, 60, 10)]),
        sessionExercise('new', [set(SetType.WORKING, 15, 12)], {
          origin: SessionExerciseOrigin.ADDED,
        }),
        sessionExercise('b', [set(SetType.WORKING, 60, 8, false)]),
        // c was removed during the workout
      ]),
    );
    assert.deepEqual(
      result!.map((e) => [e.exerciseId, e.id]),
      [
        ['a', 'te-a'],
        ['new', undefined],
        ['b', 'te-b'],
      ],
    );
    assert.equal(result![2]!.sets, null, 'skipped exercise keeps its previous plan');
  });

  it('replaces a swapped exercise and keeps the original as an alternative', () => {
    const tpl = template([
      templateExercise('te-a', 'dumbbell-press', { alternativeExerciseIds: ['x'] }),
    ]);
    const result = buildTemplateExercisesFromSession(
      tpl,
      session([
        sessionExercise('smith-press', [set(SetType.WORKING, 50, 10)], {
          origin: SessionExerciseOrigin.SUBSTITUTED,
          replacedExerciseId: 'dumbbell-press',
        }),
      ]),
    );
    assert.equal(result![0]!.exerciseId, 'smith-press');
    assert.equal(result![0]!.id, 'te-a');
    assert.deepEqual(result![0]!.alternativeExerciseIds, ['dumbbell-press', 'x']);
  });

  it('returns null when nothing changed or the session is from another template', () => {
    const tpl = template([templateExercise('te-a', 'a', { plannedSets: 2 })]);
    const same = session([
      sessionExercise('a', [set(SetType.WORKING, 60, 8), set(SetType.WORKING, 60, 8)]),
    ]);
    assert.equal(buildTemplateExercisesFromSession(tpl, same), null);
    assert.equal(buildTemplateExercisesFromSession(tpl, { ...same, templateId: 'other' }), null);
  });

  it('never leaves a superset link on the last exercise', () => {
    const tpl = template([
      templateExercise('te-a', 'a', { restSeconds: 0 }),
      templateExercise('te-b', 'b'),
    ]);
    const result = buildTemplateExercisesFromSession(
      tpl,
      session([sessionExercise('a', [set(SetType.WORKING, 60, 10)], { restSeconds: 0 })]),
    );
    assert.equal(result!.length, 1);
    assert.equal(result![0]!.restSeconds, 90);
  });
});

describe('deriveRepRange', () => {
  const set = (setType: SetType, reps: number | null) => ({
    setType,
    weight: 50,
    reps,
    durationSeconds: null,
  });

  it('keeps the current range when the planned reps fall inside it', () => {
    const sets = [set(SetType.WORKING, 10), set(SetType.WORKING, 9)];
    assert.deepEqual(deriveRepRange(sets, { targetRepsMin: 8, targetRepsMax: 12 }), {
      targetRepsMin: 8,
      targetRepsMax: 12,
    });
  });

  it('opens a new range when the planned reps are below it', () => {
    const sets = [set(SetType.WORKING, 6)];
    assert.deepEqual(deriveRepRange(sets, { targetRepsMin: 8, targetRepsMax: 12 }), {
      targetRepsMin: 6,
      targetRepsMax: 10,
    });
  });

  it('opens a new range when the planned reps are above it', () => {
    const sets = [set(SetType.WORKING, 15), set(SetType.DROPSET, 14)];
    assert.deepEqual(deriveRepRange(sets, { targetRepsMin: 8, targetRepsMax: 12 }), {
      targetRepsMin: 14,
      targetRepsMax: 18,
    });
  });

  it('derives a range when none exists yet', () => {
    assert.deepEqual(deriveRepRange([set(SetType.WORKING, 10)], {}), {
      targetRepsMin: 10,
      targetRepsMax: 14,
    });
  });

  it('ignores warm-up and stretch sets', () => {
    const sets = [set(SetType.WARMUP, 3), set(SetType.STRETCH, 1), set(SetType.WORKING, 10)];
    assert.deepEqual(deriveRepRange(sets, { targetRepsMin: null, targetRepsMax: null }), {
      targetRepsMin: 10,
      targetRepsMax: 14,
    });
  });

  it('leaves the range unchanged without working reps', () => {
    const sets = [set(SetType.WARMUP, 10), set(SetType.WORKING, null), set(SetType.WORKING, 0)];
    assert.deepEqual(deriveRepRange(sets, { targetRepsMin: 8, targetRepsMax: 12 }), {
      targetRepsMin: 8,
      targetRepsMax: 12,
    });
    assert.deepEqual(deriveRepRange(sets, {}), { targetRepsMin: null, targetRepsMax: null });
  });

  it('caps the range at 100 reps', () => {
    assert.deepEqual(deriveRepRange([set(SetType.WORKING, 98)], {}), {
      targetRepsMin: 98,
      targetRepsMax: 100,
    });
  });
});
