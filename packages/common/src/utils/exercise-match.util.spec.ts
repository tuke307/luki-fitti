import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_EXERCISE_CATALOG } from '../catalog/data';
import type { ExerciseDto } from '../schemas';
import { exerciseTokens, findSimilarExercises } from './exercise-match.util';

const base = INITIAL_EXERCISE_CATALOG[0]!;
const fake = (id: string, name: string, tags: string[] = []): ExerciseDto => ({
  ...base,
  id,
  slug: id,
  name,
  tags,
});

describe('exercise matching', () => {
  it('maps German and English words onto the same tokens', () => {
    assert.deepEqual(exerciseTokens('Sitzendes Schulterdrücken Multipresse').sort(), [
      'press',
      'seated',
      'shoulder',
      'smith',
    ]);
    assert.deepEqual(exerciseTokens('Seated Smith Machine Shoulder Press').sort(), [
      'machine',
      'press',
      'seated',
      'shoulder',
      'smith',
    ]);
  });

  it('suggests the Smith machine shoulder press for the German custom name', () => {
    const catalog = [
      fake('dumbbell-shoulder-press', 'Seated Dumbbell Shoulder Press'),
      fake('smith-machine-overhead-shoulder-press', 'Smith Machine Overhead Shoulder Press'),
      fake('barbell-curl', 'Barbell Curl'),
    ];
    const [best] = findSimilarExercises('Sitzendes Schulterdrücken Multipresse', catalog);
    assert.equal(best?.exercise.id, 'smith-machine-overhead-shoulder-press');
  });

  it('finds nothing for unrelated names', () => {
    assert.deepEqual(
      findSimilarExercises('Torso-Rotation-Maschine', [fake('curl', 'Barbell Curl')]),
      [],
    );
  });

  it('works against the built-in catalog', () => {
    const matches = findSimilarExercises('Bankdrücken Langhantel', INITIAL_EXERCISE_CATALOG);
    assert.equal(matches[0]?.exercise.id, 'ex-barbell-bench-press-medium-grip');
  });
});
