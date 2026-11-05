import { DEFAULT_STARTER_FOLDERS, DEFAULT_STARTER_TEMPLATES } from '@luki-fitti/common/catalog';
import {
  FOLDER_NAME_TAKEN_CODE,
  type CreateFolderDto,
  type CreateTemplateDto,
  type TemplateExerciseInputDto,
  type UpdateFolderDto,
  type UpdateTemplateDto,
  type WorkoutFolderDto,
  type WorkoutTemplateDto,
} from '@luki-fitti/common/schemas';

/**
 * Outbox of folder/template changes made on this device (signed-in users only). Changes apply to
 * local state right away and are sent to the API by `flushWorkoutOutbox`; until then they are laid
 * over every server overview (`overlayPendingOps`), so nothing comes back or disappears.
 * Mirrored in Swift by `WorkoutOutbox` (LukiFittiStore).
 */

export interface WorkoutsOverview {
  folders: WorkoutFolderDto[];
  unfiledTemplates: WorkoutTemplateDto[];
}

export type FolderSnapshot = Omit<WorkoutFolderDto, 'templates'>;
export type WorkoutEntityKind = 'folder' | 'template';

interface OpBase {
  id: string;
  /** Unique per enqueue: a flush only removes the op it actually sent. */
  opId: string;
  queuedAt: string;
  /** Whether the server has (or may have) this entity. A delete of an unknown one is dropped. */
  serverKnown: boolean;
  /** Failed attempts with a server error (5xx). */
  attempts?: number;
}

export type WorkoutOutboxOp =
  | (OpBase & { kind: 'folder'; action: 'upsert'; payload: FolderSnapshot })
  | (OpBase & { kind: 'template'; action: 'upsert'; payload: WorkoutTemplateDto })
  | (OpBase & { kind: WorkoutEntityKind; action: 'delete'; payload: null });

/** Server errors after which an op is given up (e.g. data the server keeps failing on). */
export const MAX_SERVER_ERROR_ATTEMPTS = 5;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STARTER_IDS = new Set<string>([
  ...DEFAULT_STARTER_FOLDERS.map((f) => f.id),
  ...DEFAULT_STARTER_TEMPLATES.map((t) => t.id),
]);

/** Server rows always have UUIDs; bundled starter content and old local entities don't. */
export function isServerId(id: string): boolean {
  return UUID_RE.test(id);
}

export function isStarterId(id: string): boolean {
  return STARTER_IDS.has(id);
}

/** Plain lowercase v4 UUID (also outside secure contexts, where `randomUUID` is missing). */
export function newEntityId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function outboxKey(op: { kind: WorkoutEntityKind; id: string }): string {
  return `${op.kind}:${op.id}`;
}

function opBase(id: string, serverKnown: boolean): OpBase {
  return { id, opId: newEntityId(), queuedAt: new Date().toISOString(), serverKnown };
}

export function toFolderSnapshot(folder: FolderSnapshot): FolderSnapshot {
  return {
    id: folder.id,
    systemKey: folder.systemKey ?? null,
    userId: folder.userId,
    name: folder.name,
    color: folder.color,
    sortOrder: folder.sortOrder,
  };
}

/** `serverKnown: false` for entities created on this device. */
export function folderUpsertOp(folder: FolderSnapshot, serverKnown = true): WorkoutOutboxOp {
  return {
    ...opBase(folder.id, serverKnown),
    kind: 'folder',
    action: 'upsert',
    payload: toFolderSnapshot(folder),
  };
}

export function templateUpsertOp(
  template: WorkoutTemplateDto,
  serverKnown = true,
): WorkoutOutboxOp {
  return {
    ...opBase(template.id, serverKnown),
    kind: 'template',
    action: 'upsert',
    payload: template,
  };
}

export function deleteOp(kind: WorkoutEntityKind, id: string): WorkoutOutboxOp {
  return { ...opBase(id, true), kind, action: 'delete', payload: null };
}

/** Only server-side entities sync; starter catalog content and guests stay local. */
export function isSyncable(id: string): boolean {
  return isServerId(id);
}

/**
 * Adds `op`, replacing any older op for the same entity. A delete of an entity the server has
 * never confirmed drops both, unless a request for it is in flight (it may just be arriving).
 */
export function enqueueOp(
  outbox: WorkoutOutboxOp[],
  op: WorkoutOutboxOp,
  inFlightKeys: ReadonlySet<string> = new Set(),
): WorkoutOutboxOp[] {
  const key = outboxKey(op);
  const existing = outbox.find((o) => outboxKey(o) === key);
  const rest = outbox.filter((o) => outboxKey(o) !== key);
  const serverKnown = (existing ? existing.serverKnown : op.serverKnown) || inFlightKeys.has(key);
  if (op.action === 'delete' && !serverKnown) return rest;
  return [...rest, { ...op, serverKnown }];
}

