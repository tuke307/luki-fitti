/**
 * Social profile rules shared by API, web and (mirrored) iOS.
 * `emailLookupHash` uses `crypto.subtle` from the platform global, so this file stays
 * browser-safe — never import `node:crypto` here (server-only helpers live in
 * `crypto.util.ts`, exported via `@luki-fitti/common/utils/crypto`).
 */

export const HANDLE_REGEX = /^[a-z0-9_]{3,20}$/;

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 20;

/** Days between handle changes; the very first handle is always allowed. */
export const HANDLE_CHANGE_COOLDOWN_DAYS = 30;

/** Handles that would collide with product routes or impersonate the service. */
export const RESERVED_HANDLES = new Set([
  'admin',
  'administrator',
  'api',
  'app',
  'help',
  'invite',
  'luki',
  'lukifitti',
  'luki_fitti',
  'mod',
  'moderator',
  'official',
  'root',
  'settings',
  'social',
  'support',
  'system',
  'team',
  'www',
]);

/**
 * Small EN/DE blocklist, matched as substring on the normalised handle.
 * Deliberately short — this is a courtesy filter, not a classifier.
 */
const BLOCKED_HANDLE_SUBSTRINGS = [
  'adolf',
  'arsch',
  'bitch',
  'cock',
  'cunt',
  'dick',
  'faggot',
  'fotze',
  'fuck',
  'hitler',
  'hurensohn',
  'nazi',
  'nigga',
  'nigger',
  'pimmel',
  'porn',
  'scheiss',
  'schlampe',
  'schwanz',
  'sex',
  'shit',
  'slut',
  'tits',
  'whore',
  'wichser',
];

/** Lowercases and trims; returns the canonical stored form of a handle. */
export function normalizeHandle(input: string): string {
  return input.trim().toLowerCase();
}

export type HandleCheck =
  { ok: true; handle: string } | { ok: false; reason: 'invalid' | 'reserved' | 'blocked' };

/** Format + reserved + profanity check. Uniqueness is a DB concern, checked separately. */
export function checkHandle(input: string): HandleCheck {
  const handle = normalizeHandle(input);
  if (!HANDLE_REGEX.test(handle)) return { ok: false, reason: 'invalid' };
  if (RESERVED_HANDLES.has(handle)) return { ok: false, reason: 'reserved' };
  if (BLOCKED_HANDLE_SUBSTRINGS.some((bad) => handle.includes(bad))) {
    return { ok: false, reason: 'blocked' };
  }
  return { ok: true, handle };
}

/** Convenience wrapper for callers that only need the boolean. */
export function isHandleAllowed(input: string): boolean {
  return checkHandle(input).ok;
}

/** Earliest date a user who last changed at `changedAt` may pick a new handle. */
export function nextHandleChangeAt(changedAt: Date | null): Date | null {
  if (!changedAt) return null;
  return new Date(changedAt.getTime() + HANDLE_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
}

/** Canonical form used for contact matching: trim + lowercase, UTF-8. */
export function normalizeEmailForLookup(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * SHA-256 hex of the normalised email. Async because it uses WebCrypto
 * (`globalThis.crypto.subtle`), which is available in Node ≥ 20 and every modern
 * browser — identical output on both, pinned by `EMAIL_LOOKUP_TEST_VECTOR`.
 * The API stores this value only; raw contact hashes are never persisted or logged.
 */
export async function emailLookupHash(email: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(normalizeEmailForLookup(email)),
  );
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Shared test vector: every platform must produce this digest for the normalised
 * input (Swift `CryptoKit.SHA256`, web `crypto.subtle`, Node).
 */
export const EMAIL_LOOKUP_TEST_VECTOR = {
  input: ' Foo@Example.COM ',
  normalized: 'foo@example.com',
  sha256Hex: '321ba197033e81286fedb719d60d4ed5cecaed170733cb4a92013811afc0e3b6',
} as const;

/**
 * Known Web Push services. `registerDevice` stores the endpoint verbatim and the
 * sender POSTs to it, so anything off this list would be an SSRF primitive.
 * Entries prefixed `*.` match any subdomain (and the bare host).
 */
export const WEB_PUSH_ALLOWED_HOSTS = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  '*.push.apple.com',
  '*.notify.windows.com',
] as const;

export function isWebPushEndpointAllowed(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return WEB_PUSH_ALLOWED_HOSTS.some((entry) => {
    if (entry.startsWith('*.')) {
      const base = entry.slice(2);
      return host === base || host.endsWith(`.${base}`);
    }
    return host === entry;
  });
}
