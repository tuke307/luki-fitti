import { ANALYTICS_MAX_URL_LENGTH, stripUrlQuery } from '@luki-fitti/common/schemas';
import { isAnalyticsOptedOut } from './opt-out';

/**
 * Same-origin first-party collector (NestJS, see apps/api web-analytics module). The browser
 * never contacts Umami directly and never reads screen size, navigator.language, document.title
 * or other device information (§25 TDDDG); the server only forwards path + referrer.
 */
export const ANALYTICS_COLLECT_PATH = '/api/analytics/collect';

// Defence in depth: tokens are passed via query strings (always stripped), but never send a path
// that contains a long opaque segment that could be a token, id or secret.
const TOKEN_LIKE_SEGMENT = /^[A-Za-z0-9_-]{24,}$/;

export interface PageviewPayload {
  type: 'pageview';
  url: string;
  referrer?: string;
}

export function containsTokenLikeSegment(path: string): boolean {
  return path.split('/').some((segment) => TOKEN_LIKE_SEGMENT.test(segment));
}

/** Returns the cross-origin referrer without query/fragment, or undefined. */
export function sanitizeReferrer(referrer: string, currentOrigin: string): string | undefined {
  if (!referrer) return undefined;
  try {
    const parsed = new URL(referrer);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined;
    if (parsed.origin === currentOrigin) return undefined;
    const value = stripUrlQuery(`${parsed.origin}${parsed.pathname}`);
    return value.length <= ANALYTICS_MAX_URL_LENGTH ? value : parsed.origin;
  } catch {
    return undefined;
  }
}

/** Builds the collector payload, or null if the path must not be tracked. */
export function buildPageviewPayload(
  path: string,
  referrer: string | undefined,
  currentOrigin: string,
): PageviewPayload | null {
  const url = stripUrlQuery(path);
  if (!url.startsWith('/') || url.startsWith('//')) return null;
  if (url.length > ANALYTICS_MAX_URL_LENGTH || containsTokenLikeSegment(url)) return null;

  const safeReferrer = referrer ? sanitizeReferrer(referrer, currentOrigin) : undefined;
  return safeReferrer ? { type: 'pageview', url, referrer: safeReferrer } : { type: 'pageview', url };
}

let hasTrackedFirstPageview = false;

/** Sends an anonymous pageview. No-op on the server, outside production and when opted out. */
export function trackPageview(path: string): void {
  if (typeof window === 'undefined') return;
  if (process.env.NODE_ENV !== 'production') return;
  if (isAnalyticsOptedOut()) return;

  // External referrer is only meaningful for the landing pageview of this page load.
  const referrer = hasTrackedFirstPageview ? undefined : document.referrer;
  hasTrackedFirstPageview = true;

  const payload = buildPageviewPayload(path, referrer, window.location.origin);
  if (!payload) return;

  try {
    void fetch(ANALYTICS_COLLECT_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
      // No cookies: the collector never needs to know who the visitor is.
      credentials: 'omit',
    }).catch(() => undefined);
  } catch {
    // Offline or fetch unavailable: pageviews are best-effort and never queued.
  }
}
