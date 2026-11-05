import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { importId, uuidV5 } from './uuid-v5';

const DNS_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

describe('uuidV5', () => {
  it('matches the RFC 9562 test vector', () => {
    assert.equal(uuidV5('www.example.com', DNS_NAMESPACE), '2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });

  it('derives distinct, stable ids per user and kind', () => {
    const a = importId('user-a', 'session', 'k1');
    assert.equal(a, importId('user-a', 'session', 'k1'));
    assert.notEqual(a, importId('user-b', 'session', 'k1'));
    assert.notEqual(a, importId('user-a', 'template', 'k1'));
    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
