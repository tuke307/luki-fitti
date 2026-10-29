'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MealEntryDto, UpsertMealEntryDto } from '@luki-fitti/common/schemas';
import { api, ApiClientError } from '@/lib/api';
import { useAuth } from '@/providers/auth/auth-context';
import {
  enqueueNutritionChange,
  getCachedMealEntries,
  getNutritionOutbox,
  setCachedMealEntries,
  setNutritionOutbox,
} from '@/lib/offline/offline-store';
import { entryFromPayload } from './nutrition-day';

const HISTORY_DAYS = 35;
const DAY_MS = 24 * 60 * 60 * 1000;

const isOffline = (err: unknown) => err instanceof ApiClientError && err.isNetworkError;
const byEatenAt = (a: MealEntryDto, b: MealEntryDto) =>
  Date.parse(a.eatenAt) - Date.parse(b.eatenAt);

/**
 * Offline-first meal log: reads from the IndexedDB cache immediately, refreshes from the API,
 * and queues upserts/deletes in an outbox when offline. Upserts are idempotent by
 * clientEntryId, so replays are safe.
 */
export function useNutrition() {
  const { authMode } = useAuth();
  const [entries, setEntries] = useState<MealEntryDto[]>([]);
  const [pending, setPending] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const entriesRef = useRef<MealEntryDto[]>([]);
  const flushing = useRef(false);
  const online = authMode === 'AUTHENTICATED';

  const commit = useCallback((next: MealEntryDto[]) => {
    const sorted = [...next].sort(byEatenAt);
    entriesRef.current = sorted;
    setEntries(sorted);
    void setCachedMealEntries(sorted);
  }, []);

  const flush = useCallback(async () => {
    if (!online || flushing.current) return;
    flushing.current = true;
    try {
      const outbox = await getNutritionOutbox();
      const remaining = [...outbox];
      for (const item of outbox) {
        try {
          if (item.kind === 'UPSERT') {
            const res = await api.nutrition.upsertEntry(item.payload);
            if (res.data) {
              const saved = res.data;
              commit([
                ...entriesRef.current.filter((e) => e.clientEntryId !== saved.clientEntryId),
                saved,
              ]);
            }
          } else if (item.id && !item.id.startsWith('local-')) {
            await api.nutrition.deleteEntry(item.id).catch((err: unknown) => {
              if (err instanceof ApiClientError && err.status === 404) return;
              throw err;
            });
          }
          remaining.splice(remaining.indexOf(item), 1);
        } catch (err) {
          if (isOffline(err)) break;
          // Permanently rejected (validation / ownership): drop it rather than retrying forever.
          remaining.splice(remaining.indexOf(item), 1);
        }
      }
      await setNutritionOutbox(remaining);
      setPending(remaining.length);
    } finally {
      flushing.current = false;
    }
  }, [commit, online]);

  const refresh = useCallback(async () => {
    if (!online) return;
    const to = new Date(Date.now() + DAY_MS).toISOString();
    const from = new Date(Date.now() - HISTORY_DAYS * DAY_MS).toISOString();
    try {
      await flush();
      const res = await api.nutrition.listEntries(from, to);
      const outbox = await getNutritionOutbox();
      const pendingUpserts = outbox.flatMap((i) => (i.kind === 'UPSERT' ? [i] : []));
      const pendingDeletes = new Set(
        outbox.filter((i) => i.kind === 'DELETE').map((i) => i.clientEntryId),
      );
      const server = (res.data ?? []).filter(
        (e) =>
          !pendingDeletes.has(e.clientEntryId) &&
          !pendingUpserts.some((p) => p.clientEntryId === e.clientEntryId),
      );
      commit([...server, ...pendingUpserts.map((p) => entryFromPayload(p.payload))]);
    } catch (err) {
      if (!isOffline(err)) throw err;
    }
  }, [commit, flush, online]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [cached, outbox] = await Promise.all([getCachedMealEntries(), getNutritionOutbox()]);
      if (cancelled) return;
      entriesRef.current = cached;
      setEntries(cached);
      setPending(outbox.length);
      setLoaded(true);
      await refresh().catch(() => undefined);
    })();
    const onOnline = () => void flush();
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
    };
  }, [flush, refresh]);

  /** Saves (create or update). Returns true when it reached the server. */
  const save = useCallback(
    async (payload: UpsertMealEntryDto): Promise<boolean> => {
      const existing = entriesRef.current.find((e) => e.clientEntryId === payload.clientEntryId);
      const optimistic = entryFromPayload(payload, existing);
      commit([
        ...entriesRef.current.filter((e) => e.clientEntryId !== payload.clientEntryId),
        optimistic,
      ]);
      if (online) {
        try {
          const res = await api.nutrition.upsertEntry(payload);
          if (res.data) {
            const saved = res.data;
            commit([
              ...entriesRef.current.filter((e) => e.clientEntryId !== saved.clientEntryId),
              saved,
            ]);
          }
          return true;
        } catch (err) {
          if (!isOffline(err)) {
            commit([
              ...entriesRef.current.filter((e) => e.clientEntryId !== payload.clientEntryId),
              ...(existing ? [existing] : []),
            ]);
            throw err;
          }
        }
      }
      await enqueueNutritionChange({
        kind: 'UPSERT',
        clientEntryId: payload.clientEntryId,
        payload,
        queuedAt: new Date().toISOString(),
      });
      setPending((await getNutritionOutbox()).length);
      return false;
    },
    [commit, online],
  );

  const remove = useCallback(
    async (entry: MealEntryDto): Promise<void> => {
      commit(entriesRef.current.filter((e) => e.clientEntryId !== entry.clientEntryId));
      const neverSynced = entry.id.startsWith('local-');
      if (online && !neverSynced) {
        try {
          await api.nutrition.deleteEntry(entry.id);
          return;
        } catch (err) {
          if (!isOffline(err)) throw err;
        }
      }
      if (neverSynced) {
        // Nothing on the server yet: just cancel the queued upsert.
        await setNutritionOutbox(
          (await getNutritionOutbox()).filter((i) => i.clientEntryId !== entry.clientEntryId),
        );
      } else {
        await enqueueNutritionChange({
          kind: 'DELETE',
          clientEntryId: entry.clientEntryId,
          id: entry.id,
          queuedAt: new Date().toISOString(),
        });
      }
      setPending((await getNutritionOutbox()).length);
    },
    [commit, online],
  );

  /** Puts a server-returned entry (e.g. after AI analysis) into the local log. */
  const upsertLocal = useCallback(
    (entry: MealEntryDto) =>
      commit([...entriesRef.current.filter((e) => e.clientEntryId !== entry.clientEntryId), entry]),
    [commit],
  );

  return { entries, pending, loaded, save, remove, upsertLocal, refresh };
}
