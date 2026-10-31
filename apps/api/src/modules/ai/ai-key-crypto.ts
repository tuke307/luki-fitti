import crypto from 'crypto';

/**
 * AES-256-GCM encryption for per-user OpenRouter API keys.
 *
 * - Encryption (not hashing): the server must recover the plaintext to call OpenRouter.
 * - A fresh random 96-bit IV per encryption (never reused with the same key).
 * - The 128-bit auth tag detects any tampering with ciphertext, IV or AAD.
 * - AAD binds a ciphertext to `${userId}:${slot}`, so a row copied to another user or slot
 *   fails to decrypt.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface MasterKey {
  version: number;
  key: Buffer;
}

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

export class AiKeyDecryptionError extends Error {
  constructor() {
    // Deliberately generic: never include key material or ciphertext.
    super('Stored AI key could not be decrypted');
    this.name = 'AiKeyDecryptionError';
  }
}

export function aiKeyAad(userId: string, slot: string): Buffer {
  return Buffer.from(`${userId}:${slot}`, 'utf8');
}

function assertMasterKey(master: MasterKey): void {
  if (master.key.length !== 32) throw new Error('AI key master key must be 32 bytes');
}

export function encryptSecret(plaintext: string, master: MasterKey, aad: Buffer): EncryptedSecret {
  assertMasterKey(master);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, master.key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    keyVersion: master.version,
  };
}

export function decryptSecret(
  secret: Omit<EncryptedSecret, 'keyVersion'>,
  key: Buffer,
  aad: Buffer,
): string {
  try {
    const iv = Buffer.from(secret.iv, 'base64');
    const authTag = Buffer.from(secret.authTag, 'base64');
    if (iv.length !== IV_BYTES || authTag.length !== TAG_BYTES || key.length !== 32) {
      throw new AiKeyDecryptionError();
    }
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(aad);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(Buffer.from(secret.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new AiKeyDecryptionError();
  }
}

/**
 * Decrypts with the master key matching `keyVersion`, falling back to the other configured key
 * (GCM authentication makes trial decryption safe). `stale` means the caller should re-encrypt
 * with the current key (rotation).
 */
export function decryptWithRotation(
  secret: EncryptedSecret,
  aad: Buffer,
  current: MasterKey,
  previous: MasterKey | null,
): { plaintext: string; stale: boolean } {
  const candidates = [current, previous].filter((k): k is MasterKey => k !== null);
  candidates.sort(
    (a, b) => Number(b.version === secret.keyVersion) - Number(a.version === secret.keyVersion),
  );
  for (const candidate of candidates) {
    try {
      const plaintext = decryptSecret(secret, candidate.key, aad);
      return { plaintext, stale: candidate !== current || secret.keyVersion !== current.version };
    } catch {
      // try the next key
    }
  }
  throw new AiKeyDecryptionError();
}

/** Last 4 characters for display ("…abcd"); reveals nothing useful about the key. */
export function keyHint(apiKey: string): string {
  return apiKey.slice(-4);
}
