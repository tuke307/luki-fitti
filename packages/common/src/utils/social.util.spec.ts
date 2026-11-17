import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkUsername,
  EMAIL_LOOKUP_TEST_VECTOR,
  emailLookupHash,
  USERNAME_CHANGE_COOLDOWN_DAYS,
  isUsernameAllowed,
  isWebPushEndpointAllowed,
  nextUsernameChangeAt,
  normalizeEmailForLookup,
  normalizeUsername,
  RESERVED_USERNAMES,
} from './social.util';

describe('social.util username rules', () => {
  it('normalises case and surrounding whitespace', () => {
    assert.equal(normalizeUsername('  Luki_Fitti '), 'luki_fitti');
  });

  it('accepts valid usernames', () => {
    for (const h of ['abc', 'lukas_97', 'a'.repeat(20), 'x_y_z']) {
      assert.deepEqual(checkUsername(h), { ok: true, username: h });
      assert.equal(isUsernameAllowed(h), true);
    }
  });

  it('rejects bad length and characters', () => {
    for (const h of ['ab', 'a'.repeat(21), 'has space', 'dash-ed', 'dot.ted', 'üser']) {
      assert.equal(checkUsername(h).ok, false, h);
      assert.equal(isUsernameAllowed(h), false, h);
    }
  });

  it('rejects reserved usernames', () => {
    assert.equal(RESERVED_USERNAMES.has('admin'), true);
    assert.deepEqual(checkUsername('admin'), { ok: false, reason: 'reserved' });
    assert.deepEqual(checkUsername(' Support '), { ok: false, reason: 'reserved' });
  });

  it('rejects profanity as a substring (EN and DE)', () => {
    for (const h of ['fuckface', 'xhitlerx', 'wichser_1', 'superporn']) {
      assert.deepEqual(checkUsername(h), { ok: false, reason: 'blocked' }, h);
    }
  });

  it('grants the first username immediately, then enforces the cooldown', () => {
    assert.equal(nextUsernameChangeAt(null), null);
    const changed = new Date('2026-01-01T12:00:00Z');
    assert.equal(
      nextUsernameChangeAt(changed)?.getTime(),
      changed.getTime() + USERNAME_CHANGE_COOLDOWN_DAYS * 86_400_000,
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

describe('social.util web push endpoint allowlist', () => {
  it('accepts the known push services', () => {
    for (const url of [
      'https://fcm.googleapis.com/fcm/send/abc123',
      'https://updates.push.services.mozilla.com/wpush/v2/xyz',
      'https://push.services.mozilla.com/wpush/v1/xyz',
      'https://web.push.apple.com/QmFkb2',
      'https://db5.notify.windows.com/?token=abc',
    ]) {
      assert.equal(isWebPushEndpointAllowed(url), true, url);
    }
  });

  it('rejects non-https, unknown hosts and non-URLs (SSRF guard)', () => {
    for (const url of [
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://169.254.169.254/latest/meta-data',
      'https://localhost:3001/internal',
      'https://evil-push.apple.com.attacker.example/x',
      'not a url',
      'https://fcm.googleapis.com.evil.example/x',
    ]) {
      assert.equal(isWebPushEndpointAllowed(url), false, url);
    }
  });
});
