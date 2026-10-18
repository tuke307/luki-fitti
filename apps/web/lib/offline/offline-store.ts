import {
  DEFAULT_STARTER_FOLDERS,
  DEFAULT_STARTER_TEMPLATES,
  DEFAULT_STRETCHING_ROUTINES,
  INITIAL_EXERCISE_CATALOG,
  resolveExerciseMedia,
} from '@luki-fitti/common/catalog';
import {
  ExerciseType,
  MuscleGroup,
  SessionExerciseOrigin,
  SessionExerciseStatus,
  SessionStatus,
  SessionType,
  SetType,
  WeightUnit,
} from '@luki-fitti/common/enums';
import { applyExerciseHistoryToSessionExercise } from '@luki-fitti/common/utils/client';
import type {
  ExerciseDto,
  SessionExerciseDto,
  SessionSetDto,
  StretchingRoutineDto,
  SyncSessionPayloadDto,
  WorkoutFolderDto,
  WorkoutSessionDto,
  WorkoutTemplateDto,
} from '@luki-fitti/common/schemas';

export type SyncState =
  | 'SYNCED'
  | 'SAVED_LOCALLY'
  | 'SYNCING'
  | 'CONFLICT'
  | 'AUTH_EXPIRED'
  | 'OFFLINE';

export interface QueuedSessionSyncItem {
  clientSessionId: string;
  payload: SyncSessionPayloadDto;
  queuedAt: string;
  attempts: number;
  lastError?: string | null;
  serverConflictSession?: WorkoutSessionDto | null;
}

const DB_NAME = 'luki_fitti_offline_v1';
const DB_VERSION = 1;

const STORES = {
  KV: 'kv_store',
  SYNC_QUEUE: 'sync_queue',
  SESSION_HISTORY: 'session_history',
} as const;

const memoryKv = new Map<string, unknown>();
const memoryQueue = new Map<string, QueuedSessionSyncItem>();
const memoryHistory = new Map<string, WorkoutSessionDto>();

function hasIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.KV)) {
        db.createObjectStore(STORES.KV);
      }
      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'clientSessionId' });
      }
      if (!db.objectStoreNames.contains(STORES.SESSION_HISTORY)) {
        db.createObjectStore(STORES.SESSION_HISTORY, { keyPath: 'clientSessionId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  if (!hasIndexedDb()) {
    return (memoryKv.get(key) as T) ?? null;
  }
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.KV, 'readonly');
    const store = tx.objectStore(STORES.KV);
    const req = store.get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  memoryKv.set(key, value);
  if (!hasIndexedDb()) return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.KV, 'readwrite');
    const store = tx.objectStore(STORES.KV);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getCachedCatalog(): Promise<ExerciseDto[]> {
  const cached = await idbGet<ExerciseDto[]>('exercise_catalog');
  if (cached && cached.length > 0) {
    const bySlug = new Map(cached.map((e) => [e.slug, e]));
    let changed = false;
    for (const sysEx of INITIAL_EXERCISE_CATALOG) {
      if (!bySlug.has(sysEx.slug)) {
        bySlug.set(sysEx.slug, sysEx);
        changed = true;
      }
    }
    const merged = Array.from(bySlug.values()).map((ex) => {
      if (!ex.media || ex.media.length === 0) {
        changed = true;
        return { ...ex, media: resolveExerciseMedia(ex) };
      }
      return ex;
    });
    if (changed) {
      await idbSet('exercise_catalog', merged);
    }
    return merged;
  }
  await idbSet('exercise_catalog', INITIAL_EXERCISE_CATALOG);
  return INITIAL_EXERCISE_CATALOG;
}

export async function setCachedCatalog(exercises: ExerciseDto[]): Promise<void> {
  await idbSet('exercise_catalog', exercises);
}

