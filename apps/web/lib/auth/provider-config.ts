import { APP_ORIGIN } from '@/lib/site/config';
import {
  APPLE_WEB_REDIRECT_URI,
  APPLE_WEB_SERVICES_ID,
  GOOGLE_WEB_CLIENT_ID,
} from '@/lib/config/env.config';

export interface ProviderIds {
  googleClientId: string | null;
  appleServicesId: string | null;
  appleRedirectUri: string | null;
}

/** Pure resolution: null ids hide the buttons; the redirect uri defaults to `<origin>/login`. */
export function resolveProviderIds(env: {
  googleClientId?: string;
  appleServicesId?: string;
  appleRedirectUri?: string;
  appOrigin: string;
}): ProviderIds {
  const appleServicesId = env.appleServicesId ?? null;
  return {
    googleClientId: env.googleClientId ?? null,
    appleServicesId,
    appleRedirectUri: appleServicesId ? (env.appleRedirectUri ?? `${env.appOrigin}/login`) : null,
  };
}

/**
 * Web sign-in provider ids, read per request (deployment config, not build-time).
 * Shared by login/page.tsx and the /auth-providers route the app shell fetches.
 */
export function getProviderIds(): ProviderIds {
  return resolveProviderIds({
    googleClientId: GOOGLE_WEB_CLIENT_ID,
    appleServicesId: APPLE_WEB_SERVICES_ID,
    appleRedirectUri: APPLE_WEB_REDIRECT_URI,
    appOrigin: APP_ORIGIN,
  });
}
