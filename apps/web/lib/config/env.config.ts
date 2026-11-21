export const NODE_ENV = process.env.NODE_ENV || 'development';
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
/** Marketing site origin — where Impressum/Datenschutz/Nutzungsbedingungen live. */

export const SERVER_API_URL = (
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_DIRECT_API_URL ||
  `http://localhost:${process.env.API_PORT || 3001}/api`
).replace(/\/+$/, '');

export const DIRECT_API_URL = process.env.NEXT_PUBLIC_DIRECT_API_URL;
export const JWT_SECRET = process.env.JWT_SECRET;
/** Comma-separated Apple app ids (`TEAMID.bundleid`) for the AASA route handler. */
export const APPLE_APP_IDS = process.env.APPLE_APP_IDS;

/**
 * Web sign-in providers (server-only, read on the login/security pages at request time —
 * intentionally not NEXT_PUBLIC so they can differ per deployment).
 */
export const GOOGLE_WEB_CLIENT_ID = (process.env.GOOGLE_WEB_CLIENT_ID ?? '').trim() || undefined;
export const APPLE_WEB_SERVICES_ID = (process.env.APPLE_WEB_SERVICES_ID ?? '').trim() || undefined;
export const APPLE_WEB_REDIRECT_URI =
  (process.env.APPLE_WEB_REDIRECT_URI ?? '').trim() || undefined;