export function buildDefaultFoldersAndTemplates(userId = 'local-user'): {
  folders: WorkoutFolderDto[];
  unfiledTemplates: WorkoutTemplateDto[];
} {
  const catalogById = new Map(INITIAL_EXERCISE_CATALOG.map((e) => [e.id, e]));
  const nowIso = new Date().toISOString();

  const templates: WorkoutTemplateDto[] = DEFAULT_STARTER_TEMPLATES.map((tpl) => ({
    id: tpl.id,
    userId,
    folderId: tpl.folderId,
    name: tpl.name,
    description: tpl.description,
    estimatedDurationMinutes: tpl.estimatedDurationMinutes,
    sortOrder: tpl.sortOrder,
    createdAt: nowIso,
    updatedAt: nowIso,
    exercises: tpl.exercises.map((te) => ({
      ...te,
      exercise: catalogById.get(te.exerciseId),
    })),
  }));

  return {
    folders: DEFAULT_STARTER_FOLDERS.map((f) => ({
      id: f.id,
      userId,
      name: f.name,
      color: f.color,
      sortOrder: f.sortOrder,
      templates: templates.filter((t) => t.folderId === f.id),
    })),
    unfiledTemplates: [],
  };
}

export function buildDefaultStretchingRoutines(userId = 'local-user'): StretchingRoutineDto[] {
  const catalogById = new Map(INITIAL_EXERCISE_CATALOG.map((e) => [e.id, e]));
  const nowIso = new Date().toISOString();

  return DEFAULT_STRETCHING_ROUTINES.map((r) => ({
    id: r.id,
    userId,
    name: r.name,
    description: r.description,
    targetArea: r.targetArea,
    estimatedDurationSeconds: r.estimatedDurationSeconds,
    createdAt: nowIso,
    updatedAt: nowIso,
    exercises: r.exercises.map((re) => ({
      ...re,
      exercise: catalogById.get(re.exerciseId),
    })),
  }));
}

export async function getCachedWorkouts(): Promise<{
  folders: WorkoutFolderDto[];
  unfiledTemplates: WorkoutTemplateDto[];
}> {
  const cached = await idbGet<{
    folders: WorkoutFolderDto[];
    unfiledTemplates: WorkoutTemplateDto[];
  }>('workouts_overview');
  const defaults = buildDefaultFoldersAndTemplates();
  if (cached && cached.folders.length > 0) {
    const existingIds = new Set(cached.folders.map((f) => f.id));
    const existingNames = new Set(cached.folders.map((f) => f.name.toLowerCase()));
    const missingFolders = defaults.folders.filter(
      (df) => !existingIds.has(df.id) && !existingNames.has(df.name.toLowerCase()),
    );
    // Only auto-merge starter folders if the cached state is the starter local state
    const hasStarterRoot = cached.folders.some((f) => f.id === 'folder-4er-split');
    if (hasStarterRoot && missingFolders.length > 0) {
      const merged = {
        folders: [...cached.folders, ...missingFolders].map((f, idx) => ({
          ...f,
          sortOrder: idx,
        })),
        unfiledTemplates: cached.unfiledTemplates,
      };
      await idbSet('workouts_overview', merged);
      return merged;
    }
    return cached;
  }
  await idbSet('workouts_overview', defaults);
  return defaults;
}

export async function setCachedWorkouts(overview: {
  folders: WorkoutFolderDto[];
  unfiledTemplates: WorkoutTemplateDto[];
}): Promise<void> {
  await idbSet('workouts_overview', overview);
}

export async function getCachedStretchingRoutines(): Promise<StretchingRoutineDto[]> {
  const cached = await idbGet<StretchingRoutineDto[]>('stretching_routines');
  const defaults = buildDefaultStretchingRoutines();
  if (cached && cached.length > 0) {
    const existingNames = new Set(cached.map((r) => r.name.toLowerCase()));
    const missing = defaults.filter(
      (d) =>
        !existingNames.has(d.name.toLowerCase()) &&
        !cached.some((c) => c.id === d.id),
    );
    if (missing.length > 0) {
      const merged = [...cached, ...missing];
      await idbSet('stretching_routines', merged);
      return merged;
    }
    return cached;
  }
  await idbSet('stretching_routines', defaults);
  return defaults;
}

export async function setCachedStretchingRoutines(
  routines: StretchingRoutineDto[],
): Promise<void> {
  await idbSet('stretching_routines', routines);
}

// ─────────────────────────────────────────────────────────────────────────────
// Active Session Persistence & Offline Queue (IndexedDB)
// ─────────────────────────────────────────────────────────────────────────────
export async function getLocalActiveSession(): Promise<WorkoutSessionDto | null> {
  return idbGet<WorkoutSessionDto>('active_workout_session');
}

export async function saveLocalActiveSession(
  session: WorkoutSessionDto | null,
): Promise<void> {
  await idbSet('active_workout_session', session);
}

