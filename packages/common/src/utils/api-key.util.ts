/**
 * Personal API key (`lf_pat_<id>_<secret>`) format helpers — browser-safe, no
 * node:crypto. Generation, hashing and verification live on the API side
 * (`apps/api/src/modules/api-keys/api-key.crypto.ts`).
 */

export const API_KEY_PREFIX = 'lf_pat_';

/**
 * `lf_pat_` + 8-char base32-ish public id (`[a-z2-7]`) + `_` + 43-char
 * base64url secret (32 random bytes).
 */
export const API_KEY_PATTERN = /^lf_pat_([a-z2-7]{8})_([A-Za-z0-9_-]{43})$/;

/** Splits a raw key into its lookup id and secret; null when malformed. */
export function parseApiKey(raw: string): { id: string; secret: string } | null {
  const match = API_KEY_PATTERN.exec(raw.trim());
  if (!match) return null;
  return { id: match[1]!, secret: match[2]! };
}

/** The non-secret prefix shown in the UI, e.g. `lf_pat_9f3k2m7q`. */
export function apiKeyDisplayPrefix(id: string): string {
  return `${API_KEY_PREFIX}${id}`;
}

/** Hard cap on simultaneously active keys per user. */
export const API_KEY_MAX_ACTIVE = 10;

/** Selectable lifetimes in days; `null` = no expiry (default is 90). */
export const API_KEY_EXPIRY_DAYS = [30, 90, 365] as const;
