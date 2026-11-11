export type SiteLocale = 'de' | 'en';
export const SITE_LOCALES: SiteLocale[] = ['de', 'en'];
export const DEFAULT_SITE_LOCALE: SiteLocale = 'de';

const isProd = process.env.NODE_ENV === 'production';
export const SITE_HOSTNAMES = isProd ? ['luki-fitti.tony-luke.de'] : ['site.localhost:3000'];
export const APP_ORIGIN = isProd ? 'https://app.luki-fitti.tony-luke.de' : 'http://localhost:3000';
export const SITE_ORIGIN = `http${isProd ? 's' : ''}://${SITE_HOSTNAMES[0]}`;

export const GITHUB_URL = 'https://github.com/tuke307/luki-fitti';
export const APP_STORE_ID = '6831508360';
// Storefront-neutral link: the App Store opens the visitor's own country store.
export const APP_STORE_URL = `https://apps.apple.com/app/lukifitti/id${APP_STORE_ID}`;
