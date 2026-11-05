import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SetType, WeightUnit } from '../enums';
import { ImportFileSchema } from '../schemas';
import { buildImportFile, type BuildImportFileInput } from './import-file.util';

// Shared with `ImportFileBuilderTests.swift`: both builders must produce the expected output.
const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8'));
const input = fixture('import-builder-input.json') as BuildImportFileInput & {
  exportedAt: string;
};
const expected = fixture('import-builder-output.json');
const customId = input.customExercises[0]!.id;

describe('buildImportFile', () => {
  const file = buildImportFile({ ...input, exportedAt: new Date(input.exportedAt) });

  it('matches the shared expected output', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(file)), expected);
  });

  it('produces files that validate against the import schema', () => {
    for (const candidate of [file, expected]) {
      const result = ImportFileSchema.safeParse(candidate);
      assert.equal(result.success, true, JSON.stringify(result.error?.issues));
    }
  });

  it('uses entity ids as keys and references exercises by slug or custom key', () => {
    assert.deepEqual(
      file.customExercises.map((e) => [e.key, e.instructions]),
      [[customId, ['Push.']]],
    );
    const [t1, t2] = file.templates;
    assert.equal(t1!.folderKey, 'folder-1');
    assert.equal(t2!.folderKey, undefined);
    assert.equal(t1!.exercises.length, 1, 'exercises missing from the catalog are dropped');
    assert.deepEqual(t1!.exercises[0]!.exercise, { slug: 'barbell-bench-press-medium-grip' });
    assert.deepEqual(t1!.exercises[0]!.alternativeExercises, [{ customKey: customId }]);
    assert.deepEqual(
      t1!.exercises[0]!.sets.map((s) => [s.setType, s.weight]),
      [
        [SetType.WARMUP, 48],
        [SetType.WORKING, 80],
        [SetType.WORKING, 80],
        [SetType.WORKING, 80],
      ],
    );
  });

  it('exports completed sessions only and drops values out of range', () => {
    assert.deepEqual(
      file.sessions.map((s) => [s.key, s.templateKey]),
      [
        ['s-1', 'tpl-1'],
        ['s-3', undefined],
      ],
    );
    const [ex] = file.sessions[0]!.exercises;
    assert.equal(file.sessions[0]!.exercises.length, 1);
    assert.deepEqual(ex!.exercise, { customKey: customId });
    assert.deepEqual(ex!.sets[0], {
      setNumber: 1,
      setType: SetType.WORKING,
      weightUnit: WeightUnit.KG,
      reps: 8,
      rpe: 8.5,
      completed: true,
    });
  });
});
