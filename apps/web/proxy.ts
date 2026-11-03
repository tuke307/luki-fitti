import { APP_ORIGIN, SITE_HOSTNAMES, SITE_ORIGIN } from '@/lib/site/config';
import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { JWT_SECRET, NODE_ENV } from './lib/config/env.config';





/** Public marketing paths → internal /site routes on the site host. */
const SITE_PATHS: Record<string, string> = {
  '/': '/site/de',
  '/en': '/site/en',
  '/impressum': '/site/de/impressum',
  '/datenschutz': '/site/de/datenschutz',
  '/nutzungsbedingungen': '/site/de/nutzungsbedingungen',
  '/en/imprint': '/site/en/impressum',
  '/en/privacy': '/site/en/datenschutz',
  '/en/terms': '/site/en/nutzungsbedingungen',
};

const PUBLIC_FILE =
  /^\/(favicon\.ico|icon(-\d+)?\.svg|manifest\.(webmanifest|json)|sw\.js|robots\.txt|sitemap\.xml|workbox-.*\.js)$/;
const PUBLIC_PREFIX = /^\/(_next|api|screens|images|fonts)\//;

function hostOf(req: NextRequest): string {
  return (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(',')[0]?.trim() ?? '';
}

function isSiteHost(host: string): boolean {
  return SITE_HOSTNAMES.includes(host);
}

function isLocalDev(host: string): boolean {
  return host.startsWith('localhost') || host.startsWith('127.0.0.1');
}

function redirectToLogin(req: NextRequest) {
  const url = new URL('/login', req.url);
  url.searchParams.set('redirect', req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

async function hasValidAccessToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  if (!JWT_SECRET) return NODE_ENV !== 'production';
  try {
    await jwtVerify(token, new TextEncoder().encode(JWT_SECRET));
    return true;
  } catch {
    return false;
  }
}

/**
 * Host router. `SITE_HOSTNAMES` (default luki-fitti.tony-luke.de) serves only the marketing
 * site via rewrites to /site/*; app paths there 308 to APP_ORIGIN. The app host serves the PWA
 * (noindex), keeps /admin auth, and redirects legal/site paths to the site host.
 */
const isProd = process.env.NODE_ENV === 'production';
const REDIRECT_STATUS = isProd ? 308 : 307;

export async function proxy(req: NextRequest) {
  const host = hostOf(req);
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIX.test(pathname) || PUBLIC_FILE.test(pathname)) {
    return NextResponse.next();
  }

  if (isSiteHost(host)) {
    // Legal/marketing rewrites to the internal /site tree.
    const internal = SITE_PATHS[pathname];
    if (internal) {
      const url = req.nextUrl.clone();
      url.pathname = internal;
      return NextResponse.rewrite(url);
    }
    // Internal site paths and assets pass through on the site host too.
    if (pathname === '/site') {
      const url = req.nextUrl.clone();
      url.pathname = '/site/de';
      return NextResponse.rewrite(url);
    }
    if (pathname.startsWith('/site')) return NextResponse.next();
    // Anything else is an app path on the wrong host — move it permanently.
    return NextResponse.redirect(new URL(pathname + req.nextUrl.search, APP_ORIGIN), REDIRECT_STATUS);
  }

  // App host (and everything else, e.g. localhost dev).
  if (pathname.startsWith('/site')) {
    // Dev: /site/* is directly reachable; in prod it only exists on the site host.
    if (isLocalDev(host)) return NextResponse.next();
    return NextResponse.redirect(new URL(pathname.slice(5) || '/', SITE_ORIGIN), REDIRECT_STATUS);
  }

  if (SITE_PATHS[pathname] && pathname !== '/') {
    if (!isProd) {
      // Dev fallback (Safari can't resolve site.localhost): serve the site in place.
      const url = req.nextUrl.clone();
      url.pathname = SITE_PATHS[pathname];
      return NextResponse.rewrite(url);
    }
    // Prod: legal shortcuts on the app host bounce to the site host.
    return NextResponse.redirect(new URL(pathname, SITE_ORIGIN), REDIRECT_STATUS);
  }

  // Dev convenience: /?site=1 previews the landing on localhost.
  if (isLocalDev(host) && pathname === '/' && req.nextUrl.searchParams.get('site') === '1') {
    const url = req.nextUrl.clone();
    url.pathname = '/site/de';
    url.searchParams.delete('site');
    return NextResponse.rewrite(url);
  }

  // Defense-in-depth for /admin (authorization itself is enforced by the API).
  if (pathname.startsWith('/admin')) {
    const accessValid = await hasValidAccessToken(req.cookies.get('accessToken')?.value);
    if (accessValid || req.cookies.has('refreshToken')) {
      const res = NextResponse.next();
      res.headers.set('X-Robots-Tag', 'noindex, nofollow');
      res.headers.set('Cache-Control', 'no-store');
      return res;
    }
    return redirectToLogin(req);
  }

  const res = NextResponse.next();
  // The app host is an app, not a website — never index it.
  res.headers.set('X-Robots-Tag', 'noindex');
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
