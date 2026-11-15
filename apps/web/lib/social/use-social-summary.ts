'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SocialSummaryDto } from '@luki-fitti/common/schemas';
import { socialApi } from './social-api';

const SUMMARY_POLL_MS = 60_000;

/**
 * Shared `/social/summary` polling for the hub, the tab badge and the home
 * card: fetch on mount, on focus/visibility and every 60 s while visible.
 * A failed fetch keeps the last summary.
 */
export function useSocialSummary(enabled: boolean) {
  const [summary, setSummary] = useState<SocialSummaryDto | null>(null);
  const [prevEnabled, setPrevEnabled] = useState(enabled);
  if (enabled !== prevEnabled) {
    setPrevEnabled(enabled);
    if (!enabled) setSummary(null);
  }

  const refresh = useCallback(async () => {
    try {
      const res = await socialApi.summary();
      if (res.data) setSummary(res.data);
    } catch {
      /* keep the last summary */
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await socialApi.summary();
        if (!cancelled && res.data) setSummary(res.data);
      } catch {
        /* keep last */
      }
    };
    void poll();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void poll();
    }, SUMMARY_POLL_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    window.addEventListener('focus', onVis);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('focus', onVis);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled]);

  return { summary, refresh };
}
