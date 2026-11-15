import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ExerciseCategory, TrainingGoal } from '../enums';
import {
  goalRepRange,
  LEGACY_DEFAULT_REST_SECONDS,
  resolveRestSeconds,
  resolveTrainingGoal,
  TRAINING_GOAL_PROFILES,
} from './training-goal.util';

describe('resolveTrainingGoal', () => {
  it('prefers the template goal over the profile goal', () => {
    assert.equal(
      resolveTrainingGoal(TrainingGoal.STRENGTH, TrainingGoal.ENDURANCE),
      TrainingGoal.STRENGTH,
    );
  });

  it('falls back to the profile goal', () => {
    assert.equal(resolveTrainingGoal(null, TrainingGoal.ENDURANCE), TrainingGoal.ENDURANCE);
    assert.equal(
      resolveTrainingGoal(undefined, TrainingGoal.HYPERTROPHY),
      TrainingGoal.HYPERTROPHY,
    );
  });

  it('returns null when nothing is set', () => {
    assert.equal(resolveTrainingGoal(null, null), null);
    assert.equal(resolveTrainingGoal(), null);
  });
});

describe('goalRepRange', () => {
  it('uses the compound band for non-isolation exercises and missing exercises', () => {
    assert.deepEqual(goalRepRange(TrainingGoal.STRENGTH), { min: 3, max: 6 });
    assert.deepEqual(
      goalRepRange(TrainingGoal.ENDURANCE, { category: ExerciseCategory.COMPOUND }),
      { min: 12, max: 20 },
    );
  });

  it('uses the isolation band only for ISOLATION exercises', () => {
    assert.deepEqual(
      goalRepRange(TrainingGoal.STRENGTH, { category: ExerciseCategory.ISOLATION }),
      { min: 6, max: 10 },
    );
    assert.deepEqual(
      goalRepRange(TrainingGoal.HYPERTROPHY, { category: ExerciseCategory.ISOLATION }),
      { min: 10, max: 15 },
    );
  });
});

describe('resolveRestSeconds', () => {
  it('swaps the legacy default for the goal rest', () => {
    assert.equal(
      resolveRestSeconds(LEGACY_DEFAULT_REST_SECONDS, TrainingGoal.STRENGTH),
      TRAINING_GOAL_PROFILES[TrainingGoal.STRENGTH].restSeconds,
    );
    assert.equal(resolveRestSeconds(90, TrainingGoal.ENDURANCE), 60);
  });

  it('keeps 0 (superset link) and custom values untouched', () => {
    assert.equal(resolveRestSeconds(0, TrainingGoal.STRENGTH), 0);
    assert.equal(resolveRestSeconds(120, TrainingGoal.STRENGTH), 120);
  });

  it('leaves rest unchanged without a goal', () => {
    assert.equal(resolveRestSeconds(90, null), 90);
    assert.equal(resolveRestSeconds(90, undefined), 90);
  });
});
