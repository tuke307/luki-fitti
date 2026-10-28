import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findSimilarExercises } from '../../utils/exercise-match.util';
import { INITIAL_EXERCISE_CATALOG, resolveExerciseMedia } from '../data';
import { localizeExercise } from '../localize';
import { ALL_SYSTEM_EXERCISES, EXTENDED_EXERCISE_CATALOG } from './index';

describe('extended exercise catalog', () => {
  it('adds a large catalog without clashing with the curated one', () => {
    assert.ok(EXTENDED_EXERCISE_CATALOG.length > 800);
    const ids = new Set<string>();
    const slugs = new Set<string>();
    for (const ex of ALL_SYSTEM_EXERCISES) {
      assert.ok(!ids.has(ex.id), `duplicate id ${ex.id}`);
      assert.ok(!slugs.has(ex.slug), `duplicate slug ${ex.slug}`);
      ids.add(ex.id);
      slugs.add(ex.slug);
      assert.ok(ex.name.trim(), `empty name ${ex.id}`);
    }
    assert.equal(
      ALL_SYSTEM_EXERCISES.length,
      INITIAL_EXERCISE_CATALOG.length + EXTENDED_EXERCISE_CATALOG.length,
    );
  });

  it('contains the requested machine variants with German names', () => {
    const torso = EXTENDED_EXERCISE_CATALOG.find((e) => e.id === 'ex-rotary-torso-machine');
    assert.ok(torso);
    assert.equal(localizeExercise(torso, 'de').name, 'Torso-Rotation-Maschine');
    assert.ok(torso.tags.includes('bauch-twist gerät'));
    assert.ok(
      EXTENDED_EXERCISE_CATALOG.some((e) => e.id === 'ex-smith-machine-overhead-shoulder-press'),
    );
  });

  it('localizes every imported exercise and keeps its photos', () => {
    for (const ex of EXTENDED_EXERCISE_CATALOG) {
      const de = localizeExercise(ex, 'de');
      assert.ok(de.name.trim() && de.description.trim(), `missing German text ${ex.id}`);
    }
    const smith = EXTENDED_EXERCISE_CATALOG.find(
      (e) => e.id === 'ex-smith-machine-overhead-shoulder-press',
    )!;
    assert.ok(
      resolveExerciseMedia({ id: smith.id, slug: smith.slug, isSystem: true }).some(
        (m) => m.mediaType === 'IMAGE',
      ),
    );
  });

  it('suggests the Smith machine shoulder press for "Sitzendes Schulterdrücken Multipresse"', () => {
    const matches = findSimilarExercises(
      'Sitzendes Schulterdrücken Multipresse',
      ALL_SYSTEM_EXERCISES.map((e) => localizeExercise(e, 'de')),
    );
    assert.ok(
      matches.some((m) => m.exercise.id === 'ex-smith-machine-overhead-shoulder-press'),
      matches.map((m) => m.exercise.id).join(', '),
    );
  });
});
