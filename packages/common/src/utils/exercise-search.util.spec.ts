import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getAllLocalizedExercises } from '../catalog/extended';
import { INITIAL_EXERCISE_CATALOG } from '../catalog/data';
import { getExerciseSearchNames } from '../catalog/localize';
import { EQUIPMENT_LABELS, MUSCLE_GROUP_LABELS, SUPPORTED_LOCALES } from '../enums';
import {
  buildExerciseSearchIndex,
  foldSearchText,
  searchExercises,
  searchTokenAlternatives,
} from './exercise-search.util';

interface SearchCase {
  query: string;
  top: number;
  expect: string[];
  exclude?: string[];
}

/** Shared with the Swift port (`ExerciseSearchTests.swift`). */
const CASES: SearchCase[] = JSON.parse(
  readFileSync(new URL('./__fixtures__/exercise-search-cases.json', import.meta.url), 'utf8'),
);

const CORE_IDS = new Set(INITIAL_EXERCISE_CATALOG.map((e) => e.id));

for (const locale of SUPPORTED_LOCALES) {
  describe(`exercise search (${locale})`, () => {
    const index = buildExerciseSearchIndex(getAllLocalizedExercises(locale), {
      names: getExerciseSearchNames,
      labels: (e) => [MUSCLE_GROUP_LABELS[e.primaryMuscleGroup], EQUIPMENT_LABELS[e.equipment]],
      boost: (e) => (CORE_IDS.has(e.id) ? 0.1 : 0),
    });

    for (const c of CASES) {
      it(`"${c.query}" finds ${c.expect.join(', ')} in the top ${c.top}`, () => {
        const results = searchExercises(index, c.query).map((r) => r.exercise.id);
        const top = results.slice(0, Math.max(c.top, c.expect.length));
        for (const id of c.expect) {
          assert.ok(top.includes(id), `${id} not in [${results.slice(0, 8).join(', ')}]`);
        }
        for (const id of c.exclude ?? []) assert.ok(!results.includes(id), `${id} matched`);
      });
    }

    it('returns nothing for an empty query and ranks exact names first', () => {
      assert.deepEqual(searchExercises(index, '   '), []);
      assert.equal(searchExercises(index, 'crunch')[0]!.exercise.name.toLowerCase(), 'crunch');
    });
  });
}

describe('search text normalization', () => {
  it('folds umlauts with or without e and joins multi-word exercise names', () => {
    assert.equal(foldSearchText('Bankdrücken'), foldSearchText('Bankdruecken'));
    assert.equal(foldSearchText('Bankdrücken'), 'bankdrucken');
    assert.deepEqual(searchTokenAlternatives('Sit-Ups'), [[['situp']]]);
    assert.deepEqual(searchTokenAlternatives('sit ups'), [[['situp']]]);
    assert.deepEqual(searchTokenAlternatives('KH'), [[['kh'], ['dumbbell']]]);
  });
});
