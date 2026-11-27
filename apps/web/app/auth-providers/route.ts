import { NextResponse } from 'next/server';
import { getProviderIds } from '@/lib/auth/provider-config';

// The ids are deployment env — evaluate per request, never prerender.
export const dynamic = 'force-dynamic';

/**
 * Serves the public OAuth client ids to the app shell (signed-out Profile block) so
 * `/` can stay static/offline-friendly. Client ids are public, not secrets.
 */
export async function GET() {
  return NextResponse.json(getProviderIds(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
