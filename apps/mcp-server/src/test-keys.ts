import { randomBytes } from 'node:crypto';
import { API_KEY_PREFIX } from '@luki-fitti/common/utils';

/** Test helpers for `lf_pat_…` keys — the real generation lives in apps/api. */
export const generateApiKeySecret = (): string =>
  randomBytes(32).toString('base64url').slice(0, 43);

export const formatApiKey = (id: string, secret: string): string =>
  `${API_KEY_PREFIX}${id}_${secret}`;
