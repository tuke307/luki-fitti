import { Suspense } from 'react';
import { connection } from 'next/server';
import { getProviderIds } from '@/lib/auth/provider-config';
import LoginForm from './login-form';

export default async function LoginPage() {
  // Provider ids are deployment config: read them per request, not at build time.
  await connection();
  const ids = getProviderIds();
  return (
    <Suspense>
      <LoginForm
        googleClientId={ids.googleClientId ?? undefined}
        appleServicesId={ids.appleServicesId ?? undefined}
        appleRedirectUri={ids.appleRedirectUri ?? undefined}
      />
    </Suspense>
  );
}
