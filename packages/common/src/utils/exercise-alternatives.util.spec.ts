import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ExerciseType, MovementPattern } from '../enums';
import type { WorkoutSessionDto } from '../schemas';
import { CORE_EXERCISE_CATALOG } from '../catalog/data';
import { ALL_SYSTEM_EXERCISES } from '../catalog/extended';
import { areMovementPatternsCompatible, rankAlternatives } from './exercise-alternatives.util';

interface AlternativesCase {
  target: string;
  pattern: MovementPattern;
  laterality?: string;
  /** Exact top 3, shared with `ExerciseAlternativesTests.swift` to keep both ports in sync. */
  top: string[];
  exclude: string[];
}

const cases = JSON.parse(
  readFileSync(new URL('./__fixtures__/alternatives-cases.json', import.meta.url), 'utf8'),
) as AlternativesCase[];

const byId = new Map(ALL_SYSTEM_EXERCISES.map((e) => [e.id, e]));
const coreIds = CORE_EXERCISE_CATALOG.map((e) => e.id);
const exercise = (id: string) => byId.get(id)!;

describe('rankAlternatives — shared cases', () => {
  for (const c of cases) {
    it(`ranks alternatives for ${c.target}`, () => {
      const ranked = rankAlternatives(exercise(c.target), ALL_SYSTEM_EXERCISES, {
        popularIds: coreIds,
      });
      const top = ranked.slice(0, 3);
      assert.deepEqual(
        top.map((r) => r.exercise.id),
        c.top,
      );
      for (const r of top) {
        assert.ok(
          r.exercise.movementPattern === c.pattern ||
            areMovementPatternsCompatible(c.pattern, r.exercise.movementPattern!),
          `${r.exercise.id} is ${r.exercise.movementPattern}`,
        );
        if (c.laterality) assert.equal(r.exercise.laterality, c.laterality, r.exercise.id);
      }
      const all = new Set(ranked.map((r) => r.exercise.id));
      for (const id of c.exclude) assert.ok(!all.has(id), `${c.target} ranked ${id}`);
    });
  }
});

describe('rankAlternatives', () => {
  const pulldown = exercise('ex-straight-arm-pulldown');

  it('never suggests a different movement, however close the muscle', () => {
    const ids = rankAlternatives(pulldown, ALL_SYSTEM_EXERCISES).map((r) => r.exercise.id);
    assert.ok(!ids.includes('ex-alternative-db-gorilla-rows'));
    assert.ok(ids.includes('ex-straight-arm-dumbbell-pullover'));
    assert.ok(!ids.includes(pulldown.id));
  });

  it('explains each match', () => {
    const [first] = rankAlternatives(pulldown, ALL_SYSTEM_EXERCISES);
    assert.equal(first!.exercise.id, 'ex-rope-straight-arm-pulldown');
    assert.deepEqual(first!.reasons, [
      'YOUR_ALTERNATIVE',
      'SAME_MOVEMENT',
      'SAME_MUSCLES',
      'SAME_SIDE',
    ]);
  });

  it('skips excluded exercises and stretches', () => {
    const ranked = rankAlternatives(pulldown, ALL_SYSTEM_EXERCISES, {
      excludeIds: ['ex-rope-straight-arm-pulldown'],
    });
    assert.ok(ranked.every((r) => r.exercise.id !== 'ex-rope-straight-arm-pulldown'));
    assert.ok(ranked.every((r) => r.exercise.exerciseType !== ExerciseType.STRETCHING));
  });

  it("keeps the user's own alternatives even when their movement differs", () => {
    const match = rankAlternatives(pulldown, ALL_SYSTEM_EXERCISES, {
      preferredIds: ['ex-wide-grip-lat-pulldown'],
    }).find((r) => r.exercise.id === 'ex-wide-grip-lat-pulldown');
    assert.ok(match);
    assert.deepEqual(match.reasons.slice(0, 1), ['YOUR_ALTERNATIVE']);
  });

  it('prefers exercises the user has logged before', () => {
    const history = [
      {
        exercises: [
          { exerciseId: 'ex-wide-grip-decline-barbell-pullover', sets: [{ completed: true }] },
        ],
      },
    ] as unknown as WorkoutSessionDto[];
    const target = { ...pulldown, alternativeExerciseIds: [] };
    const without = rankAlternatives(target, ALL_SYSTEM_EXERCISES).find(
      (r) => r.exercise.id === 'ex-wide-grip-decline-barbell-pullover',
    )!;
    const withHistory = rankAlternatives(target, ALL_SYSTEM_EXERCISES, {
      historySessions: history,
    }).find((r) => r.exercise.id === 'ex-wide-grip-decline-barbell-pullover')!;
    assert.ok(withHistory.score > without.score);
    assert.ok(withHistory.reasons.includes('DONE_BEFORE'));
  });

  it('returns nothing for an exercise without a known movement', () => {
    const custom = { ...pulldown, id: 'custom', movementPattern: null, alternativeExerciseIds: [] };
    assert.deepEqual(rankAlternatives(custom, ALL_SYSTEM_EXERCISES), []);
  });

  it('accepts weaker but compatible movements', () => {
    assert.ok(
      areMovementPatternsCompatible(MovementPattern.INCLINE_PUSH, MovementPattern.HORIZONTAL_PUSH),
    );
    assert.ok(
      !areMovementPatternsCompatible(
        MovementPattern.SHOULDER_EXTENSION,
        MovementPattern.VERTICAL_PULL,
      ),
    );
    assert.ok(
      !areMovementPatternsCompatible(
        MovementPattern.SHOULDER_EXTENSION,
        MovementPattern.HORIZONTAL_PULL,
      ),
    );
  });
});
