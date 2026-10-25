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
  getCachedCatalog,
  getCachedStretchingRoutines,
  getCachedWorkouts,
  getLocalActiveSession,
  getLocalHistorySessions,
  getSyncQueue,
  recalculateSessionTotals,
  removeFromSyncQueue,
  removeLocalHistorySession,
  saveLocalActiveSession,
  saveLocalHistorySession,
  setCachedCatalog,
  setCachedStretchingRoutines,
  setCachedWorkouts,
  substituteExerciseInSession,
  type SyncState,
} from '@/lib/offline/offline-store';
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
  DEFAULT_FOLDER_COLOR,
} from '@luki-fitti/common/utils/client';
import {
  localizeExercise,
  localizeFolder,
  localizeStretchingRoutine,
  localizeTemplate,
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
  addSetToExercise: (clientExerciseId: string, setType?: SetType) => Promise<void>;
  removeSetFromExercise: (clientExerciseId: string, clientSetId: string) => Promise<void>;
  skipExercise: (clientExerciseId: string) => Promise<void>;
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
  const [conflictServerSession, setConflictServerSession] = useState<WorkoutSessionDto | null>(
    null,
  );

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

  const isFlushingRef = useRef(false);
  const flushRequestedRef = useRef(false);
  const flushSyncQueueRef = useRef<(() => Promise<void>) | null>(null);
  const isRefreshingRef = useRef(false);
  const lastRefreshAtRef = useRef<number>(0);
  const syncTimerRef = useRef<number | null>(null);
  const deletedSessionIdsRef = useRef<Set<string>>(new Set());

  const flushSyncQueue = useCallback(
    async (forceOverwrite = false) => {
      if (isFlushingRef.current) {
        flushRequestedRef.current = true;
        return;
      }
      if (!isAuthenticated) {
        setPendingSyncCount(0);
        setSyncState(navigator.onLine ? 'SAVED_LOCALLY' : 'OFFLINE');
        return;
      }

      const queue = await getSyncQueue();
      setPendingSyncCount(queue.length);

      if (queue.length === 0) {
        setSyncState(navigator.onLine ? 'SYNCED' : 'OFFLINE');
        return;
      }

      if (!navigator.onLine) {
        setSyncState('OFFLINE');
        return;
      }

      isFlushingRef.current = true;
      setSyncState('SYNCING');

      try {
        let pending = queue;
        while (pending.length > 0) {
          let hasNewerLocalEdits = false;
          for (const item of pending) {
            if (deletedSessionIdsRef.current.has(item.clientSessionId)) {
              await removeFromSyncQueue(item.clientSessionId);
              continue;
            }

            const payload = forceOverwrite
              ? { ...item.payload, forceOverwrite: true }
              : item.payload;
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
        setSyncState(remaining.length === 0 ? 'SYNCED' : 'SAVED_LOCALLY');
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
    [isAuthenticated],
  );

  useEffect(() => {
    flushSyncQueueRef.current = flushSyncQueue;
  }, [flushSyncQueue]);

  const refreshAllData = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    try {
      const [localCat, localWorkouts, localStretch, localActive, localHistory, queue] =
        await Promise.all([
          getCachedCatalog(),
          getCachedWorkouts(),
          getCachedStretchingRoutines(),
          getLocalActiveSession(),
          getLocalHistorySessions(),
          getSyncQueue(),
        ]);

      setCatalog(localCat);
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

      const [catRes, wkRes, stRes, sessRes, activeRes] = await Promise.all([
        api.exercises.list(),
        api.workouts.getOverview(),
        api.stretching.listRoutines(),
        api.sessions.list({ status: SessionStatus.COMPLETED }),
        api.sessions.getActive(),
      ]);

      if (catRes.success && catRes.data) {
        setCatalog(catRes.data);
        await setCachedCatalog(catRes.data);
      }
      if (wkRes.success && wkRes.data) {
        setFolders(wkRes.data.folders);
        setUnfiledTemplates(wkRes.data.unfiledTemplates);
        await setCachedWorkouts(wkRes.data);
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
  }, [flushSyncQueue, isAuthenticated]);

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
          }),
    };
    const next = [...catalog, custom];
    setCatalog(next);
    await setCachedCatalog(next);
    return custom;
  };

  const createFolder = async (dto: CreateFolderDto) => {
    if (navigator.onLine && isAuthenticated) {
      try {
        const res = await api.workouts.createFolder(dto);
        if (res.success && res.data) {
          const nextFolders = [...folders, res.data];
          setFolders(nextFolders);
          await setCachedWorkouts({ folders: nextFolders, unfiledTemplates });
          return;
        }
      } catch {
        // Offline fallback below
      }
    }
    const newFolder: WorkoutFolderDto = {
      id: `folder-${Date.now()}`,
      userId: user?.id ?? 'local-athlete',
      name: dto.name.trim(),
      color: dto.color ?? DEFAULT_FOLDER_COLOR,
      sortOrder: folders.length,
      templates: [],
    };
    const nextFolders = [...folders, newFolder];
    setFolders(nextFolders);
    await setCachedWorkouts({ folders: nextFolders, unfiledTemplates });
  };

  const renameFolder = async (folderId: string, name: string, color?: string) => {
    if (navigator.onLine && isAuthenticated) {
      try {
        await api.workouts.updateFolder(folderId, { name, ...(color ? { color } : {}) });
      } catch {
        // Offline fallback
      }
    }
    const nextFolders = folders.map((f) =>
      f.id === folderId
        ? { ...f, name: name.trim(), systemKey: null, ...(color ? { color } : {}) }
        : f,
    );
    setFolders(nextFolders);
    await setCachedWorkouts({ folders: nextFolders, unfiledTemplates });
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
    setFolders(reindexed);
    await setCachedWorkouts({ folders: reindexed, unfiledTemplates });

    if (navigator.onLine && isAuthenticated) {
      try {
        await Promise.all(
          reindexed.map((f) => api.workouts.updateFolder(f.id, { sortOrder: f.sortOrder })),
        );
      } catch {
        // Offline fallback already saved
      }
    }
  };

  const deleteFolder = async (folderId: string) => {
    if (navigator.onLine && isAuthenticated) {
      try {
        await api.workouts.deleteFolder(folderId);
      } catch {
        // Offline fallback
      }
    }
    const target = folders.find((f) => f.id === folderId);
    const movedTemplates = (target?.templates ?? []).map((t) => ({ ...t, folderId: null }));
    const nextFolders = folders.filter((f) => f.id !== folderId);
    const nextUnfiled = [...unfiledTemplates, ...movedTemplates];
    setFolders(nextFolders);
    setUnfiledTemplates(nextUnfiled);
    await setCachedWorkouts({ folders: nextFolders, unfiledTemplates: nextUnfiled });
  };

  const createTemplate = async (dto: CreateTemplateDto): Promise<WorkoutTemplateDto> => {
    if (navigator.onLine && isAuthenticated) {
      try {
        const res = await api.workouts.createTemplate(dto);
        if (res.success && res.data) {
          await refreshAllData();
          return res.data;
        }
      } catch {
        // Offline fallback
      }
    }

    const catalogById = new Map(catalog.map((e) => [e.id, e]));
    const nowIso = new Date().toISOString();
    const tplId = `tpl-${Date.now()}`;
    const newTpl: WorkoutTemplateDto = {
      id: tplId,
      userId: user?.id ?? 'local-athlete',
      folderId: dto.folderId ?? null,
      name: dto.name.trim(),
      description: dto.description ?? null,
      estimatedDurationMinutes: dto.estimatedDurationMinutes ?? 60,
      sortOrder: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      exercises: (dto.exercises ?? []).map((ex, idx) => ({
        id: `tple-${Date.now()}-${idx}`,
        templateId: tplId,
        exerciseId: ex.exerciseId,
        orderIndex: idx,
        plannedSets: ex.plannedSets,
        warmupSets: ex.warmupSets ?? 0,
        targetRepsMin: ex.targetRepsMin ?? 8,
        targetRepsMax: ex.targetRepsMax ?? 12,
        targetWeight: ex.targetWeight ?? null,
        weightUnit: ex.weightUnit ?? weightUnit,
        restSeconds: ex.restSeconds ?? 90,
        targetDurationSeconds: ex.targetDurationSeconds ?? null,
        targetDistanceMeters: ex.targetDistanceMeters ?? null,
        notes: ex.notes ?? null,
        alternativeExerciseIds: ex.alternativeExerciseIds ?? [],
        exercise: catalogById.get(ex.exerciseId),
      })),
    };

    if (newTpl.folderId) {
      const nextFolders = folders.map((f) =>
        f.id === newTpl.folderId ? { ...f, templates: [...f.templates, newTpl] } : f,
      );
      setFolders(nextFolders);
      await setCachedWorkouts({ folders: nextFolders, unfiledTemplates });
    } else {
      const nextUnfiled = [...unfiledTemplates, newTpl];
      setUnfiledTemplates(nextUnfiled);
      await setCachedWorkouts({ folders, unfiledTemplates: nextUnfiled });
    }
    return newTpl;
  };

  const updateTemplate = async (templateId: string, dto: UpdateTemplateDto) => {
    if (navigator.onLine && isAuthenticated) {
      try {
        await api.workouts.updateTemplate(templateId, dto);
        await refreshAllData();
        return;
      } catch {
        // Offline fallback
      }
    }

    const catalogById = new Map(catalog.map((e) => [e.id, e]));
    const applyUpdate = (current: WorkoutTemplateDto): WorkoutTemplateDto => {
      if (current.id !== templateId) return current;
      // Editing a starter copy turns it into user content in the language the user sees.
      const editsText =
        dto.name !== undefined || dto.description !== undefined || dto.exercises !== undefined;
      const t =
        current.systemKey && editsText
          ? { ...localizeTemplate(current, locale), systemKey: null }
          : current;
      return {
        ...t,
        name: dto.name ?? t.name,
        description: dto.description !== undefined ? (dto.description ?? null) : t.description,
        folderId: dto.folderId !== undefined ? dto.folderId : t.folderId,
        estimatedDurationMinutes: dto.estimatedDurationMinutes ?? t.estimatedDurationMinutes,
        updatedAt: new Date().toISOString(),
        exercises:
          dto.exercises !== undefined
            ? dto.exercises.map((ex, idx) => ({
                id: ex.id ?? `tple-${Date.now()}-${idx}`,
                templateId,
                exerciseId: ex.exerciseId,
                orderIndex: idx,
                plannedSets: ex.plannedSets,
                warmupSets: ex.warmupSets ?? 0,
                targetRepsMin: ex.targetRepsMin ?? 8,
                targetRepsMax: ex.targetRepsMax ?? 12,
                targetWeight: ex.targetWeight ?? null,
                weightUnit: ex.weightUnit ?? weightUnit,
                restSeconds: ex.restSeconds ?? 90,
                targetDurationSeconds: ex.targetDurationSeconds ?? null,
                targetDistanceMeters: ex.targetDistanceMeters ?? null,
                notes: ex.notes ?? null,
                alternativeExerciseIds: ex.alternativeExerciseIds ?? [],
                exercise: catalogById.get(ex.exerciseId),
              }))
            : t.exercises,
      };
    };

    const nextFolders = folders.map((f) => ({
      ...f,
      templates: f.templates.map(applyUpdate),
    }));
    const nextUnfiled = unfiledTemplates.map(applyUpdate);
    setFolders(nextFolders);
    setUnfiledTemplates(nextUnfiled);
    await setCachedWorkouts({ folders: nextFolders, unfiledTemplates: nextUnfiled });
  };

  const duplicateTemplate = async (templateId: string): Promise<WorkoutTemplateDto | null> => {
    const allTemplates = [
      ...localizedFolders.flatMap((f) => f.templates),
      ...localizedUnfiledTemplates,
    ];
    const source = allTemplates.find((t) => t.id === templateId);
    if (!source) return null;

    if (navigator.onLine && isAuthenticated) {
      try {
        const res = await api.workouts.duplicateTemplate(templateId);
        if (res.success && res.data) {
          await refreshAllData();
          return res.data;
        }
      } catch {
        // Offline fallback below
      }
    }

    const catalogById = new Map(catalog.map((e) => [e.id, e]));
    const nowIso = new Date().toISOString();
    const tplId = `tpl-${Date.now()}`;
    const newTpl: WorkoutTemplateDto = {
      id: tplId,
      userId: user?.id ?? 'local-athlete',
      folderId: source.folderId,
      name: `${source.name} (Copy)`,
      description: source.description,
      estimatedDurationMinutes: source.estimatedDurationMinutes ?? 60,
      sortOrder: source.sortOrder + 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      exercises: source.exercises.map((ex, idx) => ({
        id: `tple-${Date.now()}-${idx}`,
        templateId: tplId,
        exerciseId: ex.exerciseId,
        orderIndex: idx,
        plannedSets: ex.plannedSets,
        warmupSets: ex.warmupSets,
        targetRepsMin: ex.targetRepsMin,
        targetRepsMax: ex.targetRepsMax,
        targetWeight: ex.targetWeight,
        weightUnit: ex.weightUnit,
        restSeconds: ex.restSeconds,
        targetDurationSeconds: ex.targetDurationSeconds,
        targetDistanceMeters: ex.targetDistanceMeters,
        notes: ex.notes,
        alternativeExerciseIds: ex.alternativeExerciseIds,
        exercise: ex.exercise ?? catalogById.get(ex.exerciseId),
      })),
    };

    if (source.folderId) {
      const nextFolders = folders.map((f) => {
        if (f.id !== source.folderId) return f;
        const copyList = [...f.templates];
        const sourceIdx = copyList.findIndex((t) => t.id === templateId);
        if (sourceIdx >= 0) {
          copyList.splice(sourceIdx + 1, 0, newTpl);
        } else {
          copyList.push(newTpl);
        }
        return {
          ...f,
          templates: copyList.map((t, i) => ({ ...t, sortOrder: i })),
        };
      });
      setFolders(nextFolders);
      await setCachedWorkouts({ folders: nextFolders, unfiledTemplates });
    } else {
      const copyList = [...unfiledTemplates];
      const sourceIdx = copyList.findIndex((t) => t.id === templateId);
      if (sourceIdx >= 0) {
        copyList.splice(sourceIdx + 1, 0, newTpl);
      } else {
        copyList.push(newTpl);
      }
      const nextUnfiled = copyList.map((t, i) => ({ ...t, sortOrder: i }));
      setUnfiledTemplates(nextUnfiled);
      await setCachedWorkouts({ folders, unfiledTemplates: nextUnfiled });
    }

    return newTpl;
  };

  const moveTemplate = async (templateId: string, targetFolderId: string | null) => {
    if (navigator.onLine && isAuthenticated) {
      try {
        await api.workouts.moveTemplate(templateId, targetFolderId);
      } catch {
        // Offline fallback
      }
    }

    const allTemplates = [...folders.flatMap((f) => f.templates), ...unfiledTemplates];
    const tpl = allTemplates.find((t) => t.id === templateId);
    if (!tpl) return;

    const updatedTpl: WorkoutTemplateDto = { ...tpl, folderId: targetFolderId };
    const nextFolders = folders.map((f) => {
      const without = f.templates.filter((t) => t.id !== templateId);
      return f.id === targetFolderId
        ? { ...f, templates: [...without, updatedTpl] }
        : { ...f, templates: without };
    });
    const nextUnfiled =
      targetFolderId === null
        ? [...unfiledTemplates.filter((t) => t.id !== templateId), updatedTpl]
        : unfiledTemplates.filter((t) => t.id !== templateId);

    setFolders(nextFolders);
    setUnfiledTemplates(nextUnfiled);
    await setCachedWorkouts({ folders: nextFolders, unfiledTemplates: nextUnfiled });
  };

  const deleteTemplate = async (templateId: string) => {
    if (navigator.onLine && isAuthenticated) {
      try {
        await api.workouts.deleteTemplate(templateId);
      } catch {
        // Offline fallback
      }
    }
    const nextFolders = folders.map((f) => ({
      ...f,
      templates: f.templates.filter((t) => t.id !== templateId),
    }));
    const nextUnfiled = unfiledTemplates.filter((t) => t.id !== templateId);
    setFolders(nextFolders);
    setUnfiledTemplates(nextUnfiled);
    await setCachedWorkouts({ folders: nextFolders, unfiledTemplates: nextUnfiled });
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
      return {
        ...ex,
        sets: ex.sets.map((s) => (s.clientSetId === clientSetId ? { ...s, ...patch } : s)),
      };
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
      const anyCompleted = updatedSets.some((s) => s.completed);
      const nextStatus = allCompleted
        ? SessionExerciseStatus.COMPLETED
        : anyCompleted
          ? SessionExerciseStatus.IN_PROGRESS
          : ex.status === SessionExerciseStatus.SKIPPED
            ? SessionExerciseStatus.SKIPPED
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

  const addSetToExercise = async (clientExerciseId: string, setType: SetType = SetType.WORKING) => {
    if (!activeSession) return;
    const nextExercises = activeSession.exercises.map((ex) => {
      if (ex.clientExerciseId !== clientExerciseId) return ex;
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

  const skipExercise = async (clientExerciseId: string) => {
    if (!activeSession) return;
    const nextExercises = activeSession.exercises.map((ex) =>
      ex.clientExerciseId === clientExerciseId
        ? {
            ...ex,
            status:
              ex.status === SessionExerciseStatus.SKIPPED
                ? SessionExerciseStatus.PENDING
                : SessionExerciseStatus.SKIPPED,
          }
        : ex,
    );
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

    const defaultSets: SessionSetDto[] = Array.from({ length: isStretch ? 2 : 3 }, (_, idx) => ({
      id: `set-${Date.now()}-${idx}`,
      clientSetId: `cset-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      sessionExerciseId: clientExerciseId,
      setNumber: idx + 1,
      setType: isStretch ? SetType.STRETCH : SetType.WORKING,
      weight: isStretch ? null : 20,
      weightUnit: activeSession.weightUnit,
      reps: isStretch ? null : 10,
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
      targetRepsMin: isStretch ? null : 8,
      targetRepsMax: isStretch ? null : 12,
      targetWeight: null,
      targetDurationSeconds: isStretch ? (exInfo.recommendedDurationSeconds ?? 45) : null,
      restSeconds: isStretch ? 15 : (user?.preferences?.defaultRestSeconds ?? 90),
      alternativeExerciseIds: exInfo.alternativeExerciseIds ?? [],
      notes: null,
      sets: defaultSets,
    };

    const newSessionEx = applyExerciseHistoryToSessionExercise(
      baseSessionEx,
      historySessions,
      exInfo,
      activeSession.weightUnit,
    );

    await persistSessionUpdate({
      ...activeSession,
      exercises: [...activeSession.exercises, newSessionEx],
    });
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

    await saveLocalHistorySession(finalized);
    await saveLocalActiveSession(null);
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
        pendingSyncCount,
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
        skipExercise,
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
        refreshAllData,
      }}
    >
      {children}
    </GymContext.Provider>
  );
}
