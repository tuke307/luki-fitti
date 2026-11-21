import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toCachedProfile } from './cached-profile';
import type { UserDto } from '@luki-fitti/common';

const userWithTokens = {
  id: 'u1',
  email: 'a@b.test',
  name: 'Athlete',
  preferences: { weightUnit: 'KG' },
  tokens: { accessToken: 'access-secret', refreshToken: 'refresh-secret' },
} as unknown as UserDto;

describe('toCachedProfile', () => {
  it('removes tokens and keeps every other field', () => {
    const profile = toCachedProfile(userWithTokens);
    assert.ok(!('tokens' in profile));
    assert.equal(profile.id, 'u1');
    assert.equal(profile.email, 'a@b.test');
    assert.equal(profile.name, 'Athlete');
    assert.deepEqual(profile.preferences, { weightUnit: 'KG' });
  });

  it('does not mutate the input', () => {
    toCachedProfile(userWithTokens);
    assert.ok(userWithTokens.tokens);
  });
});
