import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { main } from './gymlife-to-luki.mjs';

// Made-up tables in the shape of `sqlite3 -json` dumps, used to build a temp SQLite file.
const tables = fileURLToPath(new URL('./__fixtures__/gymlife-json-tables', import.meta.url));
const mapping = fileURLToPath(new URL('./__fixtures__/gymlife-mapping.json', import.meta.url));

/** Writes the JSON fixtures into a temp .sqlite file; `overrides` replaces table rows. */
function buildSqlite(overrides = {}, { skip = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gymlife-db-'));
  const path = join(dir, 'gymlife.sqlite');
  const db = new DatabaseSync(path);
  for (const file of readdirSync(tables)) {
    const table = file.replace(/\.json$/, '');
    if (skip.includes(table)) continue;
    const rows = overrides[table] ?? JSON.parse(readFileSync(join(tables, file), 'utf8'));
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    assert.ok(columns.length > 0, `fixture ${file} has no columns`);
    db.exec(`CREATE TABLE "${table}" (${columns.map((c) => `"${c}"`).join(', ')})`);
    const insert = db.prepare(
      `INSERT INTO "${table}" VALUES (${columns.map(() => '?').join(', ')})`,
    );
    for (const row of rows) insert.run(...columns.map((c) => row[c] ?? null));
  }
  db.close();
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

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
    const { path, cleanup } = buildSqlite();
    try {
      const { code, stdout, stderr } = await run([path, '--map', mapping]);
      assert.equal(code, 0, stderr);
      const file = JSON.parse(stdout);
      assert.deepEqual(file.folders, [
        { key: 'gymlife:folder:10', name: '4er Split', sortOrder: 0 },
      ]);
      assert.deepEqual(
        file.templates.map((t) => [t.key, t.folderKey, t.name, t.exercises.length]),
        [['gymlife:training:11', 'gymlife:folder:10', 'Day 1', 2]],
      );
      assert.deepEqual(
        file.templates[0].exercises[0].sets.map((s) => [s.setType, s.weight, s.reps]),
        [
          ['WARMUP', 40, 10],
          ['WORKING', 80, 8],
          ['WORKING', 80, 8],
          ['WORKING', 80, 8],
        ],
        'sets follow the ids and NumberOfSets repeats a row',
      );
      assert.equal(file.sessions.length, 1, 'unfinished logs are skipped');
      const [session] = file.sessions;
      assert.equal(session.templateKey, 'gymlife:training:11');
      assert.equal(session.workoutName, 'Day 1', 'an empty log name falls back to the template');
      assert.equal(session.startedAt, '2026-10-23T17:00:00.500Z');
      assert.equal(session.completedAt, '2026-10-23T18:00:00.500Z');
      assert.deepEqual(
        session.exercises.map((e) => e.exercise.slug),
        ['barbell-bench-press-medium-grip', 'barbell-squat'],
      );
      assert.deepEqual(
        session.exercises[0].sets.map((s) => [s.setNumber, s.setType, s.weight, s.reps]),
        [
          [1, 'WARMUP', 40, 10],
          [2, 'WORKING', 80, 8],
          [3, 'WORKING', 80, 8],
        ],
      );
      assert.deepEqual(file.customExercises, []);
    } finally {
      cleanup();
    }
  });

  it('emits unmapped exercises as custom exercises and notes them on stderr', async () => {
    const { path, cleanup } = buildSqlite();
    const dir = mkdtempSync(join(tmpdir(), 'gymlife-map-'));
    try {
      const partial = join(dir, 'mapping.json');
      writeFileSync(partial, JSON.stringify({ 'Bench Press': 'barbell-bench-press-medium-grip' }));
      const { code, stdout, stderr } = await run([path, '--map', partial]);
      assert.equal(code, 0, stderr);
      assert.match(stderr, /Imported as custom exercises/);
      assert.match(stderr, /- Back Squat\n/);
      const file = JSON.parse(stdout);
      assert.deepEqual(file.customExercises, [
        {
          key: 'gymlife:exercise:2',
          name: 'Back Squat',
          primaryMuscleGroup: 'BACK',
          equipment: 'DUMBBELL',
          exerciseType: 'STRENGTH',
          instructions: ['Brace.', 'Squat down.', 'Drive up.'],
        },
      ]);
      assert.deepEqual(file.templates[0].exercises[1].exercise, {
        customKey: 'gymlife:exercise:2',
      });
      assert.deepEqual(file.sessions[0].exercises[1].exercise, {
        customKey: 'gymlife:exercise:2',
      });
    } finally {
      cleanup();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('imports a soft-deleted exercise that history still references', async () => {
    const { path, cleanup } = buildSqlite({
      TrainingExerciseLog: [
        {
          TrainingExerciseLogID: 50,
          TrainingLogID: 40,
          ExerciseID: 1,
          OrderNumber: 0,
          Duration: 1800,
        },
        {
          TrainingExerciseLogID: 52,
          TrainingLogID: 40,
          ExerciseID: 3,
          OrderNumber: 1,
          Duration: 1500,
        },
      ],
      GymSetLog: [
        {
          GymSetLogID: 60,
          TrainingExerciseLogID: 50,
          NumberOfSets: 1,
          NumberOfRepetitions: 10,
          Weight: 40,
          SetType: 1,
        },
        {
          GymSetLogID: 63,
          TrainingExerciseLogID: 52,
          NumberOfSets: 1,
          NumberOfRepetitions: 1,
          Weight: 0,
          SetType: 0,
        },
      ],
    });
    try {
      const { code, stdout, stderr } = await run([path, '--map', mapping]);
      assert.equal(code, 0, stderr);
      const file = JSON.parse(stdout);
      const [session] = file.sessions;
      assert.equal(session.exercises.length, 2, 'the deleted exercise is not dropped');
      assert.deepEqual(session.exercises[1].exercise, { customKey: 'gymlife:exercise:3' });
      assert.deepEqual(file.customExercises, [
        {
          key: 'gymlife:exercise:3',
          name: 'Old Stretch',
          primaryMuscleGroup: 'BACK',
          equipment: 'FOAM_ROLLER',
          exerciseType: 'STRETCHING',
          instructions: ['Hold the stretch.'],
        },
      ]);
    } finally {
      cleanup();
    }
  });

  it('falls back to the exercise durations when a log Duration exceeds 24h', async () => {
    const { path, cleanup } = buildSqlite({
      TrainingLog: [
        {
          TrainingLogID: 40,
          TrainingID: 11,
          Name: '',
          Date: 1792774800.5,
          Duration: 173416,
          IsCompleted: 1,
          Deleted: 0,
        },
      ],
    });
    try {
      const { code, stdout, stderr } = await run([path, '--map', mapping]);
      assert.equal(code, 0, stderr);
      const [session] = JSON.parse(stdout).sessions;
      assert.equal(session.activeDurationSeconds, 3300, '1800 + 1500 from TrainingExerciseLog');
      assert.equal(session.completedAt, '2026-10-23T17:55:00.500Z');
    } finally {
      cleanup();
    }
  });

  it('lists referenced exercises for building a mapping', async () => {
    const { path, cleanup } = buildSqlite({
      TrainingExerciseLog: [
        {
          TrainingExerciseLogID: 50,
          TrainingLogID: 40,
          ExerciseID: 1,
          OrderNumber: 0,
          Duration: 1800,
        },
        {
          TrainingExerciseLogID: 52,
          TrainingLogID: 40,
          ExerciseID: 3,
          OrderNumber: 1,
          Duration: 1500,
        },
      ],
    });
    try {
      const { code, stdout, stderr } = await run([path, '--list-exercises']);
      assert.equal(code, 0, stderr);
      const list = JSON.parse(stdout);
      assert.deepEqual(
        list.map((e) => e.name),
        ['Back Squat', 'Bench Press', 'Old Stretch'],
        'sorted by name, includes soft-deleted exercises',
      );
      const squat = list[0];
      assert.equal(squat.id, 2);
      assert.equal(squat.code, 101);
      assert.equal(squat.builtInName, 'Squat');
      assert.equal(squat.userCreated, false);
      assert.equal(squat.equipment, 'DUMBBELL');
      assert.equal(squat.primaryMuscleGroup, 'BACK');
      assert.deepEqual(squat.gymlifeMuscleGroups, ['Middle Back & Lats', 'Quadriceps']);
      assert.equal(squat.description, 'Brace. / Squat down. / Drive up.');
      assert.equal(squat.templateUses, 1);
      assert.equal(squat.sessionUses, 0, 'the deleted stretch took its session use');
      assert.equal(squat.deleted, false);
      const old = list[2];
      assert.equal(old.userCreated, true, 'no ExerciseCode and IsDefaultExercise false');
      assert.equal(old.deleted, true);
      assert.equal(old.sessionUses, 1);
      assert.equal(old.templateUses, 0);
    } finally {
      cleanup();
    }
  });

  it('names the columns a table actually has when a required one is missing', async () => {
    const { path, cleanup } = buildSqlite({
      TrainingExerciseLog: [
        { TrainingExerciseLogID: 50, LogRef: 40, ExerciseID: 1, OrderNumber: 0 },
      ],
    });
    try {
      const { code, stderr } = await run([path, '--map', mapping]);
      assert.equal(code, 1);
      assert.match(stderr, /Table TrainingExerciseLog has no TrainingLogID\/TrainingLogId column/);
      assert.match(stderr, /LogRef/);
    } finally {
      cleanup();
    }
  });

  it('fails clearly when a required table is missing', async () => {
    const { path, cleanup } = buildSqlite({}, { skip: ['GymSetLog'] });
    try {
      const { code, stderr } = await run([path, '--map', mapping]);
      assert.equal(code, 1);
      assert.match(stderr, /Missing table "GymSetLog"/);
    } finally {
      cleanup();
    }
  });
});
