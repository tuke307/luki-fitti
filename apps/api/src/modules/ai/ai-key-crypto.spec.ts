import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
  AiKeyDecryptionError,
  aiKeyAad,
  decryptSecret,
  decryptWithRotation,
  encryptSecret,
  keyHint,
  type MasterKey,
} from './ai-key-crypto';

// Clearly fake test values; master keys are random per run.
const API_KEY = 'sk-or-v1-FAKE-KEY-FOR-TESTING-0000000000abcd';
const masterV1: MasterKey = { version: 1, key: crypto.randomBytes(32) };
const masterV2: MasterKey = { version: 2, key: crypto.randomBytes(32) };
const aad = aiKeyAad('user-1', 'USER');

const flipFirstByte = (b64: string) => {
  const buf = Buffer.from(b64, 'base64');
  buf[0] = buf[0]! ^ 0xff;
  return buf.toString('base64');
};

describe('ai-key-crypto (AES-256-GCM)', () => {
  it('round-trips and never stores the plaintext', () => {
    const secret = encryptSecret(API_KEY, masterV1, aad);
    assert.equal(secret.keyVersion, 1);
    assert.equal(Buffer.from(secret.iv, 'base64').length, 12);
    assert.equal(Buffer.from(secret.authTag, 'base64').length, 16);
    assert.ok(!JSON.stringify(secret).includes(API_KEY));
    assert.equal(decryptSecret(secret, masterV1.key, aad), API_KEY);
  });

  it('uses a fresh IV for every encryption', () => {
    const a = encryptSecret(API_KEY, masterV1, aad);
    const b = encryptSecret(API_KEY, masterV1, aad);
    assert.notEqual(a.iv, b.iv);
    assert.notEqual(a.ciphertext, b.ciphertext);
  });

  it('detects tampering via the auth tag', () => {
    const secret = encryptSecret(API_KEY, masterV1, aad);
    assert.throws(
      () =>
        decryptSecret(
          { ...secret, ciphertext: flipFirstByte(secret.ciphertext) },
          masterV1.key,
          aad,
        ),
      AiKeyDecryptionError,
    );
    assert.throws(
      () => decryptSecret({ ...secret, authTag: flipFirstByte(secret.authTag) }, masterV1.key, aad),
      AiKeyDecryptionError,
    );
    assert.throws(
      () => decryptSecret({ ...secret, iv: flipFirstByte(secret.iv) }, masterV1.key, aad),
      AiKeyDecryptionError,
    );
  });

  it('fails when the ciphertext is moved to another user or slot (AAD mismatch)', () => {
    const secret = encryptSecret(API_KEY, masterV1, aad);
    assert.throws(
      () => decryptSecret(secret, masterV1.key, aiKeyAad('user-2', 'USER')),
      AiKeyDecryptionError,
    );
    assert.throws(
      () => decryptSecret(secret, masterV1.key, aiKeyAad('user-1', 'ADMIN')),
      AiKeyDecryptionError,
    );
  });

  it('fails with the wrong master key without leaking details', () => {
    const secret = encryptSecret(API_KEY, masterV1, aad);
    assert.throws(
      () => decryptSecret(secret, masterV2.key, aad),
      (err: unknown) => err instanceof AiKeyDecryptionError && !String(err).includes(API_KEY),
    );
  });

  it('decrypts with the previous key during rotation and flags the row as stale', () => {
    const old = encryptSecret(API_KEY, masterV1, aad);
    const rotated = decryptWithRotation(old, aad, masterV2, masterV1);
    assert.deepEqual(rotated, { plaintext: API_KEY, stale: true });

    const fresh = encryptSecret(API_KEY, masterV2, aad);
    assert.deepEqual(decryptWithRotation(fresh, aad, masterV2, masterV1), {
      plaintext: API_KEY,
      stale: false,
    });

    assert.throws(() => decryptWithRotation(old, aad, masterV2, null), AiKeyDecryptionError);
  });

  it('keeps only the last 4 characters as a hint', () => {
    assert.equal(keyHint(API_KEY), 'abcd');
  });
});
