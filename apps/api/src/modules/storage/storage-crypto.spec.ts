import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  decryptObject,
  encryptObject,
  isEncryptedObject,
  StorageDecryptionError,
  type MasterKey,
} from './storage-crypto';

// Master keys are random per run; never real credentials.
const masterV1: MasterKey = { version: 1, key: crypto.randomBytes(32) };
const masterV2: MasterKey = { version: 2, key: crypto.randomBytes(32) };
const OBJECT_KEY = 'progress/user-1/photo.jpg';

// Minimal JPEG: SOI (FF D8 FF) + a few payload bytes.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

const flip = (buf: Buffer, offset: number): Buffer => {
  const copy = Buffer.from(buf);
  copy[offset] = copy[offset]! ^ 0xff;
  return copy;
};

describe('storage-crypto (AES-256-GCM objects)', () => {
  it('round-trips and never stores the plaintext', () => {
    const blob = encryptObject(JPEG, OBJECT_KEY, masterV1);
    assert.ok(isEncryptedObject(blob));
    assert.ok(!blob.equals(JPEG));
    // The JPEG SOI marker must not appear at the start of the stored object.
    assert.notDeepEqual(blob.subarray(0, 3), Buffer.from([0xff, 0xd8, 0xff]));
    assert.ok(!blob.includes(JPEG));
    const { plaintext, stale } = decryptObject(blob, OBJECT_KEY, masterV1, null);
    assert.deepEqual(plaintext, JPEG);
    assert.equal(stale, false);
  });

  it('detects tampering with ciphertext and header via the auth tag / AAD', () => {
    const blob = encryptObject(JPEG, OBJECT_KEY, masterV1);
    // Flip a ciphertext byte.
    assert.throws(
      () => decryptObject(flip(blob, blob.length - 1), OBJECT_KEY, masterV1, null),
      StorageDecryptionError,
    );
    // Flip a header version byte (version is covered by the AAD).
    assert.throws(
      () => decryptObject(flip(blob, 4), OBJECT_KEY, masterV1, masterV2),
      StorageDecryptionError,
    );
    // Flip an IV byte.
    assert.throws(
      () => decryptObject(flip(blob, 8), OBJECT_KEY, masterV1, null),
      StorageDecryptionError,
    );
  });

  it('fails when the ciphertext is moved to another object key (AAD mismatch)', () => {
    const blob = encryptObject(JPEG, OBJECT_KEY, masterV1);
    assert.throws(
      () => decryptObject(blob, 'progress/user-2/other.jpg', masterV1, null),
      StorageDecryptionError,
    );
  });

  it('decrypts with the previous key and reports stale=true', () => {
    const blob = encryptObject(JPEG, OBJECT_KEY, masterV1);
    const { plaintext, stale } = decryptObject(blob, OBJECT_KEY, masterV2, masterV1);
    assert.deepEqual(plaintext, JPEG);
    assert.equal(stale, true);
  });

  it('reports stale=true when the header version is not the current version', () => {
    const blob = encryptObject(JPEG, OBJECT_KEY, masterV1);
    const otherV1: MasterKey = { version: 1, key: masterV1.key };
    const { stale } = decryptObject(blob, OBJECT_KEY, masterV1, null);
    assert.equal(stale, false);
    // Same key material but a different current version → stale.
    const currentV2SameKey: MasterKey = { version: 2, key: masterV1.key };
    const result = decryptObject(blob, OBJECT_KEY, currentV2SameKey, otherV1);
    assert.equal(result.stale, true);
  });

  it('isEncryptedObject is false for a real JPEG buffer', () => {
    assert.equal(isEncryptedObject(JPEG), false);
    assert.equal(isEncryptedObject(Buffer.alloc(0)), false);
    assert.equal(isEncryptedObject(Buffer.from('LFE1')), false);
  });

  it('throws a generic error that leaks nothing on failure', () => {
    const blob = encryptObject(JPEG, OBJECT_KEY, masterV1);
    assert.throws(
      () => decryptObject(blob, OBJECT_KEY, masterV2, null),
      (err: unknown) => err instanceof StorageDecryptionError && !String(err).includes(OBJECT_KEY),
    );
  });
});
