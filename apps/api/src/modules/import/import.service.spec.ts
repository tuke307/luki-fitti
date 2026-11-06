/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed test fixtures and mocks */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BadRequestException } from '@nestjs/common';
import { ImportService } from './import.service';
import { SessionService } from '../session/session.service';
import { importId } from './uuid-v5';

const EXAMPLE = readFileSync(
  new URL(
    '../../../../../packages/common/src/utils/__fixtures__/import-file-example.json',
    import.meta.url,
  ),
  'utf8',
);
const example = () => JSON.parse(EXAMPLE);

type Row = Record<string, any>;
const TABLES = [
  'exercise',
  'exerciseMuscleGroup',
  'workoutFolder',
  'workoutTemplate',
  'workoutTemplateExercise',
  'workoutSession',
  'sessionExercise',
  'sessionSet',
  'userPreferences',
  'importJob',
] as const;
type Table = (typeof TABLES)[number];

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([field, cond]) => {
    if (field === 'OR') return (cond as Row[]).some((c) => matches(row, c));
    if (cond && typeof cond === 'object' && 'in' in cond) return cond.in.includes(row[field]);
    return row[field] === cond;
  });
}

/** In-memory Prisma stand-in with snapshot rollback for `$transaction`. */
function createDb(options: { failOn?: Table } = {}) {
  let store: Record<Table, Map<string, Row>> = Object.fromEntries(
    TABLES.map((t) => [t, new Map()]),
  ) as any;
  const keyOf = (table: Table, row: Row) =>
    table === 'exerciseMuscleGroup' ? `${row.exerciseId}:${row.muscleGroup}` : row.id;
  let jobSeq = 0;
  const delegate = (table: Table) => ({
    findMany: async ({ where }: Row) => [...store[table].values()].filter((r) => matches(r, where)),
    findUnique: async ({ where }: Row) =>
      [...store[table].values()].find((r) => matches(r, where)) ?? null,
    createMany: async ({ data }: { data: Row[] }) => {
      if (options.failOn === table) throw new Error('simulated database failure');
      let count = 0;
      for (const row of data) {
        if (store[table].has(keyOf(table, row))) continue;
        store[table].set(keyOf(table, row), { ...row });
        count += 1;
      }
      return { count };
    },
    create: async ({ data }: { data: Row }) => {
      const row = { id: `job-${++jobSeq}`, ...data };
      store[table].set(row.id, row);
      return row;
    },
  });
  const db: any = Object.fromEntries(TABLES.map((t) => [t, delegate(t)]));
  db.$transaction = async (fn: (tx: any) => Promise<unknown>, opts: Row) => {
    assert.ok(opts.timeout >= 60_000, 'commit needs a long interactive transaction timeout');
    const snapshot = structuredClone(store);
    try {
      return await fn(db);
    } catch (error) {
      store = snapshot;
      throw error;
    }
  };
  const rows = (table: Table) => [...store[table].values()];
  const seed = (table: Table, row: Row) => store[table].set(keyOf(table, row), row);
  for (const slug of ['barbell-bench-press-medium-grip', 'incline-dumbbell-press']) {
    seed('exercise', {
      id: `ex-${slug}`,
      slug,
      userId: null,
      isSystem: true,
      name: slug,
      primaryMuscleGroup: 'CHEST',
      exerciseType: 'STRENGTH',
    });
  }
  return { db, rows, seed, size: (t: Table) => store[t].size };
}

function createService(options: { failOn?: Table } = {}) {
  const mock = createDb(options);
  const service = new ImportService(mock.db, new SessionService(mock.db));
  return { ...mock, service };
}

const ALL_NEW = { total: 1, new: 1, existing: 0 };
const ALL_EXISTING = { total: 1, new: 0, existing: 1 };

