import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_KEY_EXPIRY_DAYS,
  API_KEY_MAX_ACTIVE,
  API_KEY_PATTERN,
  API_KEY_PREFIX,
  apiKeyDisplayPrefix,
  parseApiKey,
} from './api-key.util';
import { CreateApiKeySchema } from '../schemas/api-keys.schemas';
import { ApiKeyScope } from '../enums';

const VALID_SECRET = 'a'.repeat(43);
const VALID_KEY = `${API_KEY_PREFIX}abcdef23_${VALID_SECRET}`;

describe('parseApiKey', () => {
  it('splits a well-formed key into id and secret', () => {
    assert.deepEqual(parseApiKey(VALID_KEY), { id: 'abcdef23', secret: VALID_SECRET });
  });

  it('accepts surrounding whitespace', () => {
    assert.deepEqual(parseApiKey(`  ${VALID_KEY} \n`), { id: 'abcdef23', secret: VALID_SECRET });
  });

  it('rejects malformed keys', () => {
    assert.equal(parseApiKey(''), null);
    assert.equal(parseApiKey('lf_pat_'), null);
    assert.equal(parseApiKey('lf_pat_abcdef23'), null);
    // id must be [a-z2-7]: '8', '9', '0', '1' and uppercase are out
    assert.equal(parseApiKey(`lf_pat_abcdefg8_${VALID_SECRET}`), null);
    assert.equal(parseApiKey(`lf_pat_ABCDEF23_${VALID_SECRET}`), null);
    // secret is exactly 43 base64url chars
    assert.equal(parseApiKey(`lf_pat_abcdef23_${'a'.repeat(42)}`), null);
    assert.equal(parseApiKey(`lf_pat_abcdef23_${'a'.repeat(44)}`), null);
    // wrong prefix
    assert.equal(parseApiKey(`sk_abcdef23_${VALID_SECRET}`), null);
  });
});

describe('API key constants', () => {
  it('matches the display prefix helper', () => {
    assert.equal(apiKeyDisplayPrefix('abcdef23'), 'lf_pat_abcdef23');
  });

  it('caps active keys at 10 and offers 30/90/365-day lifetimes', () => {
    assert.equal(API_KEY_MAX_ACTIVE, 10);
    assert.deepEqual([...API_KEY_EXPIRY_DAYS], [30, 90, 365]);
  });

  it('exposes the pattern for client-side format checks', () => {
    assert.equal(API_KEY_PATTERN.test(VALID_KEY), true);
    assert.equal(API_KEY_PATTERN.test('lf_pat_short'), false);
  });
});

describe('CreateApiKeySchema', () => {
  const base = {
    name: 'Sheets sync',
    scopes: [ApiKeyScope.READ_WORKOUTS],
    expiresInDays: 90,
    currentPassword: 'pw',
  };

  it('accepts a valid payload and defaults expiresInDays to 90', () => {
    assert.equal(
      CreateApiKeySchema.parse({
        name: base.name,
        scopes: base.scopes,
        currentPassword: base.currentPassword,
      }).expiresInDays,
      90,
    );
    assert.equal(CreateApiKeySchema.parse({ ...base, expiresInDays: null }).expiresInDays, null);
  });

  it('rejects empty names, overlong names, empty scopes and duplicates', () => {
    assert.throws(() => CreateApiKeySchema.parse({ ...base, name: '  ' }));
    assert.throws(() => CreateApiKeySchema.parse({ ...base, name: 'x'.repeat(41) }));
    assert.throws(() => CreateApiKeySchema.parse({ ...base, scopes: [] }));
    assert.throws(() =>
      CreateApiKeySchema.parse({ ...base, scopes: [ApiKeyScope.READ_BODY, ApiKeyScope.READ_BODY] }),
    );
    assert.throws(() => CreateApiKeySchema.parse({ ...base, scopes: ['read:everything'] }));
    assert.throws(() => CreateApiKeySchema.parse({ ...base, expiresInDays: 7 }));
    assert.throws(() => CreateApiKeySchema.parse({ ...base, currentPassword: '' }));
  });
});
