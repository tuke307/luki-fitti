import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './gymlife-to-luki.mjs';

// Made-up tables in the shape of `sqlite3 -json` dumps (docs/gymlife-import.md, step 4).
const tables = fileURLToPath(new URL('./__fixtures__/gymlife-json-tables', import.meta.url));
const mapping = fileURLToPath(new URL('./__fixtures__/gymlife-mapping.json', import.meta.url));

async function run(args) {
  let stdout = '';
  let stderr = '';
  const code = await main(args, {
    stdout: { write: (c) => (stdout += c) },
    stderr: { write: (c) => (stderr += c) },
  });
  return { code, stdout, stderr };
}

describe('gymlife-to-luki', () => {
  it('converts folders, templates and completed workouts', async () => {
    const { code, stdout, stderr } = await run([tables, '--map', mapping]);
    assert.equal(code, 0, stderr);
    const file = JSON.parse(stdout);
    assert.deepEqual(file.folders, [{ key: 'gymlife:folder:10', name: '4er Split', sortOrder: 0 }]);
    assert.deepEqual(
      file.templates.map((t) => [t.key, t.folderKey, t.name, t.exercises.length]),
      [['gymlife:training:11', 'gymlife:folder:10', 'Day 1', 2]],
    );
    assert.deepEqual(
      file.templates[0].exercises[0].sets.map((s) => [s.setType, s.weight, s.reps]),
      [
        ['WARMUP', 40, 10],
        ['WORKING', 80, 8],
      ],
    );
    assert.equal(file.sessions.length, 1, 'unfinished logs are skipped');
    const [session] = file.sessions;
    assert.equal(session.templateKey, 'gymlife:training:11');
    assert.equal(session.workoutName, 'Day 1');
    assert.equal(session.startedAt, '2026-10-23T17:00:00.500Z');
    assert.equal(session.completedAt, '2026-10-23T18:00:00.500Z');
    assert.deepEqual(
      session.exercises.map((e) => e.exercise.slug),
      ['barbell-bench-press-medium-grip', 'barbell-squat'],
    );
  });

  it('lists exercises missing from the mapping', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gymlife-map-'));
    try {
      const partial = join(dir, 'mapping.json');
      writeFileSync(partial, JSON.stringify({ 'Bench Press': 'barbell-bench-press-medium-grip' }));
      const { code, stderr } = await run([tables, '--map', partial]);
      assert.equal(code, 1);
      assert.match(stderr, /- Back Squat\n/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('names the columns a table actually has when a required one is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gymlife-cols-'));
    try {
      cpSync(tables, dir, { recursive: true });
      const logs = JSON.parse(readFileSync(join(dir, 'TrainingExerciseLog.json'), 'utf8'));
      writeFileSync(
        join(dir, 'TrainingExerciseLog.json'),
        JSON.stringify(
          logs.map(({ TrainingLogID, ...rest }) => ({ ...rest, LogRef: TrainingLogID })),
        ),
      );
      const { code, stderr } = await run([dir, '--map', mapping]);
      assert.equal(code, 1);
      assert.match(stderr, /TrainingExerciseLog\.json has no TrainingLogID\/TrainingLogId column/);
      assert.match(stderr, /LogRef/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
