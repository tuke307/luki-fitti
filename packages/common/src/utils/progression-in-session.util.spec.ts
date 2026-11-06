import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ExerciseType,
  SessionExerciseOrigin,
  SessionExerciseStatus,
  SessionStatus,
  SessionType,
  SetType,
  WeightUnit,
} from '../enums';
import type { SessionSetDto, WorkoutSessionDto } from '../schemas';
import { CORE_EXERCISE_CATALOG } from '../catalog/data';
import { computeExerciseProgression } from './progression.util';

const catalog = CORE_EXERCISE_CATALOG;
const DAY_MS = 24 * 60 * 60 * 1000;
const START = Date.parse('2026-08-01T17:00:00.000Z');

interface FixtureSet {
  setType?: keyof typeof SetType;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  completed: boolean;
}

interface InSessionCase {
  name: string;
  exerciseId: string;
  repMin: number;
  repMax: number;
  historySets: Array<{ weight: number; reps: number; rpe: number | null }>;
  currentSets: FixtureSet[];
  expect: {
    workingSetIndex: number;
    suggestedWeight: number | null;
    suggestedReps: number | null;
    weightDelta: number;
    repsDelta: number;
    phase: string;
  };
}

/** Shared with the Swift port (`ProgressionInSessionTests.swift`). */
const CASES: InSessionCase[] = JSON.parse(
  readFileSync(
    new URL('./__fixtures__/progression-in-session-cases.json', import.meta.url),
    'utf8',
  ),
);

function buildHistorySession(
  exerciseId: string,
  sets: InSessionCase['historySets'],
  targetRepsMin: number,
  targetRepsMax: number,
): WorkoutSessionDto {
  const ex = catalog.find((c) => c.id === exerciseId)!;
  const startedAt = new Date(START).toISOString();
  const id = `hist-${exerciseId}-0`;
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

function buildCurrentSets(exerciseId: string, sets: FixtureSet[]): SessionSetDto[] {
  return sets.map((s, idx) => ({
    id: `cur-${exerciseId}-s${idx}`,
    clientSetId: `cur-${exerciseId}-s${idx}`,
    sessionExerciseId: `cur-${exerciseId}-ex`,
    setNumber: idx + 1,
    setType: SetType[s.setType ?? 'WORKING'],
    weight: s.weight,
    weightUnit: WeightUnit.KG,
    reps: s.reps,
    durationSeconds: null,
    distanceMeters: null,
    rpe: s.rpe,
    completed: s.completed,
    completedAt: s.completed ? new Date(START + DAY_MS).toISOString() : null,
    isPersonalRecord: false,
    notes: null,
  }));
}

describe('computeExerciseProgression — in-session anchors', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const insight = computeExerciseProgression({
        exerciseId: c.exerciseId,
        exerciseName: null,
        historySessions:
          c.historySets.length > 0
            ? [buildHistorySession(c.exerciseId, c.historySets, c.repMin, c.repMax)]
            : [],
        catalogExercise: catalog.find((e) => e.id === c.exerciseId),
        plannedSets: c.currentSets.length,
        targetRepsMin: c.repMin,
        targetRepsMax: c.repMax,
        weightUnit: WeightUnit.KG,
        currentSets: buildCurrentSets(c.exerciseId, c.currentSets),
      });

      const suggestion = insight.setSuggestions[c.expect.workingSetIndex];
      assert.ok(suggestion, `no suggestion at index ${c.expect.workingSetIndex}`);
      assert.equal(suggestion.suggestedWeight, c.expect.suggestedWeight);
      assert.equal(suggestion.suggestedReps, c.expect.suggestedReps);
      assert.equal(suggestion.weightDelta, c.expect.weightDelta);
      assert.equal(suggestion.repsDelta, c.expect.repsDelta);
      assert.equal(suggestion.phase, c.expect.phase);
    });
  }
});
