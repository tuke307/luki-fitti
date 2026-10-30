'use client';

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { BodyWeightEntryDto, UpsertBodyWeightEntryDto } from '@luki-fitti/common/schemas';
import { latestWeighIn, sortWeighIns } from '@luki-fitti/common/utils/client';
import { api, ApiClientError } from '@/lib/api';
import { useAuth } from '@/providers/auth/auth-context';
import {
  enqueueBodyWeightChange,
  getBodyWeightOutbox,
  getCachedBodyWeightEntries,
  setBodyWeightOutbox,
  setCachedBodyWeightEntries,
} from '@/lib/offline/offline-store';
import { weightEntryFromPayload } from './body-weight';

interface BodyWeightSnapshot {
  entries: BodyWeightEntryDto[];
  pending: number;
  loaded: boolean;
}

const EMPTY: BodyWeightSnapshot = { entries: [], pending: 0, loaded: false };

// One shared store: the home card, the profile weight section, the body card and the food tab all
// read the same weigh-ins, so a log in one place shows up everywhere without refetching.
let snapshot: BodyWeightSnapshot = EMPTY;
const listeners = new Set<() => void>();
let initPromise: Promise<void> | null = null;
let flushing = false;
let onlineListenerAttached = false;
/** Called after a write reached the server (the server keeps preferences.bodyWeightKg current). */
let afterServerWrite: (() => void) | null = null;

const isOffline = (err: unknown) => err instanceof ApiClientError && err.isNetworkError;

function emit(next: Partial<BodyWeightSnapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => EMPTY;

function commit(next: BodyWeightEntryDto[]) {
  const sorted = sortWeighIns(next);
  emit({ entries: sorted });
  void setCachedBodyWeightEntries(sorted);
}

const without = (clientEntryId: string) =>
  snapshot.entries.filter((e) => e.clientEntryId !== clientEntryId);

async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  let wroteToServer = false;
  try {
    const outbox = await getBodyWeightOutbox();
    const remaining = [...outbox];
    for (const item of outbox) {
      try {
        if (item.kind === 'UPSERT') {
          const res = await api.bodyWeight.upsertEntry(item.payload);
          if (res.data) commit([...without(res.data.clientEntryId), res.data]);
        } else if (item.id && !item.id.startsWith('local-')) {
          await api.bodyWeight.deleteEntry(item.id).catch((err: unknown) => {
            if (err instanceof ApiClientError && err.status === 404) return;
            throw err;
          });
        }
        wroteToServer = true;
        remaining.splice(remaining.indexOf(item), 1);
      } catch (err) {
        if (isOffline(err)) break;
        // Permanently rejected (validation / ownership): drop it rather than retrying forever.
        remaining.splice(remaining.indexOf(item), 1);
      }
    }
    await setBodyWeightOutbox(remaining);
    emit({ pending: remaining.length });
  } finally {
    flushing = false;
    if (wroteToServer) afterServerWrite?.();
  }
}

async function refresh(): Promise<void> {
  try {
    await flush();
    const res = await api.bodyWeight.listEntries();
    const outbox = await getBodyWeightOutbox();
    const pendingUpserts = outbox.flatMap((i) => (i.kind === 'UPSERT' ? [i] : []));
    const pendingIds = new Set(outbox.map((i) => i.clientEntryId));
    const server = (res.data ?? []).filter((e) => !pendingIds.has(e.clientEntryId));
    commit([...server, ...pendingUpserts.map((p) => weightEntryFromPayload(p.payload))]);
  } catch (err) {
    if (!isOffline(err)) throw err;
  }
}

function init(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const [cached, outbox] = await Promise.all([
      getCachedBodyWeightEntries(),
      getBodyWeightOutbox(),
    ]);
    // Only fill from cache if nothing newer was committed meanwhile.
    if (!snapshot.loaded) emit({ entries: sortWeighIns(cached), pending: outbox.length });
    emit({ loaded: true });
    await refresh().catch(() => undefined);
  })();
  if (!onlineListenerAttached && typeof window !== 'undefined') {
    onlineListenerAttached = true;
    window.addEventListener('online', () => {
      if (initPromise) void flush();
    });
  }
  return initPromise;
}

