import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildInviteUrl, INVITE_TTL_DAYS, INVITE_TTL_MS } from './invite.util';

describe('invite util', () => {
  it('builds the invite path on the app host and ignores trailing slashes', () => {
    const token = 'a'.repeat(43);
    assert.equal(
      buildInviteUrl('https://app.example.com', token),
      `https://app.example.com/invite/${token}`,
    );
    assert.equal(
      buildInviteUrl('https://app.example.com//', token),
      `https://app.example.com/invite/${token}`,
    );
  });

  it('keeps invites valid for at least 7 days', () => {
    assert.ok(INVITE_TTL_DAYS >= 7);
    assert.equal(INVITE_TTL_MS, INVITE_TTL_DAYS * 86_400_000);
  });
});
