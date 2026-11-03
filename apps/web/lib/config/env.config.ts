export const NODE_ENV = process.env.NODE_ENV || 'development';
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
export const APP_ORIGIN = process.env.APP_ORIGIN || 'https://app.luki-fitti.tony-luke.de';
export const SITE_HOSTNAMES = (process.env.SITE_HOSTNAMES || 'luki-fitti.tony-luke.de')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);
export const APP_ORIGIN_URL = process.env.NEXT_PUBLIC_APP_ORIGIN || 'https://app.luki-fitti.tony-luke.de';
export const PUBLIC_SITE_HOSTNAMES = (
  process.env.NEXT_PUBLIC_SITE_HOSTNAMES || 'luki-fitti.tony-luke.de'
)
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);
/** Marketing site origin — where Impressum/Datenschutz/Nutzungsbedingungen live. */
export const LANDING_URL =
  process.env.NEXT_PUBLIC_LANDING_URL || 'https://luki-fitti.tony-luke.de';

export const SERVER_API_URL = (
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_DIRECT_API_URL ||
  `http://localhost:${process.env.API_PORT || 3001}/api`
).replace(/\/+$/, '');

export const DIRECT_API_URL = process.env.NEXT_PUBLIC_DIRECT_API_URL;
export const JWT_SECRET = process.env.JWT_SECRET;
