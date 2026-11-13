import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { redactForLog, redactUrlForLog } from './logging.interceptor';

describe('redactForLog', () => {
  it('redacts web push keys and contact hashes', () => {
    const redacted = redactForLog({
      platform: 'WEBPUSH',
      token: 'https://fcm.googleapis.com/fcm/send/abc',
      p256dh: 'key',
      auth: 'secret',
      hashes: ['a'.repeat(64)],
      locale: 'de-DE',
    });
    assert.deepEqual(redacted, {
      platform: 'WEBPUSH',
      token: '[redacted]',
      p256dh: '[redacted]',
      auth: '[redacted]',
      hashes: '[redacted]',
      locale: 'de-DE',
    });
  });

  it('keeps unrelated keys that merely contain "auth"', () => {
    assert.deepEqual(redactForLog({ author: 'Tony' }), { author: 'Tony' });
  });
});

describe('redactUrlForLog', () => {
  it('masks invite tokens in api and page paths', () => {
    assert.equal(
      redactUrlForLog('/api/social/invites/AbC-123_xyz/accept'),
      '/api/social/invites/[redacted]/accept',
    );
    assert.equal(redactUrlForLog('/invite/AbC-123_xyz?x=1'), '/invite/[redacted]?x=1');
  });

  it('leaves the invite collection route alone', () => {
    assert.equal(redactUrlForLog('/api/social/invites'), '/api/social/invites');
  });
});
