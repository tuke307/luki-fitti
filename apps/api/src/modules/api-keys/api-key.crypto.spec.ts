import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { API_KEY_PATTERN } from '@luki-fitti/common/utils';
import {
  formatApiKey,
  generateApiKeyId,
  generateApiKeySecret,
  hashApiKeySecret,
  verifyApiKeySecret,
} from './api-key.crypto';

describe('api-key.crypto', () => {
  it('generates 8-char ids from [a-z2-7] only', () => {
    for (let i = 0; i < 200; i++) {
      assert.match(generateApiKeyId(), /^[a-z2-7]{8}$/);
    }
  });

  it('formats full keys that parseApiKey accepts', () => {
    const id = generateApiKeyId();
    const secret = generateApiKeySecret();
    const key = formatApiKey(id, secret);
    assert.match(key, API_KEY_PATTERN);
    assert.equal(key, `lf_pat_${id}_${secret}`);
    assert.equal(secret.length, 43); // 32 bytes → 43 base64url chars
  });

  it('verifies the secret against its HMAC hash', () => {
    const secret = generateApiKeySecret();
    const hash = hashApiKeySecret(secret);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(verifyApiKeySecret(secret, hash), true);
    assert.equal(verifyApiKeySecret(generateApiKeySecret(), hash), false);
    assert.equal(verifyApiKeySecret(secret, hashApiKeySecret('other')), false);
  });

  it('stores only a hash — the hash reveals nothing about the secret', () => {
    const secret = generateApiKeySecret();
    assert.equal(hashApiKeySecret(secret).includes(secret), false);
  });
});
