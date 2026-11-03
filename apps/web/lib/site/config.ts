export type SiteLocale = 'de' | 'en';
export const SITE_LOCALES: SiteLocale[] = ['de', 'en'];
export const DEFAULT_SITE_LOCALE: SiteLocale = 'de';

const isProd = process.env.NODE_ENV === 'production';
export const SITE_HOSTNAMES = isProd ? ['luki-fitti.tony-luke.de'] : ['site.localhost:3000'];
export const APP_ORIGIN = isProd ? 'https://app.luki-fitti.tony-luke.de' : 'http://localhost:3000';
export const SITE_ORIGIN = `http${isProd ? 's' : ''}://${SITE_HOSTNAMES[0]}`;

// Set the TestFlight/App Store link here once it exists; empty shows "Coming soon".
export const TESTFLIGHT_URL = '';
