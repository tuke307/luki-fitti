import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateOAuthNonce } from './oauth-providers';
import { recoveryCodesFileText } from './recovery-codes';

describe('generateOAuthNonce', () => {
  it('produces a 43-char base64url string (32 bytes, no padding)', () => {
    const nonce = generateOAuthNonce();
    assert.equal(nonce.length, 43);
    assert.match(nonce, /^[A-Za-z0-9_-]+$/);
  });

  it('generates unique nonces', () => {
    const nonces = new Set(Array.from({ length: 100 }, generateOAuthNonce));
    assert.equal(nonces.size, 100);
  });
});

describe('recoveryCodesFileText', () => {
  const codes = ['abcde-fghij', 'klmnp-qrstu'];

  it('contains the account email, a warning and one code per line', () => {
    const text = recoveryCodesFileText(codes, 'athlete@example.com');
    assert.ok(text.includes('athlete@example.com'));
    assert.ok(text.includes('once'));
    const lines = text.split('\n');
    assert.equal(lines.filter((l) => codes.includes(l)).length, 2);
    codes.forEach((c) => assert.ok(lines.includes(c)));
  });
});
