import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WeightUnit } from '@luki-fitti/common/enums';
import type { WorkoutFolderDto, WorkoutTemplateDto } from '@luki-fitti/common/schemas';
import {
  deleteOp,
  enqueueOp,
  flushOrder,
  flushWorkoutOutbox,
  folderBody,
  folderUpsertOp,
  isServerId,
  newEntityId,
  nextFolderName,
  outboxKey,
  overlayPendingOps,
  rekeyLegacyEntities,
  templateBody,
  templateUpsertOp,
  type WorkoutOutboxApi,
  type WorkoutOutboxOp,
  type WorkoutsOverview,
} from './workout-outbox';

const FOLDER_A = '11111111-1111-4111-8111-111111111111';
const FOLDER_B = '22222222-2222-4222-8222-222222222222';
const TPL_A = '33333333-3333-4333-8333-333333333333';
const TPL_B = '44444444-4444-4444-8444-444444444444';

function folder(id: string, name: string, sortOrder = 0, templates: WorkoutTemplateDto[] = []) {
  return { id, userId: 'u', name, color: '#E8743B', sortOrder, templates } as WorkoutFolderDto;
}

function template(id: string, folderId: string | null, name = 'Push'): WorkoutTemplateDto {
  return {
    id,
    userId: 'u',
    folderId,
    name,
    description: null,
    estimatedDurationMinutes: 60,
    sortOrder: 0,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    exercises: [
      {
        id: 'te-1',
        templateId: id,
        exerciseId: 'ex-barbell-bench-press',
        orderIndex: 0,
        plannedSets: 3,
        warmupSets: 1,
        targetRepsMin: 8,
        targetRepsMax: 12,
        targetWeight: 60,
        weightUnit: WeightUnit.KG,
        restSeconds: 90,
        targetDurationSeconds: null,
        targetDistanceMeters: null,
        notes: null,
        alternativeExerciseIds: [],
      },
    ],
  };
}

describe('workout outbox: coalescing', () => {
  it('keeps one upsert for a create followed by edits', () => {
    const created = folder(FOLDER_A, 'Legs');
    let outbox = enqueueOp([], folderUpsertOp(created, false));
    outbox = enqueueOp(outbox, folderUpsertOp({ ...created, name: 'Leg day' }));
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0]!.action, 'upsert');
    assert.equal(outbox[0]!.serverKnown, false);
    assert.equal(outbox[0]!.action === 'upsert' && outbox[0]!.payload.name, 'Leg day');
  });

  it('drops a create and a delete that never reached the server', () => {
    let outbox = enqueueOp([], templateUpsertOp(template(TPL_A, null), false));
    outbox = enqueueOp(outbox, deleteOp('template', TPL_A));
    assert.deepEqual(outbox, []);
  });

  it('sends the delete of a confirmed entity, or one whose create is in flight', () => {
    assert.equal(enqueueOp([], deleteOp('folder', FOLDER_A))[0]!.action, 'delete');
    const confirmedEdit = enqueueOp([], folderUpsertOp(folder(FOLDER_A, 'Legs')));
    assert.equal(enqueueOp(confirmedEdit, deleteOp('folder', FOLDER_A))[0]!.action, 'delete');

    const pendingCreate = enqueueOp([], folderUpsertOp(folder(FOLDER_B, 'Arms'), false));
    const inFlight = new Set([outboxKey({ kind: 'folder', id: FOLDER_B })]);
    const outbox = enqueueOp(pendingCreate, deleteOp('folder', FOLDER_B), inFlight);
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0]!.action, 'delete');
  });

  it('flushes folder upserts, template upserts, template deletes, folder deletes', () => {
    const outbox = [
      deleteOp('folder', FOLDER_B),
      deleteOp('template', TPL_B),
      templateUpsertOp(template(TPL_A, FOLDER_A)),
      folderUpsertOp(folder(FOLDER_A, 'Legs')),
    ];
    assert.deepEqual(
      flushOrder(outbox).map((o) => `${o.action}:${o.kind}`),
      ['upsert:folder', 'upsert:template', 'delete:template', 'delete:folder'],
    );
  });
});

