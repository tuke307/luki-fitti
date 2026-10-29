'use client';

import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import type { ApiResponse } from '@luki-fitti/common/api/responses/api.response';

interface ResourceState<T> {
  key: string | null;
  data: T | null;
  error: string | null;
}

/**
 * Fetch helper for admin pages. `key` identifies the request (e.g. search + page); changing it
 * refetches. Previous data stays visible while a new request is in flight.
 */
export function useAdminResource<T>(fetcher: () => Promise<ApiResponse<T>>, key = 'default') {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<ResourceState<T>>({ key: null, data: null, error: null });
  const requestKey = `${key}#${nonce}`;
  const fetchLatest = useEffectEvent(() => fetcher());

  useEffect(() => {
    let cancelled = false;
    fetchLatest()
      .then((res) => {
        if (!cancelled) setState({ key: requestKey, data: res.data ?? null, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState((s) => ({
            key: requestKey,
            data: s.data,
            error: err instanceof Error ? err.message : 'error',
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  const setData = useCallback((update: T | null | ((current: T | null) => T | null)) => {
    setState((s) => ({
      ...s,
      data: typeof update === 'function' ? (update as (c: T | null) => T | null)(s.data) : update,
    }));
  }, []);

  return {
    data: state.data,
    setData,
    error: state.key === requestKey ? state.error : null,
    loading: state.key !== requestKey,
    reload: useCallback(() => setNonce((n) => n + 1), []),
  };
}
