import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EMAIL_LOOKUP_TEST_VECTOR } from '@luki-fitti/common/utils';
import { dedupeAndChunk, emailsToHashes } from './contact-hash';

describe('dedupeAndChunk', () => {
  it('dedupes and keeps first-seen order', () => {
    assert.deepEqual(dedupeAndChunk(['a', 'b', 'a', 'c'], 10), [['a', 'b', 'c']]);
  });

  it('chunks at the given size', () => {
    const input = Array.from({ length: 5 }, (_, i) => `h${i}`);
    assert.deepEqual(dedupeAndChunk(input, 2), [['h0', 'h1'], ['h2', 'h3'], ['h4']]);
  });

  it('returns an empty list for empty input', () => {
    assert.deepEqual(dedupeAndChunk([], 2000), []);
  });
});

describe('emailsToHashes', () => {
  it('normalises, hashes and dedupes', async () => {
    const hashes = await emailsToHashes([' Foo@Example.COM ', 'foo@example.com', '']);
    assert.deepEqual(hashes, [EMAIL_LOOKUP_TEST_VECTOR.sha256Hex]);
  });

  it('caps the output at `max`', async () => {
    const hashes = await emailsToHashes(['a@x.test', 'b@x.test', 'c@x.test'], 2);
    assert.equal(hashes.length, 2);
  });
});