function flushRank(op: WorkoutOutboxOp): number {
  if (op.action === 'upsert') return op.kind === 'folder' ? 0 : 1;
  return op.kind === 'template' ? 2 : 3;
}

/** Folder upserts → template upserts → template deletes → folder deletes (stable). */
export function flushOrder(outbox: WorkoutOutboxOp[]): WorkoutOutboxOp[] {
  return [...outbox].sort((a, b) => flushRank(a) - flushRank(b));
}

/** Applies still-pending ops to an overview (e.g. the server's), like the server will. */
export function overlayPendingOps(
  overview: WorkoutsOverview,
  outbox: WorkoutOutboxOp[],
): WorkoutsOverview {
  let folders = overview.folders.map((f) => ({ ...f, templates: [...f.templates] }));
  let unfiled = [...overview.unfiledTemplates];
  const without = (list: WorkoutTemplateDto[], id: string) => list.filter((t) => t.id !== id);

  for (const op of flushOrder(outbox)) {
    if (op.kind === 'folder' && op.action === 'upsert') {
      const idx = folders.findIndex((f) => f.id === op.id);
      const current = folders[idx];
      if (current) folders[idx] = { ...current, ...op.payload, templates: current.templates };
      else folders.push({ ...op.payload, templates: [] });
    } else if (op.kind === 'template' && op.action === 'upsert') {
      const target = folders.find((f) => f.id === op.payload.folderId);
      const tpl = target ? op.payload : { ...op.payload, folderId: null };
      const replaceOrAppend = (list: WorkoutTemplateDto[]) => {
        const idx = list.findIndex((t) => t.id === tpl.id);
        return idx >= 0 ? list.map((t, i) => (i === idx ? tpl : t)) : [...list, tpl];
      };
      folders = folders.map((f) =>
        f === target
          ? { ...f, templates: replaceOrAppend(f.templates) }
          : { ...f, templates: without(f.templates, tpl.id) },
      );
      unfiled = target ? without(unfiled, tpl.id) : replaceOrAppend(unfiled);
    } else if (op.action === 'delete' && op.kind === 'template') {
      folders = folders.map((f) => ({ ...f, templates: without(f.templates, op.id) }));
      unfiled = without(unfiled, op.id);
    } else if (op.action === 'delete') {
      const removed = folders.find((f) => f.id === op.id);
      folders = folders.filter((f) => f.id !== op.id);
      unfiled = [...unfiled, ...(removed?.templates ?? []).map((t) => ({ ...t, folderId: null }))];
    }
  }

  folders.sort((a, b) => a.sortOrder - b.sortOrder);
  return { folders, unfiledTemplates: unfiled };
}

/**
 * Entities created before the outbox existed (signed in, non-UUID id, not starter content) get a
 * UUID, so they can be uploaded; template folder references follow. Returns the upserts to enqueue.
 */
export function rekeyLegacyEntities(
  overview: WorkoutsOverview,
  makeId: () => string = newEntityId,
): { overview: WorkoutsOverview; ops: WorkoutOutboxOp[] } {
  const isLegacy = (id: string) => !isServerId(id) && !isStarterId(id);
  const folderIds = new Map<string, string>();
  for (const f of overview.folders) if (isLegacy(f.id)) folderIds.set(f.id, makeId());

  const ops: WorkoutOutboxOp[] = [];
  const rekeyTemplate = (t: WorkoutTemplateDto): WorkoutTemplateDto => {
    const legacy = isLegacy(t.id);
    const folderId = t.folderId ? (folderIds.get(t.folderId) ?? t.folderId) : t.folderId;
    if (!legacy && folderId === t.folderId) return t;
    const id = legacy ? makeId() : t.id;
    const next: WorkoutTemplateDto = {
      ...t,
      id,
      folderId,
      ...(legacy ? { systemKey: null } : {}),
      exercises: t.exercises.map((e) => ({ ...e, templateId: id })),
    };
    if (isSyncable(id)) ops.push(templateUpsertOp(next, !legacy));
    return next;
  };

  const folders = overview.folders.map((f) => {
    const newId = folderIds.get(f.id);
    const folder = newId ? { ...f, id: newId, systemKey: null } : f;
    if (newId) ops.push(folderUpsertOp(folder, false));
    return { ...folder, templates: folder.templates.map(rekeyTemplate) };
  });
  const unfiledTemplates = overview.unfiledTemplates.map(rekeyTemplate);
  if (ops.length === 0) return { overview, ops };
  // Folders first, so a template is never created before its folder.
  ops.sort((a, b) => flushRank(a) - flushRank(b));
  return { overview: { folders, unfiledTemplates }, ops };
}

