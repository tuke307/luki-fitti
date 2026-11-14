import { NextResponse } from 'next/server';
import { APPLE_APP_IDS } from '@/lib/config/env.config';

/**
 * Apple universal links for `/invite/*`. 404 when the app ids aren't
 * configured, so the route can't leak a half-configured file.
 */
export function GET() {
  const appIDs = (APPLE_APP_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (appIDs.length === 0) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.json(
    {
      applinks: {
        details: [{ appIDs, components: [{ '/': '/invite/*' }] }],
      },
    },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
