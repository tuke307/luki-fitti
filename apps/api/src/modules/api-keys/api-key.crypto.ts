import { createHmac, randomBytes, randomInt } from 'crypto';
import { API_KEY_PREFIX } from '@luki-fitti/common/utils';
import { constantTimeEqual } from '@luki-fitti/common/utils/crypto';
import { getApiKeyPepper } from '@/config/env.config';

/** Alphabet for the 8-char public id (`[a-z2-7]`, visually unambiguous). */
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const ID_LENGTH = 8;

/** 8 chars from `[a-z2-7]` — the public lookup id embedded in the key. */
export function generateApiKeyId(): string {
  let id = '';
  for (let i = 0; i < ID_LENGTH; i++) {
    id += ID_ALPHABET[randomInt(ID_ALPHABET.length)];
  }
  return id;
}

/** 32 random bytes, base64url — 256 bits, brute force is impossible. */
export function generateApiKeySecret(): string {
  return randomBytes(32).toString('base64url');
}

/** Full key shown exactly once: `lf_pat_<id>_<secret>`. */
export function formatApiKey(id: string, secret: string): string {
  return `${API_KEY_PREFIX}${id}_${secret}`;
}

/**
 * `hex(HMAC-SHA256(API_KEY_PEPPER, secret))`. A fast hash is correct here: the
 * secret has 256 bits of entropy, and the pepper means a DB dump alone can't
 * even confirm a guessed key.
 */
export function hashApiKeySecret(secret: string): string {
  return createHmac('sha256', getApiKeyPepper()).update(secret).digest('hex');
}

/** Constant-time compare of a candidate secret against the stored hash. */
export function verifyApiKeySecret(secret: string, secretHash: string): boolean {
  return constantTimeEqual(hashApiKeySecret(secret), secretHash);
}
