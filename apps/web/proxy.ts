import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { JWT_SECRET, NODE_ENV } from './lib/config/env.config';

function redirectToLogin(req: NextRequest) {
  const url = new URL('/login', req.url);
  url.searchParams.set('redirect', req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

async function hasValidAccessToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  // Fail closed in production without a secret; never verify against a default.
  if (!JWT_SECRET) return NODE_ENV !== 'production';
  try {
    await jwtVerify(token, new TextEncoder().encode(JWT_SECRET));
    return true;
  } catch {
    return false;
  }
}

/**
 * Defense-in-depth for /admin: bounce visitors without a session to the login page before any
 * admin UI loads. Authorization itself is enforced by the API on every request (permissions are
 * read from the database), so an expired access token with a refresh cookie may pass here and
 * is refreshed client-side.
 */
export async function proxy(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith('/admin')) return NextResponse.next();

  const accessValid = await hasValidAccessToken(req.cookies.get('accessToken')?.value);
  if (accessValid || req.cookies.has('refreshToken')) {
    const res = NextResponse.next();
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }
  return redirectToLogin(req);
}

export const config = {
  matcher: '/admin/:path*',
};
