import { ApiClientError } from '@/lib/api';
import type { TranslationDictionary } from '@/lib/i18n';

/** Maps AI endpoint failures to calm, localized copy (server messages are English-only). */
export function aiErrorMessage(err: unknown, t: TranslationDictionary): string {
  if (err instanceof ApiClientError) {
    if (err.isNetworkError) return t.aiBuilder.offline;
    if (err.status === 429) return t.aiErrors.quota;
    if (err.status === 403) return t.aiErrors.disabled;
    if (err.status === 400 && err.message) return err.message;
  }
  return t.aiErrors.unavailable;
}
