'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiClientError } from '@/lib/api';
import { countBucket, durationBucket, trackEvent } from '@/lib/analytics/track';
import {
  computeRemainingRestSeconds,
  createOfflineSessionFromStretchingRoutine,
  createOfflineSessionFromTemplate,
  enqueueSessionSync,
  getAcknowledgedServerVersion,
  getCachedCatalog,
  getCachedStretchingRoutines,
  getCachedWorkouts,
  getDeviceId,
  getDismissedSuggestions,
  getFocusedExercise,
  getLocalActiveSession,
  getLocalHistorySessions,
  getSyncQueue,
  getWorkoutOutbox,
  loadExtendedExercises,
  mergeMissingExercises,
  recalculateSessionTotals,
  removeFromSyncQueue,
  removeLocalHistorySession,
  saveLocalActiveSession,
  saveLocalHistorySession,
  setAcknowledgedServerVersion,
  setCachedCatalog,
  setCachedStretchingRoutines,
  setCachedWorkouts,
  setDismissedSuggestions,
  setFocusedExercise as storeFocusedExercise,
  substituteExerciseInSession,
  updateWorkoutOutbox,
  type SyncState,
} from '@/lib/offline/offline-store';
import {
  deleteOp,
  enqueueOp,
  flushWorkoutOutbox,
  folderUpsertOp,
  isSyncable,
  newEntityId,
  overlayPendingOps,
  rekeyLegacyEntities,
  templateUpsertOp,
  type WorkoutOutboxFlushResult,
  type WorkoutOutboxOp,
  type WorkoutsOverview,
} from '@/lib/offline/workout-outbox';
import {
  ExerciseType,
  SessionExerciseOrigin,
  SessionExerciseStatus,
  SessionStatus,
  SessionType,
  SetType,
  WeightUnit,
} from '@luki-fitti/common/enums';
import {
  applyExerciseHistoryToSessionExercise,
  buildTemplateExercisesFromSession,
  DEFAULT_FOLDER_COLOR,
  goalRepRange,
  resolveRestSeconds,
  orderWarmupsFirst,
  summarizeTemplateSets,
  toDismissedSuggestion,
  type DismissedWorkoutSuggestion,
  type WorkoutExerciseSuggestion,
} from '@luki-fitti/common/utils/client';
import {
  localizeExercise,
  localizeFolder,
  localizeStretchingRoutine,
  localizeTemplate,
  movementMechanic,
  resolveExerciseMedia,
} from '@luki-fitti/common/catalog';
import type {
  CreateExerciseDto,
  CreateFolderDto,
  CreateStretchingRoutineDto,
  CreateTemplateDto,
  ExerciseDto,
  SessionExerciseDto,
  SessionSetDto,
  StretchingRoutineDto,
  UpdateTemplateDto,
  WorkoutFolderDto,
  WorkoutSessionDto,
  WorkoutTemplateDto,
} from '@luki-fitti/common/schemas';
import { useAuth } from '../auth/auth-context';
import { useLocale } from '../i18n/locale-context';

interface GymContextValue {
  catalog: ExerciseDto[];
  folders: WorkoutFolderDto[];
  unfiledTemplates: WorkoutTemplateDto[];
  stretchingRoutines: StretchingRoutineDto[];
  activeSession: WorkoutSessionDto | null;
  historySessions: WorkoutSessionDto[];
  isOnline: boolean;
  syncState: SyncState;
  pendingSyncCount: number;
  conflictServerSession: WorkoutSessionDto | null;
  weightUnit: WeightUnit;

  // Catalog actions
  createCustomExercise: (dto: CreateExerciseDto) => Promise<ExerciseDto>;

  // Folder & Template actions
  createFolder: (dto: CreateFolderDto) => Promise<void>;
  renameFolder: (folderId: string, name: string, color?: string) => Promise<void>;
  reorderFolder: (folderId: string, direction: 'UP' | 'DOWN') => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  createTemplate: (dto: CreateTemplateDto) => Promise<WorkoutTemplateDto>;
  updateTemplate: (templateId: string, dto: UpdateTemplateDto) => Promise<void>;
  duplicateTemplate: (templateId: string) => Promise<WorkoutTemplateDto | null>;
  moveTemplate: (templateId: string, folderId: string | null) => Promise<void>;
  deleteTemplate: (templateId: string) => Promise<void>;

  // Stretching Routine actions
  createStretchingRoutine: (dto: CreateStretchingRoutineDto) => Promise<void>;
  deleteStretchingRoutine: (routineId: string) => Promise<void>;

  // Active Session lifecycle & set actions
  startWorkoutFromTemplate: (templateId: string) => Promise<WorkoutSessionDto>;
  startStretchingSession: (routineId: string) => Promise<WorkoutSessionDto>;
  startQuickSession: (name?: string) => Promise<WorkoutSessionDto>;
  updateSet: (
    clientExerciseId: string,
    clientSetId: string,
    patch: Partial<
      Pick<SessionSetDto, 'weight' | 'reps' | 'durationSeconds' | 'rpe' | 'setType' | 'notes'>
    >,
  ) => Promise<void>;
  toggleCompleteSet: (clientExerciseId: string, clientSetId: string) => Promise<void>;
  /** Pass several ids to add one set to each in a single update (e.g. a superset round). */
  addSetToExercise: (clientExerciseIds: string | string[], setType?: SetType) => Promise<void>;
  removeSetFromExercise: (clientExerciseId: string, clientSetId: string) => Promise<void>;
  substituteExercise: (clientExerciseId: string, replacementExerciseId: string) => Promise<void>;
  addExerciseToSession: (exerciseId: string) => Promise<void>;
  removeExerciseFromSession: (clientExerciseId: string) => Promise<void>;
  reorderExercise: (clientExerciseId: string, direction: 'UP' | 'DOWN') => Promise<void>;

  // Rest timer controls
  startRestTimer: (durationSeconds: number) => Promise<void>;
  pauseRestTimer: () => Promise<void>;
  resumeRestTimer: () => Promise<void>;
  adjustRestTimer: (deltaSeconds: number) => Promise<void>;
  skipRestTimer: () => Promise<void>;

  // Session completion & historical editing
  pauseSession: () => Promise<void>;
  resumeSession: () => Promise<void>;
  finishSession: (notes?: string) => Promise<WorkoutSessionDto | null>;
  abandonSession: () => Promise<void>;
  updateHistoricalSession: (updated: WorkoutSessionDto) => Promise<void>;
  deleteHistoricalSession: (clientSessionId: string) => Promise<void>;
  flushSyncQueue: (forceOverwrite?: boolean) => Promise<void>;
  resolveConflict: (choice: 'KEEP_LOCAL' | 'USE_SERVER') => Promise<void>;
  /** Suggestions dismissed or accepted during the active workout. */
  dismissedSuggestions: DismissedWorkoutSuggestion[];
  dismissSuggestion: (suggestion: WorkoutExerciseSuggestion) => Promise<void>;
  /**
   * Exercise the user last opened in the active workout (`undefined` while loading); resolve it
   * with `resolveFocusedExerciseIndex`.
   */
  focusedExerciseId: string | null | undefined;
  setFocusedExercise: (clientExerciseId: string) => void;
  refreshAllData: () => Promise<void>;
}

const GymContext = createContext<GymContextValue | null>(null);

export function useGym(): GymContextValue {
  const ctx = useContext(GymContext);
  if (!ctx) {
    throw new Error('useGym must be used within GymProvider');
  }
  return ctx;
}

