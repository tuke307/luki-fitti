export type SiteLocale = 'de' | 'en';
export const SITE_LOCALES: SiteLocale[] = ['de', 'en'];
export const DEFAULT_SITE_LOCALE: SiteLocale = 'de';

const isProd = process.env.NODE_ENV === 'production';
// NEXT_PUBLIC_* so client bundles see the same values as the proxy. E2E overrides
// the production hostnames with the local ones; unset keeps the real domains.
const hostList = (env: string | undefined, prod: string, dev: string) =>
  env ? env.split(',').map((h) => h.trim()) : [isProd ? prod : dev];
export const SITE_HOSTNAMES = hostList(
  process.env.NEXT_PUBLIC_SITE_HOSTNAMES,
  'luki-fitti.tony-luke.de',
  'site.localhost:3000',
);
export const DOCS_HOSTNAMES = hostList(
  process.env.NEXT_PUBLIC_DOCS_HOSTNAMES,
  'docs.luki-fitti.tony-luke.de',
  'docs.localhost:3000',
);
export const DOCS_ORIGIN =
  process.env.NEXT_PUBLIC_DOCS_ORIGIN ?? `http${isProd ? 's' : ''}://${DOCS_HOSTNAMES[0]}`;
export const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_ORIGIN ??
  (isProd ? 'https://app.luki-fitti.tony-luke.de' : 'http://localhost:3000');
export const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_ORIGIN ?? `http${isProd ? 's' : ''}://${SITE_HOSTNAMES[0]}`;

export const GITHUB_URL = 'https://github.com/tuke307/luki-fitti';
export const APP_STORE_ID = '6831508360';
// Storefront-neutral link: the App Store opens the visitor's own country store.
export const APP_STORE_URL = `https://apps.apple.com/app/lukifitti/id${APP_STORE_ID}`;