describe('workout outbox: overlay on the server overview', () => {
  const server: WorkoutsOverview = {
    folders: [
      folder(FOLDER_A, 'Legs', 0, [template(TPL_A, FOLDER_A)]),
      folder(FOLDER_B, 'Arms', 1),
    ],
    unfiledTemplates: [template(TPL_B, null, 'Pull')],
  };

  it('keeps pending deletes deleted and pending creates present', () => {
    const newFolder = '55555555-5555-4555-8555-555555555555';
    const merged = overlayPendingOps(server, [
      deleteOp('template', TPL_B),
      folderUpsertOp(folder(newFolder, 'Core', 2), false),
      templateUpsertOp({ ...template(TPL_A, newFolder), name: 'Plank' }),
    ]);
    assert.deepEqual(
      merged.folders.map((f) => f.id),
      [FOLDER_A, FOLDER_B, newFolder],
    );
    assert.deepEqual(merged.unfiledTemplates, []);
    assert.equal(merged.folders[0]!.templates.length, 0);
    assert.deepEqual(
      merged.folders[2]!.templates.map((t) => t.name),
      ['Plank'],
    );
  });

  it('unfiles the workouts of a pending folder delete and applies a reorder', () => {
    const merged = overlayPendingOps(server, [
      folderUpsertOp({ ...folder(FOLDER_B, 'Arms'), sortOrder: 0 }),
      folderUpsertOp({ ...folder(FOLDER_A, 'Legs'), sortOrder: 1 }),
      deleteOp('folder', FOLDER_A),
    ]);
    assert.deepEqual(
      merged.folders.map((f) => f.id),
      [FOLDER_B],
    );
    assert.deepEqual(
      merged.unfiledTemplates.map((t) => [t.id, t.folderId]),
      [
        [TPL_B, null],
        [TPL_A, null],
      ],
    );
  });
});