export function GymProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const { locale } = useLocale();
  const weightUnit = user?.preferences?.weightUnit ?? WeightUnit.KG;

  const [catalog, setCatalog] = useState<ExerciseDto[]>([]);
  const [folders, setFolders] = useState<WorkoutFolderDto[]>([]);
  const [unfiledTemplates, setUnfiledTemplates] = useState<WorkoutTemplateDto[]>([]);
  const [stretchingRoutines, setStretchingRoutines] = useState<StretchingRoutineDto[]>([]);
  const [activeSession, setActiveSession] = useState<WorkoutSessionDto | null>(null);
  const [historySessions, setHistorySessions] = useState<WorkoutSessionDto[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [syncState, setSyncState] = useState<SyncState>('SYNCED');
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [pendingWorkoutOpsCount, setPendingWorkoutOpsCount] = useState<number>(0);
  const [conflictServerSession, setConflictServerSession] = useState<WorkoutSessionDto | null>(
    null,
  );
  const [dismissedSuggestions, setDismissedSuggestionsState] = useState<
    DismissedWorkoutSuggestion[]
  >([]);
  const [focusedExercise, setFocusedExerciseState] = useState<{
    sessionId: string;
    exerciseId: string | null;
  } | null>(null);

  // Built-in catalog content is resolved by id / systemKey in the current UI language, so cached and
  // offline data follow language switches. User-authored content passes through unchanged.
  const localizedCatalog = useMemo(
    () => catalog.map((ex) => localizeExercise(ex, locale)),
    [catalog, locale],
  );
  const localizedFolders = useMemo(
    () => folders.map((f) => localizeFolder(f, locale)),
    [folders, locale],
  );
  const localizedUnfiledTemplates = useMemo(
    () => unfiledTemplates.map((t) => localizeTemplate(t, locale)),
    [unfiledTemplates, locale],
  );
  const localizedStretchingRoutines = useMemo(
    () => stretchingRoutines.map((r) => localizeStretchingRoutine(r, locale)),
    [stretchingRoutines, locale],
  );

  // The imported exercise database loads after start-up so it never delays the first render.
  // Re-setting the catalog afterwards also re-runs localization with its German names.
  const extendedExercisesRef = useRef<ExerciseDto[]>([]);
  useEffect(() => {
    let cancelled = false;
    void loadExtendedExercises().then((extended) => {
      if (cancelled) return;
      extendedExercisesRef.current = extended;
      setCatalog((prev) => {
        const next = mergeMissingExercises(prev, extended);
        if (next !== prev) void setCachedCatalog(next);
        return next === prev ? [...prev] : next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeSessionId = activeSession?.clientSessionId ?? null;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [stored, focused] = activeSessionId
        ? await Promise.all([
            getDismissedSuggestions(activeSessionId),
            getFocusedExercise(activeSessionId),
          ])
        : [[], null];
      if (cancelled) return;
      setDismissedSuggestionsState(stored);
      if (activeSessionId)
        setFocusedExerciseState({ sessionId: activeSessionId, exerciseId: focused });
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSessionId]);

  // `undefined` until the stored value for the current session has loaded.
  const focusedExerciseId =
    activeSessionId && focusedExercise?.sessionId === activeSessionId
      ? focusedExercise.exerciseId
      : undefined;

  const setFocusedExercise = useCallback(
    (clientExerciseId: string) => {
      if (!activeSessionId) return;
      setFocusedExerciseState({ sessionId: activeSessionId, exerciseId: clientExerciseId });
      void storeFocusedExercise(activeSessionId, clientExerciseId);
    },
    [activeSessionId],
  );

  const dismissSuggestion = useCallback(
    async (suggestion: WorkoutExerciseSuggestion) => {
      if (!activeSessionId) return;
      const next = [...dismissedSuggestions, toDismissedSuggestion(suggestion)];
      setDismissedSuggestionsState(next);
      await setDismissedSuggestions(activeSessionId, next);
    },
    [activeSessionId, dismissedSuggestions],
  );

  const isFlushingRef = useRef(false);
  const flushRequestedRef = useRef(false);
  const flushSyncQueueRef = useRef<(() => Promise<void>) | null>(null);
  const isRefreshingRef = useRef(false);
  const lastRefreshAtRef = useRef<number>(0);
  const syncTimerRef = useRef<number | null>(null);
  const deletedSessionIdsRef = useRef<Set<string>>(new Set());
  const isFlushingWorkoutsRef = useRef(false);
  const inFlightWorkoutKeysRef = useRef<Set<string>>(new Set());

  /** Applies a change to the cached overview and the state (for changes made by a sync). */
  const applyWorkoutsLocally = useCallback(
    async (fn: (overview: WorkoutsOverview) => WorkoutsOverview) => {
      const next = fn(await getCachedWorkouts());
      setFolders(next.folders);
      setUnfiledTemplates(next.unfiledTemplates);
      await setCachedWorkouts(next);
    },
    [],
  );

  const enqueueWorkoutOps = useCallback(async (ops: WorkoutOutboxOp[]) => {
    const outbox = await updateWorkoutOutbox((current) =>
      ops.reduce((acc, op) => enqueueOp(acc, op, inFlightWorkoutKeysRef.current), current),
    );
    setPendingWorkoutOpsCount(outbox.length);
  }, []);

  /** Sends pending folder/template changes (signed in only); `null` when nothing was sent. */
  const flushWorkoutChanges = useCallback(async (): Promise<WorkoutOutboxFlushResult | null> => {
    if (!isAuthenticated || isFlushingWorkoutsRef.current) return null;
    isFlushingWorkoutsRef.current = true;
    try {
      // Folders and workouts created before changes were queued get server ids and are uploaded.
      const legacy = rekeyLegacyEntities(await getCachedWorkouts());
      if (legacy.ops.length > 0) {
        await applyWorkoutsLocally(() => legacy.overview);
        await enqueueWorkoutOps(legacy.ops);
      }
      if (!navigator.onLine) return null;
      return await flushWorkoutOutbox({
        api: {
          createFolder: (body) => api.workouts.createFolder(body),
          updateFolder: (id, body) => api.workouts.updateFolder(id, body),
          deleteFolder: (id) => api.workouts.deleteFolder(id),
          createTemplate: (body) => api.workouts.createTemplate(body),
          updateTemplate: (id, body) => api.workouts.updateTemplate(id, body),
          deleteTemplate: (id) => api.workouts.deleteTemplate(id),
        },
        readOutbox: getWorkoutOutbox,
        updateOutbox: updateWorkoutOutbox,
        inFlightKeys: inFlightWorkoutKeysRef.current,
        localFolderNames: async () => (await getCachedWorkouts()).folders.map((f) => f.name),
        renameFolderLocally: (id, name) =>
          applyWorkoutsLocally((o) => ({
            ...o,
            folders: o.folders.map((f) => (f.id === id ? { ...f, name, systemKey: null } : f)),
          })),
        onRejected: (op) =>
          trackEvent('offline_sync', { status: 'workout_change_rejected', kind: op.kind }),
      });
    } finally {
      isFlushingWorkoutsRef.current = false;
      setPendingWorkoutOpsCount((await getWorkoutOutbox()).length);
    }
  }, [applyWorkoutsLocally, enqueueWorkoutOps, isAuthenticated]);

  /** Replaces local folders/workouts with the server's, keeping changes not sent yet. */
  const refreshWorkoutsFromServer = useCallback(async () => {
    const res = await api.workouts.getOverview();
    if (!res.success || !res.data) return;
    const merged = overlayPendingOps(res.data, await getWorkoutOutbox());
    setFolders(merged.folders);
    setUnfiledTemplates(merged.unfiledTemplates);
    await setCachedWorkouts(merged);
  }, []);

  const flushSyncQueue = useCallback(
    async (forceOverwrite = false) => {
      if (isFlushingRef.current) {
        flushRequestedRef.current = true;
        return;
      }
      if (!isAuthenticated) {
        setPendingSyncCount(0);
        setPendingWorkoutOpsCount(0);
        setSyncState(navigator.onLine ? 'SAVED_LOCALLY' : 'OFFLINE');
        return;
      }

      // Workout structure goes first: synced sessions may reference a new workout.
      const workoutFlush = await flushWorkoutChanges().catch(() => null);
      if (workoutFlush?.stoppedBy === 'auth') {
        setSyncState('AUTH_EXPIRED');
        return;
      }
      if (workoutFlush?.needsRefresh) {
        void refreshWorkoutsFromServer().catch(() => undefined);
      }
      const workoutChangesLeft = (await getWorkoutOutbox()).length > 0;

      const queue = await getSyncQueue();
      setPendingSyncCount(queue.length);

      if (queue.length === 0) {
        setSyncState(
          !navigator.onLine ? 'OFFLINE' : workoutChangesLeft ? 'SAVED_LOCALLY' : 'SYNCED',
        );
        return;
      }

      if (!navigator.onLine) {
        setSyncState('OFFLINE');
        return;
      }

      isFlushingRef.current = true;
      setSyncState('SYNCING');

      try {
        const deviceId = await getDeviceId();
        let pending = queue;
        while (pending.length > 0) {
          let hasNewerLocalEdits = false;
          for (const item of pending) {
            if (deletedSessionIdsRef.current.has(item.clientSessionId)) {
              await removeFromSyncQueue(item.clientSessionId);
              continue;
            }

            const baseVersion = await getAcknowledgedServerVersion(item.clientSessionId);
            const payload = {
              ...item.payload,
              deviceId,
              ...(baseVersion !== undefined ? { baseVersion } : {}),
              ...(forceOverwrite ? { forceOverwrite: true } : {}),
            };
            const res = await api.sessions.sync(payload);

            if (deletedSessionIdsRef.current.has(item.clientSessionId)) {
              await removeFromSyncQueue(item.clientSessionId);
              await api.sessions.remove(item.clientSessionId).catch(() => undefined);
              continue;
            }

            if (res.success && res.data) {
              if (res.data.conflictDetected) {
                trackEvent('offline_sync', { status: 'conflict' });
                setConflictServerSession(res.data.session);
                setSyncState('CONFLICT');
                isFlushingRef.current = false;
                return;
              }

              await setAcknowledgedServerVersion(
                item.clientSessionId,
                res.data.session.status === SessionStatus.COMPLETED ? null : res.data.serverVersion,
              );

              // The user may have edited the session while this request was in flight.
              // Applying the (now stale) server echo would revert that edit, and dropping
              // the queue entry would lose it — so keep it queued and sync it next.
              const latestQueued = (await getSyncQueue()).find(
                (q) => q.clientSessionId === item.clientSessionId,
              );
              if (latestQueued && latestQueued.payload.version !== item.payload.version) {
                hasNewerLocalEdits = true;
                continue;
              }

              await removeFromSyncQueue(item.clientSessionId);
              if (res.data.session.status === SessionStatus.COMPLETED) {
                await saveLocalHistorySession(res.data.session);
              } else {
                const currentLocalActive = await getLocalActiveSession();
                if (
                  currentLocalActive &&
                  currentLocalActive.clientSessionId === res.data.session.clientSessionId &&
                  currentLocalActive.version === item.payload.version
                ) {
                  await saveLocalActiveSession(res.data.session);
                  setActiveSession(res.data.session);
                }
              }
            }
          }
          pending = hasNewerLocalEdits ? await getSyncQueue() : [];
        }

        const remaining = await getSyncQueue();
        setPendingSyncCount(remaining.length);
        setSyncState(remaining.length === 0 && !workoutChangesLeft ? 'SYNCED' : 'SAVED_LOCALLY');
        // Successful syncs are not tracked: they run on a short timer during every workout.
      } catch (err) {
        if (err instanceof ApiClientError && err.isAuthError) {
          setSyncState('AUTH_EXPIRED');
          trackEvent('offline_sync', { status: 'auth_expired' });
        } else {
          setSyncState('SAVED_LOCALLY');
          trackEvent('offline_sync', { status: 'error' });
        }
      } finally {
        isFlushingRef.current = false;
        if (flushRequestedRef.current) {
          flushRequestedRef.current = false;
          void flushSyncQueueRef.current?.();
        }
      }
    },
    [flushWorkoutChanges, isAuthenticated, refreshWorkoutsFromServer],
  );

  useEffect(() => {
    flushSyncQueueRef.current = flushSyncQueue;
  }, [flushSyncQueue]);

  const refreshAllData = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    try {
      const [localCat, localWorkouts, localStretch, localActive, localHistory, queue, outbox] =
        await Promise.all([
          getCachedCatalog(),
          getCachedWorkouts(),
          getCachedStretchingRoutines(),
          getLocalActiveSession(),
          getLocalHistorySessions(),
          getSyncQueue(),
          getWorkoutOutbox(),
        ]);

      setCatalog(mergeMissingExercises(localCat, extendedExercisesRef.current));
      setFolders(localWorkouts.folders);
      setUnfiledTemplates(localWorkouts.unfiledTemplates);
      setStretchingRoutines(localStretch);
      if (localActive && !deletedSessionIdsRef.current.has(localActive.clientSessionId)) {
        setActiveSession(localActive);
      } else {
        setActiveSession(null);
      }
      if (!isAuthenticated) {
        setConflictServerSession(null);
      }
      setHistorySessions(
        localHistory.filter(
          (s) =>
            s.status === SessionStatus.COMPLETED &&
            !deletedSessionIdsRef.current.has(s.clientSessionId) &&
            !deletedSessionIdsRef.current.has(s.id),
        ),
      );
      setPendingSyncCount(isAuthenticated ? queue.length : 0);
      setPendingWorkoutOpsCount(isAuthenticated ? outbox.length : 0);

      if (!navigator.onLine || !isAuthenticated) {
        setSyncState(
          !navigator.onLine
            ? 'OFFLINE'
            : !isAuthenticated
              ? 'SAVED_LOCALLY'
              : queue.length > 0
                ? 'SAVED_LOCALLY'
                : 'SYNCED',
        );
        return;
      }

      // Send local folder/workout changes before downloading, so the server copy includes them.
      await flushWorkoutChanges().catch(() => null);

      const [catRes, wkRes, stRes, sessRes, activeRes] = await Promise.all([
        api.exercises.list(),
        api.workouts.getOverview(),
        api.stretching.listRoutines(),
        api.sessions.list({ status: SessionStatus.COMPLETED }),
        api.sessions.getActive(),
      ]);

      if (catRes.success && catRes.data) {
        const serverCatalog = mergeMissingExercises(catRes.data, extendedExercisesRef.current);
        setCatalog(serverCatalog);
        await setCachedCatalog(serverCatalog);
      }
      if (wkRes.success && wkRes.data) {
        // Changes still waiting to be sent must neither come back nor disappear.
        const merged = overlayPendingOps(wkRes.data, await getWorkoutOutbox());
        setFolders(merged.folders);
        setUnfiledTemplates(merged.unfiledTemplates);
        await setCachedWorkouts(merged);
      }
      if (stRes.success && stRes.data) {
        setStretchingRoutines(stRes.data);
        await setCachedStretchingRoutines(stRes.data);
      }
      if (sessRes.success && sessRes.data) {
        const mergedMap = new Map<string, WorkoutSessionDto>();
        for (const s of localHistory) {
          if (
            s.status === SessionStatus.COMPLETED &&
            !deletedSessionIdsRef.current.has(s.clientSessionId) &&
            !deletedSessionIdsRef.current.has(s.id)
          ) {
            mergedMap.set(s.clientSessionId, s);
          }
        }
        for (const s of sessRes.data) {
          if (
            s.status === SessionStatus.COMPLETED &&
            !deletedSessionIdsRef.current.has(s.clientSessionId) &&
            !deletedSessionIdsRef.current.has(s.id)
          ) {
            mergedMap.set(s.clientSessionId, s);
            await saveLocalHistorySession(s);
          }
        }
        setHistorySessions(
          Array.from(mergedMap.values()).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
        );
      }
      // Reconcile active session across multiple devices (e.g., Mac + iPhone)
      const hasPendingLocalActiveSync = Boolean(
        localActive && queue.some((q) => q.clientSessionId === localActive.clientSessionId),
      );

      if (activeRes.success) {
        const serverActive = activeRes.data;
        if (
          serverActive &&
          !deletedSessionIdsRef.current.has(serverActive.clientSessionId) &&
          !deletedSessionIdsRef.current.has(serverActive.id)
        ) {
          if (
            !localActive ||
            (!hasPendingLocalActiveSync &&
              (localActive.clientSessionId !== serverActive.clientSessionId ||
                serverActive.version >= localActive.version))
          ) {
            setActiveSession(serverActive);
            await saveLocalActiveSession(serverActive);
            await setAcknowledgedServerVersion(serverActive.clientSessionId, serverActive.version);
          }
        } else if (!serverActive && localActive && !hasPendingLocalActiveSync) {
          // Session was finished or abandoned on another device
          setActiveSession(null);
          await saveLocalActiveSession(null);
        }
      }

      lastRefreshAtRef.current = Date.now();
      await flushSyncQueue();
    } catch {
      // Keep offline cached data
    } finally {
      isRefreshingRef.current = false;
    }
  }, [flushSyncQueue, flushWorkoutChanges, isAuthenticated]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refreshAllData();
    }, 0);
    return () => window.clearTimeout(id);
  }, [refreshAllData, user?.id]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void refreshAllData();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncState('OFFLINE');
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        if (Date.now() - lastRefreshAtRef.current > 3000) {
          void refreshAllData();
        } else {
          void flushSyncQueue();
        }
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [flushSyncQueue, refreshAllData]);

  // Register PWA service worker
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => reg.update())
        .catch(() => undefined);
    }
  }, []);

  const persistSessionUpdate = useCallback(
    async (nextSession: WorkoutSessionDto) => {
      const recalculated = recalculateSessionTotals({
        ...nextSession,
        version: nextSession.version + 1,
        lastSyncedAt: new Date().toISOString(),
      });
      setActiveSession(recalculated);
      await saveLocalActiveSession(recalculated);
      if (isAuthenticated) {
        await enqueueSessionSync(recalculated);
        const q = await getSyncQueue();
        setPendingSyncCount(q.length);
        setSyncState(navigator.onLine ? 'SAVED_LOCALLY' : 'OFFLINE');
        if (navigator.onLine) {
          if (syncTimerRef.current !== null) {
            window.clearTimeout(syncTimerRef.current);
          }
          syncTimerRef.current = window.setTimeout(() => {
            syncTimerRef.current = null;
            void flushSyncQueue();
          }, 400);
        }
      } else {
        setSyncState(navigator.onLine ? 'SAVED_LOCALLY' : 'OFFLINE');
      }
      return recalculated;
    },
    [flushSyncQueue, isAuthenticated],
  );

  const createCustomExercise = async (dto: CreateExerciseDto): Promise<ExerciseDto> => {
    if (navigator.onLine && isAuthenticated) {
      try {
        const res = await api.exercises.create(dto);
        if (res.success && res.data) {
          const next = [...catalog, res.data];
          setCatalog(next);
          await setCachedCatalog(next);
          return res.data;
        }
      } catch {
        // Fallback to local creation
      }
    }

    const custom: ExerciseDto = {
      id: `custom-${Date.now()}`,
      slug: `custom-${Date.now()}`,
      userId: user?.id ?? 'local-athlete',
      name: dto.name,
      description: dto.description,
      instructions: dto.instructions ?? [],
      category: dto.category,
      exerciseType: dto.exerciseType,
      primaryMuscleGroup: dto.primaryMuscleGroup,
      secondaryMuscleGroups: dto.secondaryMuscleGroups ?? [],
      equipment: dto.equipment,
      recommendedDurationSeconds: dto.recommendedDurationSeconds ?? null,
      tags: dto.tags ?? [],
      isSystem: false,
      alternativeExerciseIds: dto.alternativeExerciseIds ?? [],
      movementPattern: dto.movementPattern ?? null,
      laterality: dto.laterality ?? null,
      mechanic: dto.movementPattern ? movementMechanic(dto.movementPattern) : null,
      targetRegions: [],
      media: dto.mediaUrl?.trim()
        ? [
            {
              id: `media-${Date.now()}`,
              mediaType: dto.mediaUrl.toLowerCase().endsWith('.gif') ? 'GIF' : 'IMAGE',
              url: dto.mediaUrl.trim(),
              caption: `${dto.name} demonstration`,
            },
          ]
        : resolveExerciseMedia({
            name: dto.name,
            primaryMuscleGroup: dto.primaryMuscleGroup,
            isSystem: false,
          }),
    };
    const next = [...catalog, custom];
    setCatalog(next);
    await setCachedCatalog(next);
    return custom;
  };

  /**
   * Folder/workout changes apply locally right away; signed-in users also queue them for the
   * server (online and offline alike), so a later download never undoes them.
   */
  const commitWorkouts = async (next: WorkoutsOverview, ops: WorkoutOutboxOp[] = []) => {
    setFolders(next.folders);
    setUnfiledTemplates(next.unfiledTemplates);
    await setCachedWorkouts(next);
    const syncable = isAuthenticated ? ops.filter((op) => isSyncable(op.id)) : [];
    if (syncable.length === 0) return;
    await enqueueWorkoutOps(syncable);
    setSyncState(navigator.onLine ? 'SAVED_LOCALLY' : 'OFFLINE');
    if (navigator.onLine) void flushSyncQueue();
  };

  const toTemplateExercises = (
    templateId: string,
    inputs: NonNullable<UpdateTemplateDto['exercises']>,
  ): WorkoutTemplateDto['exercises'] => {
    const catalogById = new Map(catalog.map((e) => [e.id, e]));
    return inputs.map((ex, idx) => {
      const sets = ex.sets && ex.sets.length > 0 ? ex.sets : null;
      const summary = sets ? summarizeTemplateSets(sets) : null;
      return {
        id: ex.id ?? newEntityId(),
        templateId,
        exerciseId: ex.exerciseId,
        sets,
        orderIndex: idx,
        plannedSets: summary?.plannedSets ?? ex.plannedSets,
        warmupSets: summary?.warmupSets ?? ex.warmupSets ?? 0,
        targetRepsMin: ex.targetRepsMin ?? 8,
        targetRepsMax: ex.targetRepsMax ?? 12,
        targetWeight: (summary ? summary.targetWeight : ex.targetWeight) ?? null,
        weightUnit: ex.weightUnit ?? weightUnit,
        restSeconds: ex.restSeconds ?? 90,
        targetDurationSeconds: ex.targetDurationSeconds ?? null,
        targetDistanceMeters: ex.targetDistanceMeters ?? null,
        notes: ex.notes ?? null,
        alternativeExerciseIds: ex.alternativeExerciseIds ?? [],
        exercise: catalogById.get(ex.exerciseId),
      };
    });
  };

  const createFolder = async (dto: CreateFolderDto) => {
    const newFolder: WorkoutFolderDto = {
      id: newEntityId(),
      userId: user?.id ?? 'local-athlete',
      name: dto.name.trim(),
      color: dto.color ?? DEFAULT_FOLDER_COLOR,
      sortOrder: folders.length,
      templates: [],
    };
    await commitWorkouts({ folders: [...folders, newFolder], unfiledTemplates }, [
      folderUpsertOp(newFolder, false),
    ]);
  };

  const renameFolder = async (folderId: string, name: string, color?: string) => {
    const target = folders.find((f) => f.id === folderId);
    if (!target) return;
    const renamed = { ...target, name: name.trim(), systemKey: null, ...(color ? { color } : {}) };
    await commitWorkouts(
      { folders: folders.map((f) => (f.id === folderId ? renamed : f)), unfiledTemplates },
      [folderUpsertOp(renamed)],
    );
  };

  const reorderFolder = async (folderId: string, direction: 'UP' | 'DOWN') => {
    const idx = folders.findIndex((f) => f.id === folderId);
    if (idx === -1) return;
    const targetIdx = direction === 'UP' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= folders.length) return;

    const copy = [...folders];
    const [moved] = copy.splice(idx, 1);
    if (!moved) return;
    copy.splice(targetIdx, 0, moved);

    const reindexed = copy.map((f, i) => ({ ...f, sortOrder: i }));
    const changed = reindexed.filter(
      (f) => folders.find((o) => o.id === f.id)?.sortOrder !== f.sortOrder,
    );
    await commitWorkouts(
      { folders: reindexed, unfiledTemplates },
      changed.map((f) => folderUpsertOp(f)),
    );
  };

  const deleteFolder = async (folderId: string) => {
    const target = folders.find((f) => f.id === folderId);
    const movedTemplates = (target?.templates ?? []).map((t) => ({ ...t, folderId: null }));
    // Pending creates of its workouts must not point at the deleted folder.
    await commitWorkouts(
      {
        folders: folders.filter((f) => f.id !== folderId),
        unfiledTemplates: [...unfiledTemplates, ...movedTemplates],
      },
      [...movedTemplates.map((t) => templateUpsertOp(t)), deleteOp('folder', folderId)],
    );
  };

  const createTemplate = async (dto: CreateTemplateDto): Promise<WorkoutTemplateDto> => {
    const nowIso = new Date().toISOString();
    const tplId = newEntityId();
    const folderId = dto.folderId ?? null;
    const siblings = folderId
      ? (folders.find((f) => f.id === folderId)?.templates ?? [])
      : unfiledTemplates;
    const newTpl: WorkoutTemplateDto = {
      id: tplId,
      systemKey: null,
      userId: user?.id ?? 'local-athlete',
      folderId,
      name: dto.name.trim(),
      description: dto.description ?? null,
      trainingGoal: dto.trainingGoal ?? null,
      estimatedDurationMinutes: dto.estimatedDurationMinutes ?? 60,
      sortOrder: dto.sortOrder ?? siblings.length,
      createdAt: nowIso,
      updatedAt: nowIso,
      exercises: toTemplateExercises(tplId, dto.exercises ?? []),
    };
    const op = templateUpsertOp(newTpl, false);
    await commitWorkouts(overlayPendingOps({ folders, unfiledTemplates }, [op]), [op]);
    return newTpl;
  };

  const applyTemplateUpdate = async (
    templateId: string,
    dto: UpdateTemplateDto,
    { localOnly = false } = {},
  ) => {
    const current = [...folders.flatMap((f) => f.templates), ...unfiledTemplates].find(
      (t) => t.id === templateId,
    );
    if (!current) return;
    // Editing a starter copy turns it into user content in the language the user sees.
    const editsText =
      dto.name !== undefined || dto.description !== undefined || dto.exercises !== undefined;
    const t =
      current.systemKey && editsText
        ? { ...localizeTemplate(current, locale), systemKey: null }
        : current;
    const updated: WorkoutTemplateDto = {
      ...t,
      name: dto.name ?? t.name,
      description: dto.description !== undefined ? (dto.description ?? null) : t.description,
      folderId: dto.folderId !== undefined ? dto.folderId : t.folderId,
      trainingGoal: dto.trainingGoal !== undefined ? dto.trainingGoal : (t.trainingGoal ?? null),
      estimatedDurationMinutes: dto.estimatedDurationMinutes ?? t.estimatedDurationMinutes,
      sortOrder: dto.sortOrder ?? t.sortOrder,
      updatedAt: new Date().toISOString(),
      exercises:
        dto.exercises !== undefined ? toTemplateExercises(templateId, dto.exercises) : t.exercises,
    };
    const op = templateUpsertOp(updated);
    await commitWorkouts(
      overlayPendingOps({ folders, unfiledTemplates }, [op]),
      localOnly ? [] : [op],
    );
  };

  const updateTemplate = (templateId: string, dto: UpdateTemplateDto) =>
    applyTemplateUpdate(templateId, dto);

  const duplicateTemplate = async (templateId: string): Promise<WorkoutTemplateDto | null> => {
    const allTemplates = [
      ...localizedFolders.flatMap((f) => f.templates),
      ...localizedUnfiledTemplates,
    ];
    const source = allTemplates.find((t) => t.id === templateId);
    if (!source) return null;

    const nowIso = new Date().toISOString();
    const tplId = newEntityId();
    const newTpl: WorkoutTemplateDto = {
      ...source,
      id: tplId,
      systemKey: null,
      userId: user?.id ?? 'local-athlete',
      name: `${source.name} (Copy)`,
      estimatedDurationMinutes: source.estimatedDurationMinutes ?? 60,
      sortOrder: source.sortOrder + 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      exercises: source.exercises.map((ex, idx) => ({
        ...ex,
        id: newEntityId(),
        templateId: tplId,
        orderIndex: idx,
        exercise: ex.exercise ?? catalog.find((e) => e.id === ex.exerciseId),
      })),
    };

    const list = source.folderId
      ? (folders.find((f) => f.id === source.folderId)?.templates ?? [])
      : unfiledTemplates;
    const copyList = [...list];
    const sourceIdx = copyList.findIndex((t) => t.id === templateId);
    copyList.splice(sourceIdx >= 0 ? sourceIdx + 1 : copyList.length, 0, newTpl);
    const reindexed = copyList.map((t, i) => ({ ...t, sortOrder: i }));
    const placed = reindexed.find((t) => t.id === tplId) ?? newTpl;
    const moved = reindexed.filter(
      (t) => t.id !== tplId && list.find((o) => o.id === t.id)?.sortOrder !== t.sortOrder,
    );
    const inFolder = Boolean(source.folderId) && folders.some((f) => f.id === source.folderId);
    await commitWorkouts(
      inFolder
        ? {
            folders: folders.map((f) =>
              f.id === source.folderId ? { ...f, templates: reindexed } : f,
            ),
            unfiledTemplates,
          }
        : { folders, unfiledTemplates: reindexed },
      [templateUpsertOp(placed, false), ...moved.map((t) => templateUpsertOp(t))],
    );
    return placed;
  };

  const moveTemplate = async (templateId: string, targetFolderId: string | null) => {
    const tpl = [...folders.flatMap((f) => f.templates), ...unfiledTemplates].find(
      (t) => t.id === templateId,
    );
    if (!tpl) return;
    const op = templateUpsertOp({ ...tpl, folderId: targetFolderId });
    await commitWorkouts(overlayPendingOps({ folders, unfiledTemplates }, [op]), [op]);
  };

  const deleteTemplate = async (templateId: string) => {
    await commitWorkouts(
      {
        folders: folders.map((f) => ({
          ...f,
          templates: f.templates.filter((t) => t.id !== templateId),
        })),
        unfiledTemplates: unfiledTemplates.filter((t) => t.id !== templateId),
      },
      [deleteOp('template', templateId)],
    );
  };

  const createStretchingRoutine = async (dto: CreateStretchingRoutineDto) => {
    if (navigator.onLine && isAuthenticated) {
      try {
        const res = await api.stretching.createRoutine(dto);
        if (res.success && res.data) {
          const next = [...stretchingRoutines, res.data];
          setStretchingRoutines(next);
          await setCachedStretchingRoutines(next);
          return;
        }
      } catch {
        // Offline fallback
      }
    }
    const catalogById = new Map(catalog.map((e) => [e.id, e]));
    const routineId = `stretch-${Date.now()}`;
    const created: StretchingRoutineDto = {
      id: routineId,
      userId: user?.id ?? 'local-athlete',
      name: dto.name.trim(),
      description: dto.description ?? null,
      targetArea: dto.targetArea ?? 'Full Body',
      estimatedDurationSeconds: dto.estimatedDurationSeconds ?? 600,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      exercises: (dto.exercises ?? []).map((ex, idx) => ({
        id: `sre-${Date.now()}-${idx}`,
        routineId,
        exerciseId: ex.exerciseId,
        orderIndex: idx,
        sets: ex.sets ?? 1,
        durationSeconds: ex.durationSeconds ?? 45,
        reps: ex.reps ?? null,
        transitionSeconds: ex.transitionSeconds ?? 15,
        notes: ex.notes ?? null,
        exercise: catalogById.get(ex.exerciseId),
      })),
    };
    const next = [...stretchingRoutines, created];
    setStretchingRoutines(next);
    await setCachedStretchingRoutines(next);
  };

  const deleteStretchingRoutine = async (routineId: string) => {
    if (navigator.onLine && isAuthenticated) {
      try {
        await api.stretching.deleteRoutine(routineId);
      } catch {
        // Offline fallback
      }
    }
    const next = stretchingRoutines.filter((r) => r.id !== routineId);
    setStretchingRoutines(next);
    await setCachedStretchingRoutines(next);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Active Session Execution (Offline-First)
  // ───────────────────────────────────────────────────────────────────────────
  // Sessions snapshot names and notes in the language the user sees when starting.
  const startWorkoutFromTemplate = async (templateId: string): Promise<WorkoutSessionDto> => {
    const allTemplates = [
      ...localizedFolders.flatMap((f) => f.templates),
      ...localizedUnfiledTemplates,
    ];
    const tpl = allTemplates.find((t) => t.id === templateId);
    if (!tpl) {
      throw new Error('Workout template not found');
    }

    const session = createOfflineSessionFromTemplate(
      tpl,
      localizedCatalog,
      user?.id ?? 'local-athlete',
      weightUnit,
      historySessions,
      user?.preferences?.trainingGoal ?? null,
    );
    await persistSessionUpdate(session);
    trackEvent('workout_start', { source: 'template' });
    return session;
  };

  const startStretchingSession = async (routineId: string): Promise<WorkoutSessionDto> => {
    const routine = localizedStretchingRoutines.find((r) => r.id === routineId);
    if (!routine) {
      throw new Error('Stretching routine not found');
    }

    const session = createOfflineSessionFromStretchingRoutine(
      routine,
      localizedCatalog,
      user?.id ?? 'local-athlete',
      weightUnit,
    );
    await persistSessionUpdate(session);
    trackEvent('workout_start', { source: 'stretching' });
    return session;
  };

  const startQuickSession = async (name = 'Freestyle Gym Session'): Promise<WorkoutSessionDto> => {
    const nowIso = new Date().toISOString();
    const clientSessionId = `sess-${Date.now()}`;
    const session: WorkoutSessionDto = {
      id: clientSessionId,
      clientSessionId,
      userId: user?.id ?? 'local-athlete',
      templateId: null,
      stretchingRoutineId: null,
      sessionType: SessionType.STRENGTH,
      trainingGoalSnapshot: user?.preferences?.trainingGoal ?? null,
      workoutNameSnapshot: name,
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
      exercises: [],
    };
    await persistSessionUpdate(session);
    trackEvent('workout_start', { source: 'quick' });
    return session;
  };

  const updateSet = async (
    clientExerciseId: string,
    clientSetId: string,
    patch: Partial<
      Pick<SessionSetDto, 'weight' | 'reps' | 'durationSeconds' | 'rpe' | 'setType' | 'notes'>
    >,
  ) => {
    if (!activeSession) return;
    const nextExercises = activeSession.exercises.map((ex) => {
      if (ex.clientExerciseId !== clientExerciseId) return ex;
      const patched = ex.sets.map((s) => (s.clientSetId === clientSetId ? { ...s, ...patch } : s));
      // Warm-ups always come first, so a set switched to warm-up moves to the top.
      const sets =
        patch.setType !== undefined
          ? orderWarmupsFirst(patched).map((s, idx) => ({ ...s, setNumber: idx + 1 }))
          : patched;
      return { ...ex, sets };
    });
    await persistSessionUpdate({ ...activeSession, exercises: nextExercises });
  };

  const toggleCompleteSet = async (clientExerciseId: string, clientSetId: string) => {
    if (!activeSession) return;
    let restSecToStart: number | null = null;

    const nextExercises = activeSession.exercises.map((ex) => {
      if (ex.clientExerciseId !== clientExerciseId) return ex;
      const updatedSets = ex.sets.map((s) => {
        if (s.clientSetId !== clientSetId) return s;
        const nextCompleted = !s.completed;
        if (nextCompleted) {
          restSecToStart =
            ex.restSeconds === 0
              ? 0
              : (ex.restSeconds ?? user?.preferences?.defaultRestSeconds ?? 90);
        }
        return {
          ...s,
          completed: nextCompleted,
          completedAt: nextCompleted ? new Date().toISOString() : null,
        };
      });

      const allCompleted = updatedSets.length > 0 && updatedSets.every((s) => s.completed);
      const nextStatus = allCompleted
        ? SessionExerciseStatus.COMPLETED
        : SessionExerciseStatus.IN_PROGRESS;

      return {
        ...ex,
        status: nextStatus,
        sets: updatedSets,
      };
    });

    const nowMs = Date.now();
    const restUpdate =
      restSecToStart === null
        ? {}
        : restSecToStart === 0
          ? {
              restTimerEndsAt: null,
              restTimerDurationSec: null,
              restTimerPausedRemSec: null,
            }
          : {
              restTimerEndsAt: new Date(nowMs + restSecToStart * 1000).toISOString(),
              restTimerDurationSec: restSecToStart,
              restTimerPausedRemSec: null,
            };

    await persistSessionUpdate({
      ...activeSession,
      ...restUpdate,
      exercises: nextExercises,
    });
  };

  const addSetToExercise = async (
    clientExerciseIds: string | string[],
    setType: SetType = SetType.WORKING,
  ) => {
    if (!activeSession) return;
    const targets = new Set(
      Array.isArray(clientExerciseIds) ? clientExerciseIds : [clientExerciseIds],
    );
    const nextExercises = activeSession.exercises.map((ex) => {
      if (!targets.has(ex.clientExerciseId)) return ex;
      const lastSet = ex.sets[ex.sets.length - 1];
      const newSet: SessionSetDto = {
        id: `set-${Date.now()}`,
        clientSetId: `cset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sessionExerciseId: ex.clientExerciseId,
        setNumber: ex.sets.length + 1,
        setType,
        weight: lastSet?.weight ?? ex.targetWeight ?? null,
        weightUnit: lastSet?.weightUnit ?? activeSession.weightUnit,
        reps: lastSet?.reps ?? ex.targetRepsMin ?? 10,
        durationSeconds: lastSet?.durationSeconds ?? ex.targetDurationSeconds ?? null,
        distanceMeters: null,
        rpe: null,
        completed: false,
        completedAt: null,
        isPersonalRecord: false,
        notes: null,
      };
      return {
        ...ex,
        sets: [...ex.sets, newSet],
      };
    });
    await persistSessionUpdate({ ...activeSession, exercises: nextExercises });
  };

  const removeSetFromExercise = async (clientExerciseId: string, clientSetId: string) => {
    if (!activeSession) return;
    const nextExercises = activeSession.exercises.map((ex) => {
      if (ex.clientExerciseId !== clientExerciseId) return ex;
      const filtered = ex.sets
        .filter((s) => s.clientSetId !== clientSetId)
        .map((s, idx) => ({ ...s, setNumber: idx + 1 }));
      return { ...ex, sets: filtered };
    });
    await persistSessionUpdate({ ...activeSession, exercises: nextExercises });
  };

  const substituteExercise = async (clientExerciseId: string, replacementExerciseId: string) => {
    if (!activeSession) return;
    const replacement = localizedCatalog.find((e) => e.id === replacementExerciseId);
    if (!replacement) return;
    const updated = substituteExerciseInSession(
      activeSession,
      clientExerciseId,
      replacement,
      historySessions,
    );
    await persistSessionUpdate(updated);
    trackEvent('exercise_swap');
  };

  const addExerciseToSession = async (exerciseId: string) => {
    if (!activeSession) return;
    const exInfo = localizedCatalog.find((e) => e.id === exerciseId);
    if (!exInfo) return;

    const clientExerciseId = `sex-${Date.now()}`;
    const isStretch = exInfo.exerciseType === ExerciseType.STRETCHING;
    const sessionGoal = activeSession.trainingGoalSnapshot ?? null;
    const band = sessionGoal && !isStretch ? goalRepRange(sessionGoal, exInfo) : null;

    const defaultSets: SessionSetDto[] = Array.from({ length: isStretch ? 2 : 3 }, (_, idx) => ({
      id: `set-${Date.now()}-${idx}`,
      clientSetId: `cset-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      sessionExerciseId: clientExerciseId,
      setNumber: idx + 1,
      setType: isStretch ? SetType.STRETCH : SetType.WORKING,
      weight: isStretch ? null : 20,
      weightUnit: activeSession.weightUnit,
      reps: isStretch ? null : (band?.min ?? 10),
      durationSeconds: isStretch ? (exInfo.recommendedDurationSeconds ?? 45) : null,
      distanceMeters: null,
      rpe: null,
      completed: false,
      completedAt: null,
      isPersonalRecord: false,
      notes: null,
    }));

    const baseSessionEx: SessionExerciseDto = {
      id: clientExerciseId,
      clientExerciseId,
      sessionId: activeSession.clientSessionId,
      exerciseId: exInfo.id,
      replacedExerciseId: null,
      replacedExerciseName: null,
      exerciseNameSnapshot: exInfo.name,
      primaryMuscleSnapshot: exInfo.primaryMuscleGroup,
      exerciseTypeSnapshot: exInfo.exerciseType,
      origin: SessionExerciseOrigin.ADDED,
      status: SessionExerciseStatus.PENDING,
      orderIndex: activeSession.exercises.length,
      plannedSets: defaultSets.length,
      plannedWarmupSets: 0,
      targetRepsMin: isStretch ? null : (band?.min ?? 8),
      targetRepsMax: isStretch ? null : (band?.max ?? 12),
      targetWeight: null,
      targetDurationSeconds: isStretch ? (exInfo.recommendedDurationSeconds ?? 45) : null,
      restSeconds: isStretch
        ? 15
        : resolveRestSeconds(user?.preferences?.defaultRestSeconds ?? 90, sessionGoal),
      alternativeExerciseIds: exInfo.alternativeExerciseIds ?? [],
      notes: null,
      sets: defaultSets,
    };

    const newSessionEx = applyExerciseHistoryToSessionExercise(
      baseSessionEx,
      historySessions,
      exInfo,
      activeSession.weightUnit,
      sessionGoal,
    );

    await persistSessionUpdate({
      ...activeSession,
      exercises: [...activeSession.exercises, newSessionEx],
    });
    setFocusedExercise(clientExerciseId);
  };

  const removeExerciseFromSession = async (clientExerciseId: string) => {
    if (!activeSession) return;
    const filtered = activeSession.exercises
      .filter((e) => e.clientExerciseId !== clientExerciseId)
      .map((e, idx) => ({ ...e, orderIndex: idx }));
    await persistSessionUpdate({ ...activeSession, exercises: filtered });
  };

  const reorderExercise = async (clientExerciseId: string, direction: 'UP' | 'DOWN') => {
    if (!activeSession) return;
    const list = [...activeSession.exercises];
    const idx = list.findIndex((e) => e.clientExerciseId === clientExerciseId);
    if (idx === -1) return;
    const targetIdx = direction === 'UP' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    const [moved] = list.splice(idx, 1);
    if (!moved) return;
    list.splice(targetIdx, 0, moved);
    const reindexed = list.map((e, i) => ({ ...e, orderIndex: i }));
    await persistSessionUpdate({ ...activeSession, exercises: reindexed });
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Rest Timer Controls (Timestamp-based for iOS PWA suspension resilience)
  // ───────────────────────────────────────────────────────────────────────────
  const startRestTimer = async (durationSeconds: number) => {
    if (!activeSession) return;
    const endsAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
    await persistSessionUpdate({
      ...activeSession,
      restTimerEndsAt: endsAt,
      restTimerDurationSec: durationSeconds,
      restTimerPausedRemSec: null,
    });
  };

  const pauseRestTimer = async () => {
    if (!activeSession) return;
    const { remainingSeconds } = computeRemainingRestSeconds(activeSession);
    await persistSessionUpdate({
      ...activeSession,
      restTimerEndsAt: null,
      restTimerPausedRemSec: remainingSeconds,
    });
  };

  const resumeRestTimer = async () => {
    if (!activeSession || !activeSession.restTimerPausedRemSec) return;
    const rem = activeSession.restTimerPausedRemSec;
    await persistSessionUpdate({
      ...activeSession,
      restTimerEndsAt: new Date(Date.now() + rem * 1000).toISOString(),
      restTimerPausedRemSec: null,
    });
  };

  const adjustRestTimer = async (deltaSeconds: number) => {
    if (!activeSession) return;
    const { remainingSeconds, totalSeconds, isPaused } = computeRemainingRestSeconds(activeSession);
    const nextRemaining = Math.max(0, remainingSeconds + deltaSeconds);
    const nextTotal = Math.max(nextRemaining, totalSeconds + deltaSeconds);

    if (isPaused) {
      await persistSessionUpdate({
        ...activeSession,
        restTimerDurationSec: nextTotal,
        restTimerPausedRemSec: nextRemaining,
      });
    } else {
      await persistSessionUpdate({
        ...activeSession,
        restTimerDurationSec: nextTotal,
        restTimerEndsAt:
          nextRemaining > 0 ? new Date(Date.now() + nextRemaining * 1000).toISOString() : null,
        restTimerPausedRemSec: null,
      });
    }
  };

  const skipRestTimer = async () => {
    if (!activeSession) return;
    await persistSessionUpdate({
      ...activeSession,
      restTimerEndsAt: null,
      restTimerDurationSec: null,
      restTimerPausedRemSec: null,
    });
  };

  const pauseSession = async () => {
    if (!activeSession) return;
    const elapsedSec = Math.max(
      activeSession.activeDurationSeconds,
      Math.floor((Date.now() - Date.parse(activeSession.startedAt)) / 1000),
    );
    await persistSessionUpdate({
      ...activeSession,
      status: SessionStatus.PAUSED,
      pausedAt: new Date().toISOString(),
      activeDurationSeconds: elapsedSec,
    });
  };

  const resumeSession = async () => {
    if (!activeSession) return;
    await persistSessionUpdate({
      ...activeSession,
      status: SessionStatus.IN_PROGRESS,
      pausedAt: null,
    });
  };

  const finishSession = async (notes?: string): Promise<WorkoutSessionDto | null> => {
    if (!activeSession) return null;
    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    const nowIso = new Date().toISOString();
    const elapsedSec = Math.max(
      60,
      activeSession.activeDurationSeconds ||
        Math.floor((Date.now() - Date.parse(activeSession.startedAt)) / 1000),
    );

    const finalized = recalculateSessionTotals({
      ...activeSession,
      status: SessionStatus.COMPLETED,
      completedAt: nowIso,
      activeDurationSeconds: elapsedSec,
      notes: notes !== undefined ? notes : activeSession.notes,
      restTimerEndsAt: null,
      restTimerDurationSec: null,
      restTimerPausedRemSec: null,
      version: activeSession.version + 1,
      exercises: activeSession.exercises.map((ex) => ({
        ...ex,
        status: ex.sets.some((s) => s.completed)
          ? SessionExerciseStatus.COMPLETED
          : SessionExerciseStatus.SKIPPED,
      })),
    });

    // The template follows what was actually done, so the next session starts from it. Locally
    // right away; signed-in users get the same update from the server when the session syncs.
    const sourceTemplate = finalized.templateId
      ? [...folders.flatMap((f) => f.templates), ...unfiledTemplates].find(
          (tpl) => tpl.id === finalized.templateId,
        )
      : undefined;
    const templateExercises = sourceTemplate
      ? buildTemplateExercisesFromSession(sourceTemplate, finalized)
      : null;
    if (sourceTemplate && templateExercises) {
      await applyTemplateUpdate(
        sourceTemplate.id,
        { exercises: templateExercises },
        { localOnly: true },
      );
    }

    await saveLocalHistorySession(finalized);
    await saveLocalActiveSession(null);
    await setDismissedSuggestions(finalized.clientSessionId, null);
    await storeFocusedExercise(finalized.clientSessionId, null);
    setActiveSession(null);

    setHistorySessions((prev) => [
      finalized,
      ...prev.filter((s) => s.clientSessionId !== finalized.clientSessionId),
    ]);

    trackEvent('workout_complete', {
      type: finalized.sessionType.toLowerCase(),
      duration_bucket: durationBucket(finalized.activeDurationSeconds),
      sets_bucket: countBucket(finalized.totalSetsCompleted),
    });

    if (isAuthenticated) {
      await enqueueSessionSync(finalized);
      if (navigator.onLine) {
        void flushSyncQueue();
      }
    }
    return finalized;
  };

  const abandonSession = async () => {
    if (!activeSession) return;
    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    const { clientSessionId, id } = activeSession;
    trackEvent('workout_abandon', { type: activeSession.sessionType.toLowerCase() });
    deletedSessionIdsRef.current.add(clientSessionId);
    if (id) deletedSessionIdsRef.current.add(id);

    setActiveSession(null);
    setHistorySessions((prev) =>
      prev.filter((s) => s.clientSessionId !== clientSessionId && s.id !== id),
    );
    await saveLocalActiveSession(null);
    await setDismissedSuggestions(clientSessionId, null);
    await storeFocusedExercise(clientSessionId, null);
    await removeLocalHistorySession(clientSessionId);
    await removeFromSyncQueue(clientSessionId);
    const remaining = await getSyncQueue();
    setPendingSyncCount(isAuthenticated ? remaining.length : 0);

    if (navigator.onLine && isAuthenticated) {
      try {
        await api.sessions.remove(clientSessionId);
      } catch {
        // Ignore if never synced to server
      }
    }
  };

  const updateHistoricalSession = async (updated: WorkoutSessionDto) => {
    const recalculated = recalculateSessionTotals({
      ...updated,
      version: updated.version + 1,
    });
    await saveLocalHistorySession(recalculated);
    setHistorySessions((prev) =>
      prev.map((s) => (s.clientSessionId === recalculated.clientSessionId ? recalculated : s)),
    );
    if (isAuthenticated) {
      await enqueueSessionSync(recalculated, true);
      if (navigator.onLine) {
        void flushSyncQueue(true);
      }
    }
  };

  const deleteHistoricalSession = async (clientSessionId: string) => {
    const target = historySessions.find(
      (s) => s.clientSessionId === clientSessionId || s.id === clientSessionId,
    );
    const resolvedClientId = target?.clientSessionId ?? clientSessionId;
    deletedSessionIdsRef.current.add(clientSessionId);
    deletedSessionIdsRef.current.add(resolvedClientId);
    if (target?.id) deletedSessionIdsRef.current.add(target.id);

    setHistorySessions((prev) =>
      prev.filter(
        (s) =>
          s.clientSessionId !== clientSessionId &&
          s.clientSessionId !== resolvedClientId &&
          s.id !== clientSessionId,
      ),
    );
    await removeLocalHistorySession(resolvedClientId);
    await removeFromSyncQueue(resolvedClientId);
    if (
      activeSession &&
      (activeSession.clientSessionId === resolvedClientId || activeSession.id === clientSessionId)
    ) {
      setActiveSession(null);
      await saveLocalActiveSession(null);
    }

    if (navigator.onLine && isAuthenticated) {
      try {
        await api.sessions.remove(resolvedClientId);
      } catch {
        // Ignore offline error
      }
    }
  };

  const resolveConflict = async (choice: 'KEEP_LOCAL' | 'USE_SERVER') => {
    if (choice === 'KEEP_LOCAL') {
      setConflictServerSession(null);
      await flushSyncQueue(true);
    } else if (conflictServerSession) {
      await removeFromSyncQueue(conflictServerSession.clientSessionId);
      if (conflictServerSession.status === SessionStatus.COMPLETED) {
        await saveLocalHistorySession(conflictServerSession);
        setHistorySessions((prev) => [
          conflictServerSession,
          ...prev.filter((s) => s.clientSessionId !== conflictServerSession.clientSessionId),
        ]);
      } else {
        await saveLocalActiveSession(conflictServerSession);
        setActiveSession(conflictServerSession);
        await setAcknowledgedServerVersion(
          conflictServerSession.clientSessionId,
          conflictServerSession.version,
        );
      }
      setConflictServerSession(null);
      setSyncState('SYNCED');
    }
  };

  return (
    <GymContext.Provider
      value={{
        catalog: localizedCatalog,
        folders: localizedFolders,
        unfiledTemplates: localizedUnfiledTemplates,
        stretchingRoutines: localizedStretchingRoutines,
        activeSession,
        historySessions,
        isOnline,
        syncState,
        pendingSyncCount: pendingSyncCount + pendingWorkoutOpsCount,
        conflictServerSession,
        weightUnit,
        createCustomExercise,
        createFolder,
        renameFolder,
        reorderFolder,
        deleteFolder,
        createTemplate,
        updateTemplate,
        duplicateTemplate,
        moveTemplate,
        deleteTemplate,
        createStretchingRoutine,
        deleteStretchingRoutine,
        startWorkoutFromTemplate,
        startStretchingSession,
        startQuickSession,
        updateSet,
        toggleCompleteSet,
        addSetToExercise,
        removeSetFromExercise,
        substituteExercise,
        addExerciseToSession,
        removeExerciseFromSession,
        reorderExercise,
        startRestTimer,
        pauseRestTimer,
        resumeRestTimer,
        adjustRestTimer,
        skipRestTimer,
        pauseSession,
        resumeSession,
        finishSession,
        abandonSession,
        updateHistoricalSession,
        deleteHistoricalSession,
        flushSyncQueue,
        resolveConflict,
        dismissedSuggestions,
        dismissSuggestion,
        focusedExerciseId,
        setFocusedExercise,
        refreshAllData,
      }}
    >
      {children}
    </GymContext.Provider>
  );
}
