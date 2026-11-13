'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { useLocale } from '@/providers/i18n/locale-context';
import { checkHandle, normalizeHandle } from '@luki-fitti/common/utils';
import { socialApi } from '@/lib/social/social-api';

export type HandleStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available' }
  | { state: 'unavailable'; reason: 'invalid' | 'reserved' | 'blocked' | 'taken' };

const DEBOUNCE_MS = 350;

/**
 * Handle input with debounced live availability. `value` is the raw input;
 * `normalized` is what would be submitted.
 */
export function HandleField({
  value,
  onChange,
  currentHandle,
  cooldownUntil,
  onStatus,
}: {
  value: string;
  onChange: (value: string) => void;
  currentHandle?: string | null;
  cooldownUntil?: string | null;
  onStatus?: (status: HandleStatus) => void;
}) {
  const { t, bcp47 } = useLocale();
  // Remote availability keyed by the handle it belongs to; everything else is derived.
  const [lookup, setLookup] = useState<{ handle: string; status: HandleStatus } | null>(null);
  const debounceRef = useRef<number | null>(null);
  const seq = useRef(0);

  const status: HandleStatus = useMemo(() => {
    const normalized = normalizeHandle(value);
    const check = checkHandle(normalized);
    if (!normalized || normalized === currentHandle) return { state: 'idle' };
    if (!check.ok) return { state: 'unavailable', reason: check.reason };
    return lookup?.handle === normalized ? lookup.status : { state: 'checking' };
  }, [value, currentHandle, lookup]);

  useEffect(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    const n = normalizeHandle(value);
    if (!n || n === currentHandle || !checkHandle(n).ok) return;
    const mySeq = ++seq.current;
    debounceRef.current = window.setTimeout(() => {
      socialApi
        .handleAvailability(n)
        .then((res) => {
          if (seq.current !== mySeq) return;
          const data = res.data;
          setLookup({
            handle: n,
            status: data?.available
              ? { state: 'available' }
              : { state: 'unavailable', reason: data?.reason ?? 'taken' },
          });
        })
        .catch(() => {
          if (seq.current === mySeq) setLookup({ handle: n, status: { state: 'idle' } });
        });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [value, currentHandle]);

  useEffect(() => {
    onStatus?.(status);
  }, [status, onStatus]);

  const [nowMs] = useState(() => Date.now());
  // `locked` is evaluated once per mount; the cooldown is checked again server-side.
  const locked = Boolean(cooldownUntil && Date.parse(cooldownUntil) > nowMs);

  const hint = locked
    ? t.social.handleCooldown.replace(
        '{date}',
        new Date(cooldownUntil!).toLocaleDateString(bcp47, { dateStyle: 'medium' }),
      )
    : status.state === 'checking'
      ? t.social.handleChecking
      : status.state === 'available'
        ? t.social.handleAvailable
        : status.state === 'unavailable'
          ? {
              invalid: t.social.handleInvalid,
              reserved: t.social.handleReserved,
              blocked: t.social.handleBlocked,
              taken: t.social.handleTaken,
            }[status.reason]
          : null;

  return (
    <div>
      <label htmlFor="social-handle" className="text-muted-foreground mb-1 block text-[0.8125rem]">
        {t.social.handleLabel}
      </label>
      <div className="relative">
        <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[0.9375rem]">
          @
        </span>
        <Input
          id="social-handle"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={locked}
          className="pl-7"
          data-testid="handle-input"
        />
      </div>
      {hint && (
        <p
          className={`mt-1 text-[0.8125rem] ${
            status.state === 'available' ? 'text-success' : 'text-muted-foreground'
          }`}
          data-testid="handle-hint"
        >
          {hint}
        </p>
      )}
    </div>
  );
}
