import type { TranslationDictionary } from '@/lib/i18n/types';
import { ApiClientError } from './client';

type ErrorsDict = TranslationDictionary['errors'];

/**
 * User-facing message for an API failure: machine codes and status ranges map to
 * localized copy; raw server bodies (HTML pages, JSON blobs) never surface.
 */
export function apiErrorMessage(err: unknown, e: ErrorsDict): string {
  if (err instanceof ApiClientError) {
    if (err.isNetworkError) return e.network;
    if (err.code && err.code in e.codes) {
      return e.codes[err.code as keyof typeof e.codes];
    }
    if (err.status === 429) return e.rateLimited;
    if (err.status >= 500) return e.server;
    if (
      err.message.length > 0 &&
      err.message.length <= 200 &&
      !err.message.startsWith('{') &&
      !err.message.startsWith('<') &&
      !/^Request failed/.test(err.message)
    ) {
      return err.message;
    }
    return e.generic;
  }
  return e.generic;
}