describe('workout outbox: legacy ids and request bodies', () => {
  it('re-keys local-only entities and their folder references, leaving starter content alone', () => {
    const ids = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'];
    const overview: WorkoutsOverview = {
      folders: [
        folder('folder-4er-split', '4er Split', 0, [
          template('tpl-chest-triceps', 'folder-4er-split'),
        ]),
        folder('folder-1730000000000', 'Mine', 1, [
          template('tpl-1730000000001', 'folder-1730000000000'),
        ]),
      ],
      unfiledTemplates: [template(TPL_B, null)],
    };
    const { overview: next, ops } = rekeyLegacyEntities(overview, () => ids.shift()!);
    assert.equal(next.folders[0]!.id, 'folder-4er-split');
    assert.equal(next.folders[0]!.templates[0]!.id, 'tpl-chest-triceps');
    assert.equal(next.folders[1]!.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const tpl = next.folders[1]!.templates[0]!;
    assert.equal(tpl.id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    assert.equal(tpl.folderId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    assert.equal(tpl.exercises[0]!.templateId, tpl.id);
    assert.deepEqual(
      ops.map((o) => [o.kind, o.id, o.serverKnown]),
      [
        ['folder', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false],
        ['template', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false],
      ],
    );
    assert.equal(next.unfiledTemplates[0], overview.unfiledTemplates[0]);
  });

  it('sends only structural fields for untouched starter copies', () => {
    const starter = { ...folder(FOLDER_A, 'Legs', 3), systemKey: 'folder-4er-split' };
    assert.deepEqual(folderBody(starter), { color: '#E8743B', sortOrder: 3 });
    assert.equal(folderBody({ ...starter, systemKey: null }).name, 'Legs');

    const tpl = { ...template(TPL_A, 'folder-4er-split'), systemKey: 'tpl-legs' };
    assert.deepEqual(templateBody(tpl), {
      folderId: null,
      sortOrder: 0,
      estimatedDurationMinutes: 60,
    });
    const body = templateBody({ ...tpl, systemKey: null, folderId: FOLDER_A });
    assert.equal(body.folderId, FOLDER_A);
    assert.equal(body.name, 'Push');
    assert.equal(body.exercises?.length, 1);
  });

  it('generates plain lowercase UUIDs and picks free folder names', () => {
    const id = newEntityId();
    assert.ok(isServerId(id));
    assert.equal(id, id.toLowerCase());
    assert.equal(nextFolderName('Legs', ['Legs', 'Legs (2)']), 'Legs (3)');
    assert.equal(nextFolderName('Legs (2)', ['Legs']), 'Legs (3)');
  });
});

type Call = string;
const apiError = (status: number, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(`HTTP ${status}`), { status, ...extra });

function harness(outbox: WorkoutOutboxOp[], fail: (call: Call) => unknown = () => undefined) {
  const calls: Call[] = [];
  const state = { outbox: [...outbox], renamed: [] as string[] };
  const call = (name: Call) => async () => {
    calls.push(name);
    const err = fail(name);
    if (err) throw err;
    return {};
  };
  const api: WorkoutOutboxApi = {
    createFolder: (b) => call(`POST folder ${b.id} ${b.name}`)(),
    updateFolder: (id, b) => call(`PUT folder ${id}${b.name ? ` ${b.name}` : ''}`)(),
    deleteFolder: (id) => call(`DELETE folder ${id}`)(),
    createTemplate: (b) => call(`POST template ${b.id}`)(),
    updateTemplate: (id) => call(`PUT template ${id}`)(),
    deleteTemplate: (id) => call(`DELETE template ${id}`)(),
  };
  const run = () =>
    flushWorkoutOutbox({
      api,
      readOutbox: async () => state.outbox,
      updateOutbox: async (fn) => {
        state.outbox = fn(state.outbox);
      },
      inFlightKeys: new Set(),
      localFolderNames: () => ['Legs', 'Legs (2)'],
      renameFolderLocally: (_id, name) => {
        state.renamed.push(name);
      },
    });
  return { calls, state, run };
}

describe('workout outbox: flush', () => {
  it('sends ops in order, creating on a 404 and treating a delete 404 as done', async () => {
    const h = harness(
      [
        deleteOp('folder', FOLDER_B),
        templateUpsertOp(template(TPL_A, FOLDER_A), false),
        folderUpsertOp(folder(FOLDER_A, 'Core'), false),
        deleteOp('template', TPL_B),
      ],
      (call) =>
        call.startsWith('PUT') || call === `DELETE template ${TPL_B}` ? apiError(404) : null,
    );
    const result = await h.run();
    assert.deepEqual(result, { stoppedBy: null, needsRefresh: false });
    assert.deepEqual(h.calls, [
      `PUT folder ${FOLDER_A} Core`,
      `POST folder ${FOLDER_A} Core`,
      `PUT template ${TPL_A}`,
      `POST template ${TPL_A}`,
      `DELETE template ${TPL_B}`,
      `DELETE folder ${FOLDER_B}`,
    ]);
    assert.deepEqual(h.state.outbox, []);
  });

  it('renames a folder after a name clash and retries once', async () => {
    let clashes = 1;
    const h = harness([folderUpsertOp(folder(FOLDER_A, 'Legs'), false)], (call) =>
      call.startsWith('PUT') && clashes-- > 0 ? apiError(409, { code: 'FOLDER_NAME_TAKEN' }) : null,
    );
    await h.run();
    assert.deepEqual(h.calls, [`PUT folder ${FOLDER_A} Legs`, `PUT folder ${FOLDER_A} Legs (3)`]);
    assert.deepEqual(h.state.renamed, ['Legs (3)']);
    assert.deepEqual(h.state.outbox, []);
  });

  it('stops and keeps the queue when offline or signed out', async () => {
    const ops = [folderUpsertOp(folder(FOLDER_A, 'Legs')), deleteOp('template', TPL_B)];
    const offline = harness(ops, () => apiError(0, { isNetworkError: true }));
    assert.equal((await offline.run()).stoppedBy, 'offline');
    assert.equal(offline.calls.length, 1);
    assert.equal(offline.state.outbox.length, 2);

    const signedOut = harness(ops, () => apiError(401, { isAuthError: true }));
    assert.equal((await signedOut.run()).stoppedBy, 'auth');
    assert.equal(signedOut.state.outbox.length, 2);
  });

  it('drops a rejected op, asks for a refresh and continues', async () => {
    const h = harness(
      [templateUpsertOp(template(TPL_A, null)), deleteOp('template', TPL_B)],
      (call) => (call.startsWith('PUT') ? apiError(400) : null),
    );
    assert.deepEqual(await h.run(), { stoppedBy: null, needsRefresh: true });
    assert.deepEqual(h.calls, [`PUT template ${TPL_A}`, `DELETE template ${TPL_B}`]);
    assert.deepEqual(h.state.outbox, []);
  });

  it('retries server errors on later flushes and gives up after the limit', async () => {
    const h = harness([deleteOp('folder', FOLDER_A)], () => apiError(500));
    for (let i = 1; i < 5; i++) {
      assert.equal((await h.run()).stoppedBy, 'server');
      assert.equal(h.state.outbox[0]!.attempts, i);
    }
    assert.deepEqual(await h.run(), { stoppedBy: null, needsRefresh: true });
    assert.deepEqual(h.state.outbox, []);
  });
});
