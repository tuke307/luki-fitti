'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackPageview } from '@/lib/analytics/track';

/**
 * Sends an anonymous pageview whenever the route pathname changes. Uses only the pathname
 * (never search params) so tokens in auth links like /reset-password?token=… are never sent.
 */
export function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname) trackPageview(pathname);
  }, [pathname]);

  return null;
}