export function recalculateSessionTotals(session: WorkoutSessionDto): WorkoutSessionDto {
  let totalVolumeKg = 0;
  let totalSetsCompleted = 0;
  let totalRepsCompleted = 0;
  let totalStretchSeconds = 0;

  for (const ex of session.exercises) {
    const isStretch =
      ex.exerciseTypeSnapshot === ExerciseType.STRETCHING ||
      ex.exerciseTypeSnapshot === ExerciseType.MOBILITY;

    for (const set of ex.sets) {
      if (!set.completed) continue;
      totalSetsCompleted += 1;

      if (isStretch || set.setType === SetType.STRETCH) {
        totalStretchSeconds += set.durationSeconds ?? 0;
        if (set.reps) totalRepsCompleted += set.reps;
      } else {
        const reps = set.reps ?? 0;
        totalRepsCompleted += reps;
        if (set.setType !== SetType.WARMUP && set.weight && set.weight > 0 && reps > 0) {
          const wKg = set.weightUnit === WeightUnit.LBS ? set.weight * 0.45359237 : set.weight;
          totalVolumeKg += wKg * reps;
        }
      }
    }
  }

  return {
    ...session,
    totalVolumeKg: Math.round(totalVolumeKg * 10) / 10,
    totalSetsCompleted,
    totalRepsCompleted,
    totalStretchSeconds,
  };
}

export function toSyncPayload(
  session: WorkoutSessionDto,
  forceOverwrite = false,
): SyncSessionPayloadDto {
  return {
    id: session.id,
    clientSessionId: session.clientSessionId,
    templateId: session.templateId,
    stretchingRoutineId: session.stretchingRoutineId,
    sessionType: session.sessionType,
    workoutNameSnapshot: session.workoutNameSnapshot,
    status: session.status,
    startedAt: session.startedAt,
    pausedAt: session.pausedAt,
    completedAt: session.completedAt,
    activeDurationSeconds: session.activeDurationSeconds,
    weightUnit: session.weightUnit,
    notes: session.notes,
    restTimerEndsAt: session.restTimerEndsAt,
    restTimerDurationSec: session.restTimerDurationSec,
    restTimerPausedRemSec: session.restTimerPausedRemSec,
    version: session.version,
    forceOverwrite,
    exercises: session.exercises.map((ex, idx) => ({
      id: ex.id,
      clientExerciseId: ex.clientExerciseId,
      exerciseId: ex.exerciseId,
      replacedExerciseId: ex.replacedExerciseId,
      replacedExerciseName: ex.replacedExerciseName,
      exerciseNameSnapshot: ex.exerciseNameSnapshot,
      primaryMuscleSnapshot: ex.primaryMuscleSnapshot,
      exerciseTypeSnapshot: ex.exerciseTypeSnapshot,
      origin: ex.origin,
      status: ex.status,
      orderIndex: idx,
      plannedSets: ex.plannedSets,
      plannedWarmupSets: ex.plannedWarmupSets,
      targetRepsMin: ex.targetRepsMin,
      targetRepsMax: ex.targetRepsMax,
      targetWeight: ex.targetWeight,
      targetDurationSeconds: ex.targetDurationSeconds,
      restSeconds: ex.restSeconds,
      alternativeExerciseIds: ex.alternativeExerciseIds,
      notes: ex.notes,
      sets: ex.sets.map((s, sIdx) => ({
        id: s.id,
        clientSetId: s.clientSetId,
        setNumber: sIdx + 1,
        setType: s.setType,
        weight: s.weight,
        weightUnit: s.weightUnit,
        reps: s.reps,
        durationSeconds: s.durationSeconds,
        distanceMeters: s.distanceMeters,
        rpe: s.rpe,
        completed: s.completed,
        completedAt: s.completedAt,
        isPersonalRecord: s.isPersonalRecord,
        notes: s.notes,
      })),
    })),
  };
}

