'use client';

import { useEffect, useMemo, useState } from 'react';
import type { MealEntryDto } from '@luki-fitti/common/schemas';
import {
  estimateMaintenance,
  MAINTENANCE_RULES,
  type MaintenanceEstimate,
} from '@luki-fitti/common/utils/client';
import { api } from '@/lib/api';
import { getCachedMealEntries } from '@/lib/offline/offline-store';
import { useHealthActivity } from '@/lib/activity/use-health-activity';
import { useBodyWeight } from '@/lib/body-weight/use-body-weight';
import { useAuth } from '@/providers/auth/auth-context';
import { useGym } from '@/providers/gym/gym-context';
import { buildDay, dayKey, lastDays, shiftDay } from './nutrition-day';

const localMidnight = (key: string) => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};

export interface MaintenanceState {
  estimate: MaintenanceEstimate | null;
  /** Progress towards an estimate while there isn't enough data yet. */
  loggedDays: number;
  weighIns: number;
  /** Apple Health active energy synced for any of the recent days. */
  measuredActivity: boolean;
  loaded: boolean;
}

/**
 * Learned maintenance for the 28 days ending yesterday, using the same per-day intake and burned
 * calories as the food tab. Read-only: loads the window from the API (cache when offline) without
 * touching the meal outbox.
 */
export function useMaintenance(): MaintenanceState {
  const { user, authMode } = useAuth();
  const { historySessions } = useGym();
  const { entries: weighIns } = useBodyWeight();
  const online = authMode === 'AUTHENTICATED';
  const yesterday = shiftDay(dayKey(new Date()), -1);
  const days = useMemo(() => lastDays(yesterday, MAINTENANCE_RULES.windowDays), [yesterday]);
  const activity = useHealthActivity(days[0]!, dayKey(new Date()));
  const [entries, setEntries] = useState<MealEntryDto[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const from = localMidnight(days[0]!).toISOString();
    const to = localMidnight(shiftDay(yesterday, 1)).toISOString();
    void (async () => {
      let next: MealEntryDto[] | null = null;
      if (online) {
        next = await api.nutrition
          .listEntries(from, to)
          .then((res) => res.data ?? null)
          .catch(() => null);
      }
      next ??= await getCachedMealEntries().catch(() => []);
      if (!cancelled) setEntries(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [days, yesterday, online]);

  return useMemo(() => {
    const measuredActivity = activity.days.some(
      (d) => d.activeKcal > 0 && d.day >= shiftDay(yesterday, -6),
    );
    if (!entries) {
      return { estimate: null, loggedDays: 0, weighIns: 0, measuredActivity, loaded: false };
    }
    const fallbackKg = user?.preferences?.bodyWeightKg ?? null;
    const inputs = days.map((key) => {
      const day = buildDay(key, entries, historySessions, weighIns, fallbackKg, activity);
      return { day: key, intakeKcal: day.totals.kcal, burnedKcal: day.burnedKcal };
    });
    const from = localMidnight(days[0]!).getTime();
    const to = localMidnight(shiftDay(yesterday, 1)).getTime();
    return {
      estimate: estimateMaintenance(inputs, weighIns),
      loggedDays: inputs.filter((d) => d.intakeKcal > 0).length,
      weighIns: weighIns.filter((w) => {
        const t = Date.parse(w.measuredAt);
        return t >= from && t < to;
      }).length,
      measuredActivity,
      loaded: true,
    };
  }, [
    entries,
    days,
    yesterday,
    historySessions,
    weighIns,
    activity,
    user?.preferences?.bodyWeightKg,
  ]);
}
