import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildExerciseSearchIndex, searchExercises } from '../../utils/exercise-search.util';
import {
  DEFAULT_STARTER_TEMPLATES,
  DEFAULT_STRETCHING_ROUTINES,
  INITIAL_EXERCISE_CATALOG,
  resolveExerciseMedia,
} from '../data';
import { localizeExercise } from '../localize';
import { EXERCISE_OVERRIDES } from '../overrides';
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

  it('never shows two exercises with the same name', () => {
    const norm = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    for (const locale of ['en', 'de'] as const) {
      const seen = new Map<string, string>();
      for (const ex of ALL_SYSTEM_EXERCISES) {
        const key = norm(localizeExercise(ex, locale).name);
        assert.ok(!seen.has(key), `${locale}: ${ex.id} and ${seen.get(key)} are both "${key}"`);
        seen.set(key, ex.id);
      }
    }
  });

  it('builds every core exercise on a dataset entry with its hand-written text', () => {
    for (const [id, override] of Object.entries(EXERCISE_OVERRIDES)) {
      const ex = INITIAL_EXERCISE_CATALOG.find((e) => e.id === id);
      assert.ok(ex, `override ${id} has no dataset exercise`);
      assert.equal(ex.name, override.name);
      for (const alt of override.alternativeExerciseIds) {
        assert.ok(
          ALL_SYSTEM_EXERCISES.some((e) => e.id === alt),
          `${id}: unknown alternative ${alt}`,
        );
      }
    }
    const starterIds = [
      ...DEFAULT_STARTER_TEMPLATES.flatMap((t) => t.exercises),
      ...DEFAULT_STRETCHING_ROUTINES.flatMap((r) => r.exercises),
    ].map((e) => e.exerciseId);
    for (const id of starterIds) assert.ok(id in EXERCISE_OVERRIDES, `starter uses ${id}`);
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
    const matches = searchExercises(
      buildExerciseSearchIndex(ALL_SYSTEM_EXERCISES.map((e) => localizeExercise(e, 'de'))),
      'Sitzendes Schulterdrücken Multipresse',
      { limit: 3, matchAllWords: false },
    );
    assert.ok(
      matches.some((m) => m.exercise.id === 'ex-smith-machine-overhead-shoulder-press'),
      matches.map((m) => m.exercise.id).join(', '),
    );
  });
});