function reset() {
  initPromise = null;
  if (snapshot !== EMPTY) emit(EMPTY);
}

/** Saves (create or update by clientEntryId). Returns true when it reached the server. */
async function save(payload: UpsertBodyWeightEntryDto): Promise<boolean> {
  const existing = snapshot.entries.find((e) => e.clientEntryId === payload.clientEntryId);
  commit([...without(payload.clientEntryId), weightEntryFromPayload(payload, existing)]);
  try {
    const res = await api.bodyWeight.upsertEntry(payload);
    if (res.data) commit([...without(res.data.clientEntryId), res.data]);
    afterServerWrite?.();
    return true;
  } catch (err) {
    if (!isOffline(err)) {
      commit([...without(payload.clientEntryId), ...(existing ? [existing] : [])]);
      throw err;
    }
  }
  await enqueueBodyWeightChange({
    kind: 'UPSERT',
    clientEntryId: payload.clientEntryId,
    payload,
    queuedAt: new Date().toISOString(),
  });
  emit({ pending: (await getBodyWeightOutbox()).length });
  return false;
}

/** Deletes a weigh-in. Returns true when it reached the server (or never existed there). */
async function remove(entry: BodyWeightEntryDto): Promise<boolean> {
  commit(without(entry.clientEntryId));
  const neverSynced = entry.id.startsWith('local-');
  if (!neverSynced) {
    try {
      await api.bodyWeight.deleteEntry(entry.id).catch((err: unknown) => {
        if (err instanceof ApiClientError && err.status === 404) return;
        throw err;
      });
      afterServerWrite?.();
      return true;
    } catch (err) {
      if (!isOffline(err)) {
        commit([...snapshot.entries, entry]);
        throw err;
      }
    }
    await enqueueBodyWeightChange({
      kind: 'DELETE',
      clientEntryId: entry.clientEntryId,
      id: entry.id,
      queuedAt: new Date().toISOString(),
    });
  } else {
    // Nothing on the server yet: just cancel the queued upsert.
    await setBodyWeightOutbox(
      (await getBodyWeightOutbox()).filter((i) => i.clientEntryId !== entry.clientEntryId),
    );
  }
  emit({ pending: (await getBodyWeightOutbox()).length });
  return neverSynced;
}

/**
 * Offline-first weigh-in history for signed-in users: reads from the IndexedDB cache immediately,
 * refreshes from the API and queues upserts/deletes while offline. Guests get an empty history
 * (weigh-ins are an account feature).
 */
export function useBodyWeight() {
  const { authMode, refreshUser } = useAuth();
  const enabled = authMode === 'AUTHENTICATED';
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (!enabled) {
      reset();
      return;
    }
    afterServerWrite = () => void refreshUser();
    void init();
  }, [enabled, refreshUser]);

  const guardedSave = useCallback(
    (payload: UpsertBodyWeightEntryDto) => (enabled ? save(payload) : Promise.resolve(false)),
    [enabled],
  );
  const guardedRemove = useCallback(
    (entry: BodyWeightEntryDto) => (enabled ? remove(entry) : Promise.resolve(false)),
    [enabled],
  );
  const guardedRefresh = useCallback(() => (enabled ? refresh() : Promise.resolve()), [enabled]);

  const entries = enabled ? state.entries : EMPTY.entries;
  const latest = useMemo(() => latestWeighIn(entries), [entries]);

  return {
    enabled,
    entries,
    latest,
    pending: enabled ? state.pending : 0,
    loaded: enabled && state.loaded,
    save: guardedSave,
    remove: guardedRemove,
    refresh: guardedRefresh,
  };
}