export async function enqueueSessionSync(
  session: WorkoutSessionDto,
  forceOverwrite = false,
): Promise<QueuedSessionSyncItem> {
  const item: QueuedSessionSyncItem = {
    clientSessionId: session.clientSessionId,
    payload: toSyncPayload(session, forceOverwrite),
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
    serverConflictSession: null,
  };

  memoryQueue.set(item.clientSessionId, item);
  if (hasIndexedDb()) {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
      const store = tx.objectStore(STORES.SYNC_QUEUE);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
  return item;
}

export async function getSyncQueue(): Promise<QueuedSessionSyncItem[]> {
  if (!hasIndexedDb()) {
    return Array.from(memoryQueue.values());
  }
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.SYNC_QUEUE, 'readonly');
    const store = tx.objectStore(STORES.SYNC_QUEUE);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as QueuedSessionSyncItem[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function removeFromSyncQueue(clientSessionId: string): Promise<void> {
  memoryQueue.delete(clientSessionId);
  if (!hasIndexedDb()) return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
    const store = tx.objectStore(STORES.SYNC_QUEUE);
    const req = store.delete(clientSessionId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function saveLocalHistorySession(session: WorkoutSessionDto): Promise<void> {
  if (session.status !== SessionStatus.COMPLETED) {
    return;
  }
  memoryHistory.set(session.clientSessionId, session);
  if (!hasIndexedDb()) return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.SESSION_HISTORY, 'readwrite');
    const store = tx.objectStore(STORES.SESSION_HISTORY);
    const req = store.put(session);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function removeLocalHistorySession(clientSessionId: string): Promise<void> {
  memoryHistory.delete(clientSessionId);
  for (const [k, v] of memoryHistory.entries()) {
    if (v.id === clientSessionId || v.clientSessionId === clientSessionId) {
      memoryHistory.delete(k);
    }
  }
  if (!hasIndexedDb()) return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.SESSION_HISTORY, 'readwrite');
    const store = tx.objectStore(STORES.SESSION_HISTORY);
    const req = store.delete(clientSessionId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getLocalHistorySessions(): Promise<WorkoutSessionDto[]> {
  if (!hasIndexedDb()) {
    return Array.from(memoryHistory.values())
      .filter((s) => s.status === SessionStatus.COMPLETED)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.SESSION_HISTORY, 'readonly');
    const store = tx.objectStore(STORES.SESSION_HISTORY);
    const req = store.getAll();
    req.onsuccess = () => {
      const list = ((req.result as WorkoutSessionDto[]) ?? []).filter(
        (s) => s.status === SessionStatus.COMPLETED,
      );
      resolve(list.sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
    };
    req.onerror = () => reject(req.error);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure Offline Session Builders & Mutations
// ─────────────────────────────────────────────────────────────────────────────
function generateId(prefix = 'loc'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createOfflineSessionFromTemplate(
  template: WorkoutTemplateDto,
  catalog: ExerciseDto[],
  userId = 'local-user',
  weightUnit: WeightUnit = WeightUnit.KG,
  historySessions: WorkoutSessionDto[] = [],
): WorkoutSessionDto {
  const catalogMap = new Map(catalog.map((e) => [e.id, e]));
  const clientSessionId = generateId('sess');
  const nowIso = new Date().toISOString();

  const exercises: SessionExerciseDto[] = template.exercises.map((te, idx) => {
    const exInfo = te.exercise ?? catalogMap.get(te.exerciseId);
    const sets: SessionSetDto[] = [];
    const clientExerciseId = generateId('sex');
    let setNumber = 1;

    for (let w = 0; w < (te.warmupSets ?? 0); w++) {
      sets.push({
        id: generateId('set'),
        clientSetId: generateId('cset'),
        sessionExerciseId: clientExerciseId,
        setNumber: setNumber++,
        setType: SetType.WARMUP,
        weight: te.targetWeight ? Math.round(te.targetWeight * 0.6 * 2) / 2 : 20,
        weightUnit: te.weightUnit ?? weightUnit,
        reps: te.targetRepsMin ?? 10,
        durationSeconds: null,
        distanceMeters: null,
        rpe: null,
        completed: false,
        completedAt: null,
        isPersonalRecord: false,
        notes: null,
      });
    }

    for (let s = 0; s < te.plannedSets; s++) {
      sets.push({
        id: generateId('set'),
        clientSetId: generateId('cset'),
        sessionExerciseId: clientExerciseId,
        setNumber: setNumber++,
        setType: SetType.WORKING,
        weight: te.targetWeight ?? null,
        weightUnit: te.weightUnit ?? weightUnit,
        reps: te.targetRepsMin ?? 10,
        durationSeconds: te.targetDurationSeconds ?? null,
        distanceMeters: te.targetDistanceMeters ?? null,
        rpe: null,
        completed: false,
        completedAt: null,
        isPersonalRecord: false,
        notes: null,
      });
    }

    const baseExercise: SessionExerciseDto = {
      id: clientExerciseId,
      clientExerciseId,
      sessionId: clientSessionId,
      exerciseId: te.exerciseId,
      replacedExerciseId: null,
      replacedExerciseName: null,
      exerciseNameSnapshot: exInfo?.name ?? 'Exercise',
      primaryMuscleSnapshot: exInfo?.primaryMuscleGroup ?? MuscleGroup.FULL_BODY,
      exerciseTypeSnapshot: exInfo?.exerciseType ?? ExerciseType.STRENGTH,
      origin: SessionExerciseOrigin.PLANNED,
      status: idx === 0 ? SessionExerciseStatus.IN_PROGRESS : SessionExerciseStatus.PENDING,
      orderIndex: idx,
      plannedSets: te.plannedSets,
      plannedWarmupSets: te.warmupSets ?? 0,
      targetRepsMin: te.targetRepsMin,
      targetRepsMax: te.targetRepsMax,
      targetWeight: te.targetWeight,
      targetDurationSeconds: te.targetDurationSeconds,
      restSeconds: te.restSeconds ?? 90,
      alternativeExerciseIds:
        te.alternativeExerciseIds?.length > 0
          ? te.alternativeExerciseIds
          : (exInfo?.alternativeExerciseIds ?? []),
      notes: te.notes,
      sets,
    };

    return applyExerciseHistoryToSessionExercise(
      baseExercise,
      historySessions,
      exInfo,
      te.weightUnit ?? weightUnit,
    );
  });

  return {
    id: clientSessionId,
    clientSessionId,
    userId,
    templateId: template.id,
    stretchingRoutineId: null,
    sessionType: SessionType.STRENGTH,
    workoutNameSnapshot: template.name,
    status: SessionStatus.IN_PROGRESS,
    startedAt: nowIso,
    pausedAt: null,
    completedAt: null,
    activeDurationSeconds: 0,
    weightUnit,
    totalVolumeKg: 0,
    totalSetsCompleted: 0,
    totalRepsCompleted: 0,
    totalStretchSeconds: 0,
    notes: null,
    restTimerEndsAt: null,
    restTimerDurationSec: null,
    restTimerPausedRemSec: null,
    version: 1,
    lastSyncedAt: nowIso,
    exercises,
  };
}

export function createOfflineSessionFromStretchingRoutine(
  routine: StretchingRoutineDto,
  catalog: ExerciseDto[],
  userId = 'local-user',
  weightUnit: WeightUnit = WeightUnit.KG,
): WorkoutSessionDto {
  const catalogMap = new Map(catalog.map((e) => [e.id, e]));
  const clientSessionId = generateId('sess');
  const nowIso = new Date().toISOString();

  const exercises: SessionExerciseDto[] = routine.exercises.map((re, idx) => {
    const exInfo = re.exercise ?? catalogMap.get(re.exerciseId);
    const clientExerciseId = generateId('sex');
    const sets: SessionSetDto[] = Array.from({ length: re.sets }, (_, sIdx) => ({
      id: generateId('set'),
      clientSetId: generateId('cset'),
      sessionExerciseId: clientExerciseId,
      setNumber: sIdx + 1,
      setType: SetType.STRETCH,
      weight: null,
      weightUnit,
      reps: re.reps ?? null,
      durationSeconds: re.durationSeconds ?? 45,
      distanceMeters: null,
      rpe: null,
      completed: false,
      completedAt: null,
      isPersonalRecord: false,
      notes: null,
    }));

    return {
      id: clientExerciseId,
      clientExerciseId,
      sessionId: clientSessionId,
      exerciseId: re.exerciseId,
      replacedExerciseId: null,
      replacedExerciseName: null,
      exerciseNameSnapshot: exInfo?.name ?? 'Stretch',
      primaryMuscleSnapshot: exInfo?.primaryMuscleGroup ?? MuscleGroup.FULL_BODY,
      exerciseTypeSnapshot: exInfo?.exerciseType ?? ExerciseType.STRETCHING,
      origin: SessionExerciseOrigin.PLANNED,
      status: idx === 0 ? SessionExerciseStatus.IN_PROGRESS : SessionExerciseStatus.PENDING,
      orderIndex: idx,
      plannedSets: re.sets,
      plannedWarmupSets: 0,
      targetRepsMin: re.reps,
      targetRepsMax: re.reps,
      targetWeight: null,
      targetDurationSeconds: re.durationSeconds ?? 45,
      restSeconds: re.transitionSeconds ?? 15,
      alternativeExerciseIds: exInfo?.alternativeExerciseIds ?? [],
      notes: re.notes,
      sets,
    };
  });

  return {
    id: clientSessionId,
    clientSessionId,
    userId,
    templateId: null,
    stretchingRoutineId: routine.id,
    sessionType: SessionType.STRETCHING,
    workoutNameSnapshot: routine.name,
    status: SessionStatus.IN_PROGRESS,
    startedAt: nowIso,
    pausedAt: null,
    completedAt: null,
    activeDurationSeconds: 0,
    weightUnit,
    totalVolumeKg: 0,
    totalSetsCompleted: 0,
    totalRepsCompleted: 0,
    totalStretchSeconds: 0,
    notes: null,
    restTimerEndsAt: null,
    restTimerDurationSec: null,
    restTimerPausedRemSec: null,
    version: 1,
    lastSyncedAt: nowIso,
    exercises,
  };
}

/**
 * Computes remaining rest timer seconds from persisted timestamps so backgrounding
 * Safari or reloading the page never drifts or loses the timer countdown.
 */
export function computeRemainingRestSeconds(
  session: Pick<
    WorkoutSessionDto,
    'restTimerEndsAt' | 'restTimerDurationSec' | 'restTimerPausedRemSec'
  > | null,
  nowMs = Date.now(),
): {
  remainingSeconds: number;
  totalSeconds: number;
  isRunning: boolean;
  isPaused: boolean;
} {
  if (!session) {
    return { remainingSeconds: 0, totalSeconds: 0, isRunning: false, isPaused: false };
  }

  const totalSeconds = session.restTimerDurationSec ?? 0;

  if (session.restTimerPausedRemSec !== null && session.restTimerPausedRemSec !== undefined) {
    return {
      remainingSeconds: Math.max(0, session.restTimerPausedRemSec),
      totalSeconds: Math.max(totalSeconds, session.restTimerPausedRemSec),
      isRunning: false,
      isPaused: session.restTimerPausedRemSec > 0,
    };
  }

  if (session.restTimerEndsAt) {
    const endsMs = Date.parse(session.restTimerEndsAt);
    if (!isNaN(endsMs)) {
      const rem = Math.max(0, Math.ceil((endsMs - nowMs) / 1000));
      return {
        remainingSeconds: rem,
        totalSeconds: Math.max(totalSeconds, rem),
        isRunning: rem > 0,
        isPaused: false,
      };
    }
  }

  return { remainingSeconds: 0, totalSeconds, isRunning: false, isPaused: false };
}

/**
 * Replaces a planned exercise in an active session with an alternative exercise
 * without modifying the original WorkoutTemplate.
 */
export function substituteExerciseInSession(
  session: WorkoutSessionDto,
  clientExerciseId: string,
  replacementExercise: ExerciseDto,
  historySessions: WorkoutSessionDto[] = [],
): WorkoutSessionDto {
  const updatedExercises = session.exercises.map((ex) => {
    if (ex.clientExerciseId !== clientExerciseId) return ex;
    const substituted: SessionExerciseDto = {
      ...ex,
      replacedExerciseId: ex.replacedExerciseId ?? ex.exerciseId,
      replacedExerciseName: ex.replacedExerciseName ?? ex.exerciseNameSnapshot,
      exerciseId: replacementExercise.id,
      exerciseNameSnapshot: replacementExercise.name,
      primaryMuscleSnapshot: replacementExercise.primaryMuscleGroup,
      exerciseTypeSnapshot: replacementExercise.exerciseType,
      origin: SessionExerciseOrigin.SUBSTITUTED,
    };
    return applyExerciseHistoryToSessionExercise(
      substituted,
      historySessions,
      replacementExercise,
      session.weightUnit,
    );
  });

  return recalculateSessionTotals({
    ...session,
    version: session.version + 1,
    exercises: updatedExercises,
  });
}
