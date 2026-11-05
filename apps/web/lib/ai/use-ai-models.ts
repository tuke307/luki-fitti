'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AiModelsDto } from '@luki-fitti/common/schemas';
import { api } from '@/lib/api';

type State = { data: AiModelsDto | null; error: boolean; loading: boolean };

/** Eligible models per AI skill for the signed-in user (`GET /ai/models`). */
export function useAiModels(enabled = true) {
  const [state, setState] = useState<State>({ data: null, error: false, loading: enabled });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api.ai
      .models()
      .then(
        (res) =>
          !cancelled && setState({ data: res.data ?? null, error: !res.data, loading: false }),
      )
      .catch(() => !cancelled && setState((s) => ({ ...s, error: true, loading: false })));
    return () => {
      cancelled = true;
    };
  }, [enabled, nonce]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    setNonce((n) => n + 1);
  }, []);

  return { ...state, reload };
}
