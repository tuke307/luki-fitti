import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SocialSearchQuerySchema } from './social.schemas';

describe('SocialSearchQuerySchema', () => {
  it('normalises case, whitespace and a leading @', () => {
    assert.equal(SocialSearchQuerySchema.parse({ q: '  @Anna_K ' }).q, 'anna_k');
  });

  it('rejects LIKE wildcards and other non-handle characters', () => {
    for (const q of ['an%', 'a b', 'anna!', '%%']) {
      assert.equal(SocialSearchQuerySchema.safeParse({ q }).success, false, q);
    }
  });

  it('enforces the handle length', () => {
    assert.equal(SocialSearchQuerySchema.safeParse({ q: 'a' }).success, false);
    assert.equal(SocialSearchQuerySchema.safeParse({ q: 'a'.repeat(21) }).success, false);
  });
});
