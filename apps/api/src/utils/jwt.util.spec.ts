import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateAccessToken,
  generateMfaToken,
  verifyAccessToken,
  verifyMfaToken,
} from './jwt.util';

const user = { id: 'u1', email: 'u1@example.com' };

describe('jwt.util token isolation', () => {
  it('an access token is not accepted as an MFA token', () => {
    assert.throws(() => verifyMfaToken(generateAccessToken(user)));
  });

  it('an MFA token is not accepted as an access token', () => {
    assert.throws(() => verifyAccessToken(generateMfaToken(user.id)));
  });

  it('an MFA token round-trips the user id', () => {
    assert.deepEqual(verifyMfaToken(generateMfaToken(user.id)), { id: user.id });
  });
});