/** "Name (2)", "Name (3)", … — the first name not taken locally (≤ 80 chars). */
export function nextFolderName(name: string, taken: Iterable<string>): string {
  const base = name.replace(/ \(\d+\)$/, '');
  const used = new Set(Array.from(taken, (n) => n.toLowerCase()));
  used.add(name.toLowerCase());
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = `${base.slice(0, 80 - suffix.length)}${suffix}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * PUT body. Untouched starter copies (`systemKey`) only send structural fields, because sending
 * their text would detach them from the catalog (they then stop following the UI language).
 */
export function folderBody(folder: FolderSnapshot): UpdateFolderDto {
  const structural = { color: folder.color, sortOrder: Math.max(0, folder.sortOrder) };
  return folder.systemKey ? structural : { name: folder.name.trim().slice(0, 80), ...structural };
}

function exerciseInput(
  e: WorkoutTemplateDto['exercises'][number],
  idx: number,
): TemplateExerciseInputDto {
  const reps = (v: number | null | undefined) => (v && v >= 1 ? Math.min(200, v) : null);
  return {
    exerciseId: e.exerciseId,
    sets: e.sets && e.sets.length > 0 ? e.sets.slice(0, 40) : null,
    orderIndex: idx,
    plannedSets: clamp(e.plannedSets, 1, 30),
    warmupSets: clamp(e.warmupSets ?? 0, 0, 10),
    targetRepsMin: reps(e.targetRepsMin),
    targetRepsMax: reps(e.targetRepsMax),
    targetWeight: e.targetWeight ?? null,
    weightUnit: e.weightUnit,
    restSeconds: clamp(e.restSeconds, 0, 900),
    targetDurationSeconds: e.targetDurationSeconds ?? null,
    targetDistanceMeters: e.targetDistanceMeters ?? null,
    notes: e.notes ? e.notes.slice(0, 500) : null,
    alternativeExerciseIds: e.alternativeExerciseIds ?? [],
  };
}

/** PUT body of a template (structural only for untouched starter copies, see `folderBody`). */
export function templateBody(template: WorkoutTemplateDto): UpdateTemplateDto {
  const structural = {
    // Starter folders of guests never reach the server: such templates are unfiled there.
    folderId: template.folderId && isServerId(template.folderId) ? template.folderId : null,
    sortOrder: Math.max(0, template.sortOrder),
    estimatedDurationMinutes: clamp(template.estimatedDurationMinutes ?? 60, 5, 360),
  };
  if (template.systemKey) return structural;
  return {
    ...structural,
    name: template.name.trim().slice(0, 100) || 'Workout',
    description: template.description ? template.description.trim().slice(0, 500) : null,
    exercises: template.exercises.map(exerciseInput),
  };
}

export type OutboxErrorClass =
  'not-found' | 'name-taken' | 'auth' | 'offline' | 'server' | 'rejected';

/** Classifies an API client error (duck-typed `ApiClientError`). */
export function classifyOutboxError(err: unknown): OutboxErrorClass {
  const e = (err ?? {}) as {
    status?: number;
    isAuthError?: boolean;
    isNetworkError?: boolean;
    code?: string | null;
  };
  if (e.isAuthError || e.status === 401) return 'auth';
  if (e.isNetworkError || !e.status) return 'offline';
  if (e.status === 404) return 'not-found';
  if (e.status === 409 && (e.code === FOLDER_NAME_TAKEN_CODE || !e.code)) return 'name-taken';
  if (e.status >= 500 || e.status === 408 || e.status === 429) return 'server';
  return 'rejected';
}

export interface WorkoutOutboxApi {
  createFolder: (body: CreateFolderDto) => Promise<unknown>;
  updateFolder: (id: string, body: UpdateFolderDto) => Promise<unknown>;
  deleteFolder: (id: string) => Promise<unknown>;
  createTemplate: (body: CreateTemplateDto) => Promise<unknown>;
  updateTemplate: (id: string, body: UpdateTemplateDto) => Promise<unknown>;
  deleteTemplate: (id: string) => Promise<unknown>;
}

export interface WorkoutOutboxFlushDeps {
  api: WorkoutOutboxApi;
  readOutbox: () => Promise<WorkoutOutboxOp[]>;
  /** Serialized read-modify-write of the persisted outbox. */
  updateOutbox: (fn: (outbox: WorkoutOutboxOp[]) => WorkoutOutboxOp[]) => Promise<unknown>;
  inFlightKeys: Set<string>;
  /** Names of the local folders (to pick a free name after a 409). */
  localFolderNames: () => Promise<string[]> | string[];
  /** Applies a folder rename forced by a name clash to local state (without enqueueing). */
  renameFolderLocally: (id: string, name: string) => Promise<void> | void;
  onRejected?: (op: WorkoutOutboxOp, err: unknown) => void;
}

export interface WorkoutOutboxFlushResult {
  /** `offline`/`server`: stopped, the rest stays queued. `auth`: the session expired. */
  stoppedBy: 'offline' | 'server' | 'auth' | null;
  /** An op was dropped or its entity is gone: local state should be replaced by the server's. */
  needsRefresh: boolean;
}

/** Sends one op. Resolves `false` when the entity is gone and can't be recreated. */
async function sendOp(api: WorkoutOutboxApi, op: WorkoutOutboxOp): Promise<boolean> {
  if (op.action === 'delete') {
    try {
      await (op.kind === 'folder' ? api.deleteFolder(op.id) : api.deleteTemplate(op.id));
    } catch (err) {
      if (classifyOutboxError(err) !== 'not-found') throw err;
    }
    return true;
  }
  try {
    if (op.kind === 'folder') await api.updateFolder(op.id, folderBody(op.payload));
    else await api.updateTemplate(op.id, templateBody(op.payload));
    return true;
  } catch (err) {
    if (classifyOutboxError(err) !== 'not-found') throw err;
  }
  // Not on the server (yet): create it under the same id. Untouched starter copies can't be.
  if (op.payload.systemKey) return false;
  if (op.kind === 'folder') {
    await api.createFolder({ ...(folderBody(op.payload) as CreateFolderDto), id: op.id });
  } else {
    await api.createTemplate({ ...(templateBody(op.payload) as CreateTemplateDto), id: op.id });
  }
  return true;
}

/**
 * Sends the outbox in `flushOrder`. Stops (keeping the rest) when offline, on a server error or
 * when the session expired; drops ops the server rejects. Ops changed while a request was in
 * flight stay queued and go out in a later pass.
 */
export async function flushWorkoutOutbox(
  deps: WorkoutOutboxFlushDeps,
): Promise<WorkoutOutboxFlushResult> {
  let needsRefresh = false;
  const attempted = new Set<string>();

  for (let pass = 0; pass < 3; pass++) {
    const pending = flushOrder(await deps.readOutbox()).filter((op) => !attempted.has(op.opId));
    if (pending.length === 0) break;

    for (const queued of pending) {
      attempted.add(queued.opId);
      const current = (await deps.readOutbox()).find((o) => o.opId === queued.opId);
      if (!current) continue;
      let op = current;
      const key = outboxKey(op);
      deps.inFlightKeys.add(key);
      try {
        let renamed = false;
        for (;;) {
          try {
            if (!(await sendOp(deps.api, op))) needsRefresh = true;
            break;
          } catch (err) {
            const kind = classifyOutboxError(err);
            if (
              kind === 'name-taken' &&
              op.kind === 'folder' &&
              op.action === 'upsert' &&
              !renamed
            ) {
              renamed = true;
              const name = nextFolderName(op.payload.name, await deps.localFolderNames());
              const next: WorkoutOutboxOp = { ...op, payload: { ...op.payload, name } };
              await deps.updateOutbox((o) => o.map((x) => (x.opId === op.opId ? next : x)));
              await deps.renameFolderLocally(op.id, name);
              op = next;
              continue;
            }
            throw err;
          }
        }
        const sent = op;
        await deps.updateOutbox((o) =>
          o.flatMap((x) => {
            if (x.opId === sent.opId) return [];
            // A newer change of the same entity: the server knows it now.
            if (outboxKey(x) === key && sent.action === 'upsert')
              return [{ ...x, serverKnown: true }];
            return [x];
          }),
        );
      } catch (err) {
        const kind = classifyOutboxError(err);
        if (kind === 'auth' || kind === 'offline') return { stoppedBy: kind, needsRefresh };
        const attempts = (op.attempts ?? 0) + 1;
        if (kind === 'server' && attempts < MAX_SERVER_ERROR_ATTEMPTS) {
          await deps.updateOutbox((o) =>
            o.map((x) => (x.opId === op.opId ? { ...x, attempts } : x)),
          );
          return { stoppedBy: 'server', needsRefresh };
        }
        // 409 twice in a row stays queued for the next flush; anything else is given up.
        if (kind === 'name-taken' && op.kind === 'folder') continue;
        await deps.updateOutbox((o) => o.filter((x) => x.opId !== op.opId));
        deps.onRejected?.(op, err);
        needsRefresh = true;
      } finally {
        deps.inFlightKeys.delete(key);
      }
    }
  }
  return { stoppedBy: null, needsRefresh };
}
