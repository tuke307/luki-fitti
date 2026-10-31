import { ApiClientError } from '@/lib/api/client';
import type { TranslationDictionary } from '@/lib/i18n/types';

/** Maps a failed key save/remove to a localized, user-safe message (never echoes the key). */
export function aiKeyErrorMessage(err: unknown, t: TranslationDictionary['aiKey']): string {
  if (err instanceof ApiClientError) {
    if (err.status === 400) return t.rejected;
    if (err.status === 429) return t.rateLimited;
    if (err.status === 503) return t.unavailable;
  }
  return t.error;
}
