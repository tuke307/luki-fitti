/**
 * Invite tokens are 32 random bytes encoded base64url → exactly 43 chars of
 * [A-Za-z0-9_-]. Checked before calling the API so malformed URLs never hit it.
 */
const INVITE_TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;

export function isValidInviteToken(token: string): boolean {
  return INVITE_TOKEN_REGEX.test(token);
}
