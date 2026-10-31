import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ExerciseType, MuscleGroup, SetType } from '../enums';
import {
  weeklySetsByMuscle,
  weeklySetsStatus,
  type MuscleVolumeSession,
} from './muscle-volume.util';

const now = new Date('2026-10-31T12:00:00Z');
const sets = (n: number, setType = SetType.WORKING, completed = true) =>
  Array.from({ length: n }, () => ({ completed, setType }));

const secondary: Record<string, MuscleGroup[]> = {
  bench: [MuscleGroup.TRICEPS, MuscleGroup.SHOULDERS, MuscleGroup.CHEST],
  squat: [MuscleGroup.GLUTES, MuscleGroup.FULL_BODY],
};
const lookup = (id: string) => secondary[id];

const session = (startedAt: string, exercises: MuscleVolumeSession['exercises']) => ({
  startedAt,
  exercises,
});

describe('weeklySetsByMuscle', () => {
  it('counts secondary muscles at half a set and averages per week', () => {
    const result = weeklySetsByMuscle(
      [
        session('2026-10-28T10:00:00Z', [
          {
            exerciseId: 'bench',
            primaryMuscleSnapshot: MuscleGroup.CHEST,
            exerciseTypeSnapshot: ExerciseType.STRENGTH,
            sets: [...sets(1, SetType.WARMUP), ...sets(4), ...sets(1, SetType.WORKING, false)],
          },
        ]),
        session('2026-10-21T10:00:00Z', [
          {
            exerciseId: 'bench',
            primaryMuscleSnapshot: MuscleGroup.CHEST,
            exerciseTypeSnapshot: ExerciseType.STRENGTH,
            sets: sets(4),
          },
        ]),
      ],
      lookup,
      { weeks: 2, now },
    );
    assert.deepEqual(result, [
      { muscle: MuscleGroup.CHEST, setsPerWeek: 4, directSetsPerWeek: 4, status: 'below' },
      { muscle: MuscleGroup.SHOULDERS, setsPerWeek: 2, directSetsPerWeek: 0, status: 'below' },
      { muscle: MuscleGroup.TRICEPS, setsPerWeek: 2, directSetsPerWeek: 0, status: 'below' },
    ]);
  });

  it('skips stretching, cardio, full-body primaries and sessions outside the window', () => {
    const result = weeklySetsByMuscle(
      [
        session('2026-10-30T10:00:00Z', [
          {
            exerciseId: 'squat',
            primaryMuscleSnapshot: MuscleGroup.QUADRICEPS,
            exerciseTypeSnapshot: ExerciseType.STRENGTH,
            sets: sets(12),
          },
          {
            exerciseId: null,
            primaryMuscleSnapshot: MuscleGroup.FULL_BODY,
            exerciseTypeSnapshot: ExerciseType.STRENGTH,
            sets: sets(3),
          },
          {
            exerciseId: 'stretch',
            primaryMuscleSnapshot: MuscleGroup.HAMSTRINGS,
            exerciseTypeSnapshot: ExerciseType.STRETCHING,
            sets: sets(3, SetType.STRETCH),
          },
          {
            exerciseId: 'run',
            primaryMuscleSnapshot: MuscleGroup.CALVES,
            exerciseTypeSnapshot: ExerciseType.CARDIO,
            sets: sets(1),
          },
        ]),
        session('2026-09-01T10:00:00Z', [
          {
            exerciseId: 'squat',
            primaryMuscleSnapshot: MuscleGroup.QUADRICEPS,
            exerciseTypeSnapshot: ExerciseType.STRENGTH,
            sets: sets(30),
          },
        ]),
      ],
      lookup,
      { weeks: 1, now },
    );
    assert.deepEqual(result, [
      { muscle: MuscleGroup.QUADRICEPS, setsPerWeek: 12, directSetsPerWeek: 12, status: 'within' },
      { muscle: MuscleGroup.GLUTES, setsPerWeek: 6, directSetsPerWeek: 0, status: 'below' },
    ]);
  });

  it('classifies against the 10–20 sets target', () => {
    assert.equal(weeklySetsStatus(9.5), 'below');
    assert.equal(weeklySetsStatus(10), 'within');
    assert.equal(weeklySetsStatus(20), 'within');
    assert.equal(weeklySetsStatus(20.5), 'above');
  });
});
