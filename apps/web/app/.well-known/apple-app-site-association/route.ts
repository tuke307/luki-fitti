import { NextResponse } from 'next/server';
import { APPLE_APP_IDS } from '@/lib/config/env.config';
import { buildAppleAppSiteAssociation } from '@/lib/config/aasa';

/**
 * Apple universal links for `/invite/*`. 404 when the app ids aren't
 * configured, so the route can't leak a half-configured file.
 */
export function GET() {
  const body = buildAppleAppSiteAssociation(APPLE_APP_IDS);
  if (!body) return new NextResponse(null, { status: 404 });
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
