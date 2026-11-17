import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidInviteToken } from './invite-token';

describe('isValidInviteToken', () => {
  it('accepts a 43-char base64url token', () => {
    assert.equal(isValidInviteToken('Ab3_xZ-9qQwErTyUiOpAsDfGhJkLzXcVbNm01234_56'), true);
    assert.equal(isValidInviteToken('a'.repeat(43)), true);
  });

  it('rejects wrong lengths and characters', () => {
    assert.equal(isValidInviteToken('a'.repeat(42)), false);
    assert.equal(isValidInviteToken('a'.repeat(44)), false);
    assert.equal(isValidInviteToken(`${'a'.repeat(42)}+`), false);
    assert.equal(isValidInviteToken(`${'a'.repeat(42)}=`), false);
    assert.equal(isValidInviteToken(''), false);
    assert.equal(isValidInviteToken('../admin'), false);
  });
});
