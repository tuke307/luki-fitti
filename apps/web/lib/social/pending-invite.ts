import { isValidInviteToken } from './invite-token';

const PENDING_INVITE_KEY = 'luki.social.pendingInvite';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The invite token survives sign-up, email verification (which opens in a new tab) and
 * sign-in, so it lives in localStorage instead of sessionStorage.
 */
export function setPendingInvite(token: string, storage: StorageLike | null = defaultStorage()) {
  if (storage && isValidInviteToken(token)) storage.setItem(PENDING_INVITE_KEY, token);
}

export function getPendingInvite(storage: StorageLike | null = defaultStorage()): string | null {
  const token = storage?.getItem(PENDING_INVITE_KEY) ?? null;
  return token && isValidInviteToken(token) ? token : null;
}

export function clearPendingInvite(storage: StorageLike | null = defaultStorage()) {
  storage?.removeItem(PENDING_INVITE_KEY);
}

/** Where to continue after authentication: the pending invite page, else `fallback`. */
export function postAuthPath(fallback = '/', storage: StorageLike | null = defaultStorage()) {
  const token = getPendingInvite(storage);
  return token ? `/invite/${token}` : fallback;
}
