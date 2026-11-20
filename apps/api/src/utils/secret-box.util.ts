import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'crypto';
import { getTwoFactorKey } from '@/config/env.config';

const key = () => createHash('sha256').update(getTwoFactorKey()).digest();

/** AES-256-GCM: `v1.<iv>.<tag>.<ciphertext>` (all base64url). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), ct]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

export function decryptSecret(box: string): string {
  const [version, iv, tag, ct] = box.split('.');
  if (version !== 'v1' || !iv || !tag || !ct) throw new Error('Unsupported secret format');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString(
    'utf8',
  );
}

/** Keyed hash for one-time recovery codes (they have ~50 bits, so a bare hash would be brute-forceable). */
export function hashRecoveryCode(code: string): string {
  return createHmac('sha256', getTwoFactorKey()).update(`recovery:${code}`).digest('hex');
}