describe('ImportService', () => {
  it('previews the example file without writing anything', async () => {
    const { service, size } = createService();
    const preview = await service.preview('user-a', example(), 'en');
    assert.deepEqual(preview.counts, {
      customExercises: ALL_NEW,
      folders: ALL_NEW,
      templates: ALL_NEW,
      sessions: ALL_NEW,
    });
    assert.equal(preview.totalSets, 4);
    assert.equal(preview.newSets, 4);
    assert.equal(preview.earliestSessionAt, '2026-10-30T17:00:00.000Z');
    assert.deepEqual(preview.unknownSlugs, []);
    assert.deepEqual(preview.warnings, []);
    assert.equal(size('workoutSession') + size('workoutFolder') + size('importJob'), 0);
  });

  it('imports every kind with derived ids and session totals', async () => {
    const { service, rows } = createService();
    const result = await service.commit('user-a', example(), 'en');
    assert.deepEqual(result.counts.sessions, ALL_NEW);
    assert.ok(result.jobId);

    const [session] = rows('workoutSession');
    const sessionId = importId('user-a', 'session', 'session-2026-10-30');
    assert.equal(session!.id, sessionId);
    assert.equal(session!.clientSessionId, sessionId);
    assert.equal(session!.status, 'COMPLETED');
    assert.equal(session!.sourceDevice, 'IMPORT');
    assert.equal(session!.templateId, importId('user-a', 'template', 'tpl-push'));
    // Warm-ups do not count towards volume: 80×8 + 80×7 + 25×10.
    assert.equal(session!.totalVolumeKg, 1450);
    assert.equal(session!.totalSetsCompleted, 4);
    assert.equal(session!.totalRepsCompleted, 35);
    assert.equal(rows('sessionExercise').length, 2);
    assert.equal(rows('sessionSet').length, 4);
    assert.equal(rows('sessionExercise')[0]!.exerciseNameSnapshot, 'Barbell Bench Press');

    const custom = rows('exercise').find((e) => !e.isSystem)!;
    assert.equal(custom.id, importId('user-a', 'exercise', 'ex-landmine-press'));
    assert.equal(custom.userId, 'user-a');
    assert.equal(rows('exerciseMuscleGroup').length, 1);

    const [folder] = rows('workoutFolder');
    const [template] = rows('workoutTemplate');
    assert.equal(template!.folderId, folder!.id);
    const tes = rows('workoutTemplateExercise');
    assert.deepEqual(
      tes.map((te) => te.exerciseId),
      ['ex-barbell-bench-press-medium-grip', custom.id],
    );
    assert.deepEqual(tes[0]!.alternativeExerciseIds, ['ex-incline-dumbbell-press']);
    assert.equal(tes[0]!.plannedSets, 2);
    assert.equal(tes[0]!.warmupSets, 1);

    const [job] = rows('importJob');
    assert.equal(job!.status, 'SUCCESS');
    assert.equal(job!.sourceApp, 'Example');
    assert.equal(JSON.stringify(job).includes('Felt strong'), false);
  });

  it('treats a re-import of the same file as a no-op', async () => {
    const { service, size } = createService();
    await service.commit('user-a', example(), 'en');
    const before = ['workoutSession', 'sessionSet', 'workoutTemplate', 'exercise'].map((t) =>
      size(t as Table),
    );
    const again = await service.commit('user-a', example(), 'en');
    assert.deepEqual(again.counts, {
      customExercises: ALL_EXISTING,
      folders: ALL_EXISTING,
      templates: ALL_EXISTING,
      sessions: ALL_EXISTING,
    });
    assert.equal(again.newSets, 0);
    assert.deepEqual(
      ['workoutSession', 'sessionSet', 'workoutTemplate', 'exercise'].map((t) => size(t as Table)),
      before,
    );
    assert.equal(size('importJob'), 2);
  });

  it('gives another user importing the same file distinct ids', async () => {
    const { service, rows } = createService();
    await service.commit('user-a', example(), 'en');
    const result = await service.commit('user-b', example(), 'en');
    assert.deepEqual(result.counts.sessions, ALL_NEW);
    const sessions = rows('workoutSession');
    assert.equal(sessions.length, 2);
    assert.notEqual(sessions[0]!.id, sessions[1]!.id);
    assert.deepEqual(sessions.map((s) => s.userId).sort(), ['user-a', 'user-b']);
    assert.equal(new Set(rows('sessionSet').map((s) => s.id)).size, 8);
  });

  it('blocks the commit while slugs are unknown', async () => {
    const { service, size, rows } = createService();
    const file = example();
    file.sessions[0].exercises[0].exercise = { slug: 'no-such-exercise' };
    const preview = await service.preview('user-a', file, 'en');
    assert.deepEqual(preview.unknownSlugs, ['no-such-exercise']);
    await assert.rejects(service.commit('user-a', file, 'en'), BadRequestException);
    assert.equal(size('workoutSession') + size('workoutTemplate') + size('workoutFolder'), 0);
    assert.equal(rows('importJob')[0]!.status, 'FAILED');
    assert.equal(rows('importJob')[0]!.errorCode, 'UNKNOWN_SLUGS');
  });

  it('rolls back everything when a write fails midway', async () => {
    const { service, size, rows } = createService({ failOn: 'sessionSet' });
    await assert.rejects(service.commit('user-a', example(), 'en'), /Import failed/);
    for (const table of [
      'exercise',
      'workoutFolder',
      'workoutTemplate',
      'workoutSession',
    ] as const) {
      assert.equal(rows(table).filter((r) => !r.isSystem).length, 0, table);
    }
    assert.equal(size('importJob'), 1);
    assert.equal(rows('importJob')[0]!.errorCode, 'COMMIT_FAILED');
  });

  it('reuses an existing folder with the same name and warns about it', async () => {
    const { service, seed, rows } = createService();
    seed('workoutFolder', { id: 'mine', userId: 'user-a', name: 'Push / Pull' });
    const preview = await service.preview('user-a', example(), 'en');
    assert.deepEqual(preview.warnings, [
      { code: 'FOLDER_NAME_REUSED', key: 'folder-push-pull', name: 'Push / Pull' },
    ]);
    assert.deepEqual(preview.counts.folders, ALL_EXISTING);
    await service.commit('user-a', example(), 'en');
    assert.equal(rows('workoutFolder').length, 1);
    assert.equal(rows('workoutTemplate')[0]!.folderId, 'mine');
  });

  it('rejects invalid files with at most 50 issues and records the failed attempt', async () => {
    const { service, rows } = createService();
    const file = example();
    file.sessions = Array.from({ length: 60 }, () => ({ key: 1 }));
    const error = await service.commit('user-a', file, 'en').catch((e) => e);
    assert.ok(error instanceof BadRequestException);
    const body = error.getResponse() as { code: string; errors: unknown[] };
    assert.equal(body.code, 'IMPORT_INVALID_FILE');
    assert.equal(body.errors.length, 50);
    assert.deepEqual(
      rows('importJob').map((j) => [j.status, j.errorCode, j.format]),
      [['FAILED', 'INVALID_FILE', 'luki-fitti-import@1']],
    );
  });
});
