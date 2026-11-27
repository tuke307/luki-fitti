'use client';

import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { Fingerprint } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';
import {
  appleUserName,
  generateOAuthNonce,
  renderGoogleButton,
  signInWithApple,
} from '@/lib/auth/oauth-providers';

export type ProviderSignInResult = 'ok' | 'mfa' | 'error';

export interface ProviderSignInButtonsProps {
  googleClientId?: string;
  appleServicesId?: string;
  appleRedirectUri?: string;
  onResult: (result: ProviderSignInResult) => void;
}

/** Official Apple logo mark (Apple HIG), currentColor so it inverts with the theme. */
function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 814 1000" className={className} aria-hidden="true" fill="currentColor">
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-124.4C33.9 798.9 0 663 0 541.8c0-192.5 124.9-294.4 247.6-294.4 65.1 0 119.4 42.7 160.5 42.7 39.5 0 101.4-46.2 176.7-46.2 28.5 0 130.9 2.6 203.3 97zM632.9 78.7c-29.7 36.1-75.5 64.4-121.5 60.9-5.8-46.9 16.9-96.1 44-125.9 29.4-33.6 79.5-58.9 120.6-61.6 4.6 47.6-13.1 95.4-43.1 126.6z" />
    </svg>
  );
}

/**
 * Google / Apple / passkey sign-in buttons + the "or" divider, shared by /login and
 * the Profile guest block. Each button renders only when its provider id is configured
 * (passkeys when WebAuthn is available); nothing renders when none apply.
 */
export default function ProviderSignInButtons({
  googleClientId,
  appleServicesId,
  appleRedirectUri,
  onResult,
}: ProviderSignInButtonsProps) {
  const { loginWithOAuth, loginWithPasskey, loading } = useAuth();
  const { t, locale } = useLocale();
  const webAuthnSupported = useSyncExternalStore(
    () => () => {},
    () => typeof window.PublicKeyCredential !== 'undefined',
    () => false,
  );
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleNonceRef = useRef('');

  const hasProviderButtons = Boolean(googleClientId || appleServicesId) || webAuthnSupported;

  // Render the official Google button once (a fresh nonce per render binds the ID token).
  useEffect(() => {
    const container = googleButtonRef.current;
    if (!googleClientId || !container) return;
    googleNonceRef.current = generateOAuthNonce();
    renderGoogleButton(
      container,
      googleClientId,
      googleNonceRef.current,
      (response) => {
        void loginWithOAuth('google', {
          idToken: response.credential,
          nonce: googleNonceRef.current,
        }).then(onResult);
      },
      // Fill the card on small phones; GIS only accepts 200–400px.
      { width: Math.min(400, Math.max(200, container.clientWidth)), locale },
    ).catch(() => {
      // GIS unavailable (offline/ad-blocker) — the password form still works.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleClientId]);

  const handleApple = async () => {
    if (!appleServicesId || !appleRedirectUri) return;
    try {
      const nonce = generateOAuthNonce();
      const response = await signInWithApple({
        clientId: appleServicesId,
        redirectURI: appleRedirectUri,
        nonce,
      });
      const result = await loginWithOAuth('apple', {
        idToken: response.authorization.id_token,
        nonce,
        name: appleUserName(response),
        authorizationCode: response.authorization.code,
      });
      onResult(result);
    } catch {
      // Popup dismissed or Apple JS unavailable — no error worth showing.
    }
  };

  const handlePasskey = async () => {
    const ok = await loginWithPasskey();
    onResult(ok ? 'ok' : 'error');
  };

  if (!hasProviderButtons) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="bg-border h-px flex-1" />
        <span className="text-muted-foreground text-xs">{t.auth.orDivider}</span>
        <div className="bg-border h-px flex-1" />
      </div>

      {googleClientId && (
        <div
          ref={googleButtonRef}
          aria-label={t.auth.continueWithGoogle}
          className="flex justify-center"
          data-testid="google-signin-button"
        />
      )}

      {appleServicesId && (
        <Button
          type="button"
          disabled={loading}
          onClick={() => void handleApple()}
          // Apple HIG: black on light, white on dark — matches the 40px GIS button.
          className="h-10 w-full rounded-md border border-black bg-black text-white hover:bg-black/90 dark:border-white dark:bg-white dark:text-black dark:hover:bg-white/90"
        >
          <AppleLogo className="h-4 w-4" /> {t.auth.continueWithApple}
        </Button>
      )}

      {webAuthnSupported && (
        <Button
          type="button"
          variant="secondary"
          disabled={loading}
          onClick={() => void handlePasskey()}
          className="h-10 w-full rounded-md"
        >
          <Fingerprint className="h-4 w-4" /> {t.auth.passkeySignInBtn}
        </Button>
      )}
    </div>
  );
}
