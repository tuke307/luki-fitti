/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed test fixtures and mocks */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ImportFileSchema,
  IMPORT_LIMITS,
  formatImportIssues,
  type ImportFileInput,
} from './import';

const example = (): ImportFileInput =>
  JSON.parse(
    readFileSync(
      new URL('../utils/__fixtures__/import-file-example.json', import.meta.url),
      'utf8',
    ),
  ) as ImportFileInput;

function issuesOf(file: unknown) {
  const result = ImportFileSchema.safeParse(file);
  assert.equal(result.success, false, 'expected the file to be rejected');
  return formatImportIssues(result.error!);
}

const session = (key: string, sets = 1) => ({
  key,
  workoutName: 'W',
  startedAt: '2026-01-01T10:00:00Z',
  completedAt: '2026-01-01T11:00:00Z',
  exercises: [
    {
      exercise: { slug: 'barbell-squat' },
      orderIndex: 0,
      sets: Array.from({ length: sets }, (_, i) => ({
        setNumber: i + 1,
        setType: 'WORKING',
        weightUnit: 'KG',
        completed: true,
      })),
    },
  ],
});

describe('ImportFileSchema', () => {
  it('accepts the shared example file and fills template set defaults', () => {
    const parsed = ImportFileSchema.parse(example());
    assert.equal(parsed.sessions.length, 1);
    assert.equal(parsed.templates[0]!.exercises[0]!.sets[0]!.durationSeconds, null);
  });

  it('accepts an empty file', () => {
    const file = { ...example(), customExercises: [], folders: [], templates: [], sessions: [] };
    assert.equal(ImportFileSchema.safeParse(file).success, true);
  });

  it('rejects another format', () => {
    assert.deepEqual(
      issuesOf({ ...example(), format: 'luki-fitti-import@2' }).map((i) => i.path),
      ['format'],
    );
  });

  it('rejects unknown fields at every level', () => {
    const file = example() as any;
    file.extra = 1;
    file.sessions[0].exercises[0].sets[0].distance = 5;
    file.templates[0].exercises[0].sets[0].tempo = '3-1-1';
    const paths = issuesOf(file).map((i) => i.path);
    assert.ok(paths.includes(''));
    assert.ok(paths.includes('sessions.0.exercises.0.sets.0'));
    assert.ok(paths.includes('templates.0.exercises.0.sets.0'));
  });

  it('enforces value bounds', () => {
    const cases: Array<[(f: any) => void, string]> = [
      [(f) => (f.sessions[0].exercises[0].sets[0].weight = 1501), 'weight'],
      [(f) => (f.sessions[0].exercises[0].sets[0].reps = 1001), 'reps'],
      [(f) => (f.sessions[0].exercises[0].sets[0].rpe = 11), 'rpe'],
      [(f) => (f.sessions[0].exercises[0].sets[0].durationSeconds = 86_401), 'durationSeconds'],
      [(f) => (f.sessions[0].activeDurationSeconds = 86_401), 'activeDurationSeconds'],
      [(f) => (f.sessions[0].startedAt = '1999-12-31T23:00:00Z'), 'startedAt'],
      [(f) => (f.sessions[0].completedAt = '2999-01-01T00:00:00Z'), 'completedAt'],
      [(f) => (f.sessions[0].startedAt = 'yesterday'), 'startedAt'],
      [(f) => (f.sessions[0].key = 'k'.repeat(121)), 'key'],
      [(f) => (f.source.app = 'a'.repeat(61)), 'app'],
      [(f) => (f.folders[0].name = 'n'.repeat(81)), 'name'],
      [(f) => (f.folders[0].color = 'blue'), 'color'],
    ];
    for (const [mutate, field] of cases) {
      const file = example();
      mutate(file);
      const paths = issuesOf(file).map((i) => i.path);
      assert.ok(
        paths.some((p) => p.endsWith(field)),
        `${field}: ${paths.join(', ')}`,
      );
    }
  });

  it('rejects completedAt before startedAt', () => {
    const file = example() as any;
    file.sessions[0].completedAt = '2026-10-30T16:00:00.000Z';
    assert.deepEqual(
      issuesOf(file).map((i) => i.path),
      ['sessions.0.completedAt'],
    );
  });

  it('limits list sizes and the total number of sets', () => {
    const tooManyFolders = {
      ...example(),
      templates: [],
      sessions: [],
      folders: Array.from({ length: IMPORT_LIMITS.folders + 1 }, (_, i) => ({
        key: `f${i}`,
        name: `F${i}`,
      })),
    };
    assert.deepEqual(
      issuesOf(tooManyFolders).map((i) => i.path),
      ['folders'],
    );

    const sessions = Array.from({ length: 2_001 }, (_, i) => session(`s${i}`, 100));
    const tooManySets = { ...example(), templates: [], sessions };
    const issues = issuesOf(tooManySets);
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.message, /200000 sets/);
  });

  it('rejects dangling references and duplicate keys', () => {
    const file = example() as any;
    file.templates[0].folderKey = 'missing-folder';
    file.templates[0].exercises[1].exercise = { customKey: 'missing-exercise' };
    file.templates[0].exercises[0].alternativeExercises = [{ customKey: 'nope' }];
    file.sessions[0].templateKey = 'missing-template';
    file.sessions.push(session('session-2026-10-30'));
    file.folders.push({ key: 'other', name: 'Push / Pull' });
    const paths = issuesOf(file).map((i) => i.path);
    assert.deepEqual(paths.sort(), [
      'folders.1.name',
      'sessions.0.templateKey',
      'sessions.1.key',
      'templates.0.exercises.0.alternativeExercises.0.customKey',
      'templates.0.exercises.1.exercise.customKey',
      'templates.0.folderKey',
    ]);
  });

  it('reports at most 50 issues without echoing input values', () => {
    const file = example() as any;
    file.sessions = Array.from({ length: 80 }, (_, i) => ({
      ...session(`s${i}`),
      workoutName: `secret-${'x'.repeat(170)}`,
    }));
    const issues = issuesOf(file);
    assert.equal(issues.length, 50);
    assert.ok(issues.every((i) => !i.message.includes('secret')));
  });
});
