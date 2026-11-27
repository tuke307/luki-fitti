'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Apple,
  Dumbbell,
  Fingerprint,
  LogIn,
  MailCheck,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Card } from '@luki-fitti/ui/components/ui/card';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { Label } from '@luki-fitti/ui/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@luki-fitti/ui/components/ui/tabs';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';
import { postAuthPath } from '@/lib/social/pending-invite';
import { apiErrorMessage } from '@/lib/api';
import {
  appleUserName,
  generateOAuthNonce,
  renderGoogleButton,
  signInWithApple,
} from '@/lib/auth/oauth-providers';

/** Only same-origin paths are accepted, so `?redirect=` can't send users to another site. */
function safeRedirect(target: string | null): string {
  return target && target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\')
    ? target
    : '/';
}

export interface LoginFormProps {
  googleClientId?: string;
  appleServicesId?: string;
  appleRedirectUri?: string;
}

export default function LoginForm({
  googleClientId,
  appleServicesId,
  appleRedirectUri,
}: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get('redirect');
  // Read at navigation time: a pending invite may have been stored after the first render.
  const nextPath = () => (redirectParam ? safeRedirect(redirectParam) : postAuthPath());
  const {
    login,
    register,
    resendConfirmation,
    continueOfflineLocal,
    verifyMfa,
    cancelMfa,
    loginWithOAuth,
    loginWithPasskey,
    mfaPending,
    error,
    infoMessage,
    loading,
  } = useAuth();
  const { t, locale } = useLocale();
  const [mode, setMode] = useState<'login' | 'register'>(
    searchParams.get('mode') === 'register' ? 'register' : 'login',
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
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
        }).then((result) => {
          if (result === 'ok') router.push(nextPath());
        });
      },
      // Fill the card on small phones; GIS only accepts 200–400px.
      { width: Math.min(400, Math.max(200, container.clientWidth)), locale },
    ).catch(() => {
      // GIS unavailable (offline/ad-blocker) — the password form still works.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleClientId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result =
      mode === 'login'
        ? await login(email, password)
        : (await register({ email, password, name: name || undefined }))
          ? 'ok'
          : 'error';
    if (result === 'ok') {
      router.push(nextPath());
    }
    // 'mfa' → the MFA step below replaces the form (mfaPending from context).
  };

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
      if (result === 'ok') router.push(nextPath());
    } catch {
      // Popup dismissed or Apple JS unavailable — no error worth showing.
    }
  };

  const handlePasskey = async () => {
    const ok = await loginWithPasskey();
    if (ok) router.push(nextPath());
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await verifyMfa(mfaCode.trim());
    if (ok) router.push(nextPath());
  };

  const errorBlock = error && (
    <div className="space-y-2">
      <p className="text-destructive text-xs" role="alert">
        {apiErrorMessage(error, t.errors)}
      </p>
      {(error.code === 'EMAIL_NOT_VERIFIED' ||
        error.message.toLowerCase().includes('confirm your email')) &&
        email.trim() && (
          <Button
            type="button"
            variant="secondary"
            size="xs"
            disabled={loading}
            onClick={() => void resendConfirmation(email.trim())}
          >
            <MailCheck className="h-3.5 w-3.5" /> {t.profile.resendConfirmationBtn}
          </Button>
        )}
    </div>
  );

  return (
    <div className="bg-background flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-md space-y-6 rounded-3xl p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="bg-primary text-primary-foreground flex h-10 w-10 items-center justify-center rounded-xl font-semibold">
              <Dumbbell className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[1.0625rem] font-semibold">LukiFitti</span>
              <span className="text-muted-foreground block text-xs">{t.nav.tagline}</span>
            </div>
          </Link>
        </div>

        {mfaPending ? (
          <form onSubmit={handleMfaSubmit} className="space-y-4">
            <div className="space-y-1">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                <ShieldCheck className="h-5 w-5" /> {t.auth.mfaTitle}
              </h2>
              <p className="text-muted-foreground text-xs">{t.auth.mfaSub}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mfa-code" className="text-xs font-semibold">
                {t.auth.mfaCodeLabel}
              </Label>
              <Input
                id="mfa-code"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder={t.auth.mfaCodePlaceholder}
                autoComplete="one-time-code"
                inputMode="numeric"
                required
                autoFocus
                className="h-10"
              />
            </div>
            {errorBlock}
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={loading}
                onClick={() => {
                  setMfaCode('');
                  cancelMfa();
                }}
              >
                {t.auth.mfaBackBtn}
              </Button>
              <Button type="submit" disabled={loading || !mfaCode.trim()}>
                {t.auth.mfaVerifyBtn}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <Tabs value={mode} onValueChange={(val) => setMode(val as 'login' | 'register')}>
              <TabsList className="w-full">
                <TabsTrigger value="login">{t.auth.signInTab}</TabsTrigger>
                <TabsTrigger value="register">{t.auth.createAccountTab}</TabsTrigger>
              </TabsList>
            </Tabs>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs font-semibold">
                    {t.auth.nameLabel}
                  </Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="GymBuddy"
                    className="h-10"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold">
                  {t.auth.emailLabel}
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="athlete@example.com"
                  className="h-10"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-semibold">
                    {t.auth.passwordLabel}
                  </Label>
                  {mode === 'login' && (
                    <Link
                      href="/forgot-password"
                      className="text-primary text-xs font-semibold hover:underline"
                    >
                      {t.auth.forgotPasswordLink}
                    </Link>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.auth.passwordMinHint}
                  className="h-10"
                />
              </div>

              {infoMessage && (
                <div className="border-primary/40 bg-primary/12 text-primary space-y-2 rounded-2xl border p-3.5 text-xs">
                  <div className="flex items-start gap-2">
                    <MailCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{infoMessage}</span>
                  </div>
                  {email.trim() && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      disabled={loading}
                      onClick={() => void resendConfirmation(email.trim())}
                    >
                      {t.profile.resendConfirmationBtn}
                    </Button>
                  )}
                </div>
              )}

              {errorBlock}

              <Button type="submit" size="lg" disabled={loading} className="w-full">
                {mode === 'login' ? (
                  <>
                    <LogIn className="h-4 w-4" /> {t.auth.signInBtn}
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" /> {t.auth.registerBtn}
                  </>
                )}
              </Button>
            </form>

            {hasProviderButtons && (
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
                  />
                )}

                {appleServicesId && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={loading}
                    onClick={() => void handleApple()}
                    className="w-full"
                  >
                    <Apple className="h-4 w-4" /> {t.auth.continueWithApple}
                  </Button>
                )}

                {webAuthnSupported && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={loading}
                    onClick={() => void handlePasskey()}
                    className="w-full"
                  >
                    <Fingerprint className="h-4 w-4" /> {t.auth.passkeySignInBtn}
                  </Button>
                )}
              </div>
            )}
          </>
        )}

        <div className="border-t pt-4 text-center">
          <Button
            type="button"
            variant="link"
            onClick={() => {
              continueOfflineLocal();
              router.push('/');
            }}
            className="text-muted-foreground hover:text-foreground text-xs font-semibold"
          >
            {t.auth.continueGuestBtn}
          </Button>
        </div>
      </Card>
      <nav className="text-muted-foreground mt-4 flex justify-center gap-4 text-xs">
        <a
          href={`${locale === 'de' ? '/impressum' : '/en/imprint'}`}
          className="hover:text-foreground"
        >
          {t.profile.rowImprint}
        </a>
        <a
          href={`${locale === 'de' ? '/datenschutz' : '/en/privacy'}`}
          className="hover:text-foreground"
        >
          {t.profile.rowPrivacy}
        </a>
        <a
          href={`${locale === 'de' ? '/nutzungsbedingungen' : '/en/terms'}`}
          className="hover:text-foreground"
        >
          {t.profile.rowTerms}
        </a>
      </nav>
    </div>
  );
}
