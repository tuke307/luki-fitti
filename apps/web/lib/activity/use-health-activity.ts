'use client';

import { useEffect, useMemo, useState } from 'react';
import type { HealthDailyEnergyDto, HealthWorkoutDto } from '@luki-fitti/common/schemas';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth/auth-context';
import type { DayActivity } from '@/lib/nutrition/nutrition-day';

const localMidnight = (key: string) => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};

/**
 * Apple Health activity (synced by the iOS app) for the local days [fromKey, toKey]. Loaded windows
 * are merged, so moving between weeks keeps already-fetched days. Read-only and online-only:
 * without a connection the food tab falls back to LukiFitti's own estimates.
 */
export function useHealthActivity(fromKey: string, toKey: string): DayActivity {
  const { authMode } = useAuth();
  const online = authMode === 'AUTHENTICATED';
  const [days, setDays] = useState<Map<string, HealthDailyEnergyDto>>(() => new Map());
  const [workouts, setWorkouts] = useState<Map<string, HealthWorkoutDto>>(() => new Map());

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    const from = localMidnight(fromKey);
    const to = localMidnight(toKey);
    to.setDate(to.getDate() + 1);
    to.setMilliseconds(-1);
    void api.activity
      .list({ from: from.toISOString(), to: to.toISOString() })
      .then((res) => {
        if (cancelled || !res.data) return;
        const data = res.data;
        setDays((prev) => {
          const next = new Map(prev);
          for (const d of data.days) next.set(d.day, d);
          return next;
        });
        setWorkouts((prev) => {
          // The server is authoritative for the window: drop workouts deleted in Apple Health.
          const next = new Map(
            [...prev].filter(([, w]) => {
              const t = Date.parse(w.startedAt);
              return t < from.getTime() || t > to.getTime();
            }),
          );
          for (const w of data.workouts) next.set(w.id, w);
          return next;
        });
      })
      .catch(() => {
        // Offline or not synced yet: burned calories fall back to session estimates.
      });
    return () => {
      cancelled = true;
    };
  }, [online, fromKey, toKey]);

  return useMemo(
    () =>
      online
        ? { days: [...days.values()], workouts: [...workouts.values()] }
        : { days: [], workouts: [] },
    [online, days, workouts],
  );
}
