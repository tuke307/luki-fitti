'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { useLocale } from '@/providers/i18n/locale-context';
import { checkUsername, normalizeUsername } from '@luki-fitti/common/utils';
import { socialApi } from '@/lib/social/social-api';

export type UsernameStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available' }
  | { state: 'unavailable'; reason: 'invalid' | 'reserved' | 'blocked' | 'taken' };

const DEBOUNCE_MS = 350;

/**
 * Username input with debounced live availability. `value` is the raw input;
 * `normalized` is what would be submitted.
 */
export function UsernameField({
  value,
  onChange,
  currentUsername,
  cooldownUntil,
  onStatus,
}: {
  value: string;
  onChange: (value: string) => void;
  currentUsername?: string | null;
  cooldownUntil?: string | null;
  onStatus?: (status: UsernameStatus) => void;
}) {
  const { t, bcp47 } = useLocale();
  // Remote availability keyed by the username it belongs to; everything else is derived.
  const [lookup, setLookup] = useState<{ username: string; status: UsernameStatus } | null>(null);
  const debounceRef = useRef<number | null>(null);
  const seq = useRef(0);

  const status: UsernameStatus = useMemo(() => {
    const normalized = normalizeUsername(value);
    const check = checkUsername(normalized);
    if (!normalized || normalized === currentUsername) return { state: 'idle' };
    if (!check.ok) return { state: 'unavailable', reason: check.reason };
    return lookup?.username === normalized ? lookup.status : { state: 'checking' };
  }, [value, currentUsername, lookup]);

  useEffect(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    const n = normalizeUsername(value);
    if (!n || n === currentUsername || !checkUsername(n).ok) return;
    const mySeq = ++seq.current;
    debounceRef.current = window.setTimeout(() => {
      socialApi
        .usernameAvailability(n)
        .then((res) => {
          if (seq.current !== mySeq) return;
          const data = res.data;
          setLookup({
            username: n,
            status: data?.available
              ? { state: 'available' }
              : { state: 'unavailable', reason: data?.reason ?? 'taken' },
          });
        })
        .catch(() => {
          if (seq.current === mySeq) setLookup({ username: n, status: { state: 'idle' } });
        });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [value, currentUsername]);

  useEffect(() => {
    onStatus?.(status);
  }, [status, onStatus]);

  const [nowMs] = useState(() => Date.now());
  // `locked` is evaluated once per mount; the cooldown is checked again server-side.
  const locked = Boolean(cooldownUntil && Date.parse(cooldownUntil) > nowMs);

  const hint = locked
    ? t.social.usernameCooldown.replace(
        '{date}',
        new Date(cooldownUntil!).toLocaleDateString(bcp47, { dateStyle: 'medium' }),
      )
    : status.state === 'checking'
      ? t.social.usernameChecking
      : status.state === 'available'
        ? t.social.usernameAvailable
        : status.state === 'unavailable'
          ? {
              invalid: t.social.usernameInvalid,
              reserved: t.social.usernameReserved,
              blocked: t.social.usernameBlocked,
              taken: t.social.usernameTaken,
            }[status.reason]
          : null;

  return (
    <div>
      <label htmlFor="social-username" className="text-muted-foreground mb-1 block text-[0.8125rem]">
        {t.social.usernameLabel}
      </label>
      <div className="relative">
        <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[0.9375rem]">
          @
        </span>
        <Input
          id="social-username"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={locked}
          className="pl-7"
          data-testid="username-input"
        />
      </div>
      {hint && (
        <p
          className={`mt-1 text-[0.8125rem] ${
            status.state === 'available' ? 'text-success' : 'text-muted-foreground'
          }`}
          data-testid="username-hint"
        >
          {hint}
        </p>
      )}
    </div>
  );
}
