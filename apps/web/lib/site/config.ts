export type SiteLocale = 'de' | 'en';
export const SITE_LOCALES: SiteLocale[] = ['de', 'en'];
export const DEFAULT_SITE_LOCALE: SiteLocale = 'de';

const isProd = process.env.NODE_ENV === 'production';
export const SITE_HOSTNAMES = isProd ? ['luki-fitti.tony-luke.de'] : ['site.localhost:3000'];
export const APP_ORIGIN = isProd ? 'https://app.luki-fitti.tony-luke.de' : 'http://localhost:3000';
export const SITE_ORIGIN = `http${isProd ? 's' : ''}://${SITE_HOSTNAMES[0]}`;

// Set the TestFlight/App Store link here once it exists; empty shows "Coming soon".
export const TESTFLIGHT_URL = 'https://testflight.apple.com/join/3agxtuUt';
export const GITHUB_URL = 'https://github.com/tuke307/luki-fitti';
// Set once the app is live on the App Store; empty shows the badge with a "Coming soon" tag.
export const APP_STORE_URL = '';
