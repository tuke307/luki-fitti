import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearPendingInvite,
  getPendingInvite,
  postAuthPath,
  setPendingInvite,
} from './pending-invite';

const TOKEN = 'Ab3_xZ-9qQwErTyUiOpAsDfGhJkLzXcVbNm01234_56';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe('pending invite', () => {
  it('stores a valid token and routes post-auth to the invite page', () => {
    const s = memoryStorage();
    setPendingInvite(TOKEN, s);
    assert.equal(getPendingInvite(s), TOKEN);
    assert.equal(postAuthPath('/', s), `/invite/${TOKEN}`);
  });

  it('ignores malformed tokens and falls back', () => {
    const s = memoryStorage();
    setPendingInvite('not-a-token', s);
    assert.equal(getPendingInvite(s), null);
    assert.equal(postAuthPath('/home', s), '/home');
  });

  it('clears the token', () => {
    const s = memoryStorage();
    setPendingInvite(TOKEN, s);
    clearPendingInvite(s);
    assert.equal(getPendingInvite(s), null);
  });
});
