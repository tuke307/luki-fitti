export const INVITE_TTL_DAYS = 30;
export const INVITE_TTL_MS = INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Friend-invite link. It must live on the app host: iOS only opens the app for a universal
 * link that is served there without redirects. Trailing slashes in the base are tolerated.
 */
export function buildInviteUrl(frontendUrl: string, token: string): string {
  return `${frontendUrl.replace(/\/+$/, '')}/invite/${token}`;
}
