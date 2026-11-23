import crypto from 'node:crypto';

/**
 * AES-256-GCM encryption for stored objects (photos, avatars, reports).
 *
 * Wire format: `LFE1` magic (4B) | key version uint32 BE (4B) | IV (12B) | GCM tag (16B) |
 * ciphertext. The AAD binds each object to the header bytes plus its object key, so the key
 * version can't be tampered with and a ciphertext moved to another key fails to decrypt.
 *
 * Master keys come from the AI key encryption config; the raw key is never used directly —
 * a storage-specific subkey is derived via HKDF and cached per master key.
 */

const MAGIC = Buffer.from('LFE1', 'ascii');
const VERSION_BYTES = 4;
const HEADER_BYTES = MAGIC.length + VERSION_BYTES;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MIN_BYTES = HEADER_BYTES + IV_BYTES + TAG_BYTES;
const HKDF_INFO = 'luki-fitti/storage-objects/v1';

export interface MasterKey {
  version: number;
  key: Buffer;
}

export class StorageDecryptionError extends Error {
  constructor() {
    // Deliberately generic: never include key material or ciphertext.
    super('Stored object could not be decrypted');
    this.name = 'StorageDecryptionError';
  }
}

const derivedKeys = new WeakMap<Buffer, Buffer>();

function deriveKey(masterKey: Buffer): Buffer {
  let derived = derivedKeys.get(masterKey);
  if (!derived) {
    derived = Buffer.from(crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), HKDF_INFO, 32));
    derivedKeys.set(masterKey, derived);
  }
  return derived;
}

function header(version: number): Buffer {
  const head = Buffer.alloc(HEADER_BYTES);
  MAGIC.copy(head);
  head.writeUInt32BE(version, MAGIC.length);
  return head;
}

function aad(objectKey: string, headerBytes: Buffer): Buffer {
  return Buffer.concat([headerBytes, Buffer.from(objectKey, 'utf8')]);
}

export function isEncryptedObject(buf: Buffer): boolean {
  return buf.length >= MIN_BYTES && buf.subarray(0, MAGIC.length).equals(MAGIC);
}

export function encryptObject(plain: Buffer, objectKey: string, master: MasterKey): Buffer {
  const head = header(master.version);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(master.key), iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(aad(objectKey, head));
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([head, iv, cipher.getAuthTag(), ciphertext]);
}

/**
 * Decrypts with the key matching the header version first, falling back to the other
 * configured key (GCM authentication makes trial decryption safe). `stale` means the
 * caller should re-encrypt with the current key (rotation).
 */
export function decryptObject(
  blob: Buffer,
  objectKey: string,
  current: MasterKey | null,
  previous: MasterKey | null,
): { plaintext: Buffer; stale: boolean } {
  if (!isEncryptedObject(blob)) throw new StorageDecryptionError();
  const version = blob.readUInt32BE(MAGIC.length);
  const head = blob.subarray(0, HEADER_BYTES);
  const iv = blob.subarray(HEADER_BYTES, HEADER_BYTES + IV_BYTES);
  const authTag = blob.subarray(HEADER_BYTES + IV_BYTES, MIN_BYTES);
  const ciphertext = blob.subarray(MIN_BYTES);
  const candidates = [current, previous]
    .filter((k): k is MasterKey => k !== null)
    .sort((a, b) => Number(b.version === version) - Number(a.version === version));
  for (const candidate of candidates) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(candidate.key), iv, {
        authTagLength: TAG_BYTES,
      });
      decipher.setAAD(aad(objectKey, head));
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return { plaintext, stale: candidate !== current || version !== current?.version };
    } catch {
      // try the next key
    }
  }
  throw new StorageDecryptionError();
}
