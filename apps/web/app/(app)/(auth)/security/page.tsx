import { Suspense } from 'react';
import { connection } from 'next/server';
import { APP_ORIGIN } from '@/lib/site/config';
import {
  APPLE_WEB_REDIRECT_URI,
  APPLE_WEB_SERVICES_ID,
  GOOGLE_WEB_CLIENT_ID,
} from '@/lib/config/env.config';
import SecurityView from './security-view';

export default async function SecurityPage() {
  // Provider ids are deployment config: read them per request, not at build time.
  await connection();
  return (
    <Suspense>
      <SecurityView
        googleClientId={GOOGLE_WEB_CLIENT_ID}
        appleServicesId={APPLE_WEB_SERVICES_ID}
        appleRedirectUri={APPLE_WEB_REDIRECT_URI ?? `${APP_ORIGIN}/login`}
      />
    </Suspense>
  );
}
