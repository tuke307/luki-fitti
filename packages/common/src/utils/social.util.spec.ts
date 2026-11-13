import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkHandle,
  EMAIL_LOOKUP_TEST_VECTOR,
  emailLookupHash,
  HANDLE_CHANGE_COOLDOWN_DAYS,
  isHandleAllowed,
  nextHandleChangeAt,
  normalizeEmailForLookup,
  normalizeHandle,
  RESERVED_HANDLES,
} from './social.util';

describe('social.util handle rules', () => {
  it('normalises case and surrounding whitespace', () => {
    assert.equal(normalizeHandle('  Luki_Fitti '), 'luki_fitti');
  });

  it('accepts valid handles', () => {
    for (const h of ['abc', 'lukas_97', 'a'.repeat(20), 'x_y_z']) {
      assert.deepEqual(checkHandle(h), { ok: true, handle: h });
      assert.equal(isHandleAllowed(h), true);
    }
  });

  it('rejects bad length and characters', () => {
    for (const h of ['ab', 'a'.repeat(21), 'has space', 'dash-ed', 'dot.ted', 'üser']) {
      assert.equal(checkHandle(h).ok, false, h);
      assert.equal(isHandleAllowed(h), false, h);
    }
  });

  it('rejects reserved handles', () => {
    assert.equal(RESERVED_HANDLES.has('admin'), true);
    assert.deepEqual(checkHandle('admin'), { ok: false, reason: 'reserved' });
    assert.deepEqual(checkHandle(' Support '), { ok: false, reason: 'reserved' });
  });

  it('rejects profanity as a substring (EN and DE)', () => {
    for (const h of ['fuckface', 'xhitlerx', 'wichser_1', 'superporn']) {
      assert.deepEqual(checkHandle(h), { ok: false, reason: 'blocked' }, h);
    }
  });

  it('grants the first handle immediately, then enforces the cooldown', () => {
    assert.equal(nextHandleChangeAt(null), null);
    const changed = new Date('2026-01-01T12:00:00Z');
    assert.equal(
      nextHandleChangeAt(changed)?.getTime(),
      changed.getTime() + HANDLE_CHANGE_COOLDOWN_DAYS * 86_400_000,
    );
  });
});

describe('social.util email lookup hashing', () => {
  it('normalises trim + case', () => {
    assert.equal(normalizeEmailForLookup(EMAIL_LOOKUP_TEST_VECTOR.input), 'foo@example.com');
  });

  it('matches the shared cross-platform test vector', async () => {
    assert.equal(
      await emailLookupHash(EMAIL_LOOKUP_TEST_VECTOR.input),
      EMAIL_LOOKUP_TEST_VECTOR.sha256Hex,
    );
    assert.equal(await emailLookupHash('foo@example.com'), EMAIL_LOOKUP_TEST_VECTOR.sha256Hex);
  });

  it('produces lowercase 64-hex output', async () => {
    assert.match(await emailLookupHash('a@b.c'), /^[0-9a-f]{64}$/);
  });
});
