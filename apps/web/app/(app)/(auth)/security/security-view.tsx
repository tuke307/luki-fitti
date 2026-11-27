'use client';

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Apple,
  BadgeCheck,
  Copy,
  Download,
  Fingerprint,
  KeyRound,
  Pencil,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import QRCode from 'qrcode';
import { Badge } from '@luki-fitti/ui/components/ui/badge';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Card } from '@luki-fitti/ui/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@luki-fitti/ui/components/ui/dialog';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { Label } from '@luki-fitti/ui/components/ui/label';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';
import {
  appleUserName,
  generateOAuthNonce,
  renderGoogleButton,
  signInWithApple,
} from '@/lib/auth/oauth-providers';
import { downloadRecoveryCodes } from '@/lib/auth/recovery-codes';
import type { OAuthProviderName, PasskeyDto, SecurityStatusDto } from '@luki-fitti/common/schemas';

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

export interface SecurityViewProps {
  googleClientId?: string;
  appleServicesId?: string;
  appleRedirectUri?: string;
}

export default function SecurityView({
  googleClientId,
  appleServicesId,
  appleRedirectUri,
}: SecurityViewProps) {
  const router = useRouter();
  const { isAuthenticated, user, loading: authLoading } = useAuth();
  const { t, format, locale } = useLocale();

  const [status, setStatus] = useState<SecurityStatusDto | null>(null);
  const [loadError, setLoadError] = useState(false);
  const webAuthnSupported = useSyncExternalStore(
    () => () => {},
    () => typeof window.PublicKeyCredential !== 'undefined',
    () => false,
  );

  const [unlinkTarget, setUnlinkTarget] = useState<OAuthProviderName | null>(null);
  const [deletePasskeyTarget, setDeletePasskeyTarget] = useState<PasskeyDto | null>(null);
  const [renameTarget, setRenameTarget] = useState<PasskeyDto | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [newPasskeyName, setNewPasskeyName] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 2FA setup state machine: off → 'setup' (QR shown) → 'codes' (recovery codes shown once)
  const [twoFactorPhase, setTwoFactorPhase] = useState<'idle' | 'setup' | 'codes'>('idle');
  const [setupData, setSetupData] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState<'secret' | 'codes' | null>(null);
  const [codeDialog, setCodeDialog] = useState<'disable' | 'regenerate' | null>(null);
  const [dialogCode, setDialogCode] = useState('');

  const googleLinkRef = useRef<HTMLDivElement>(null);
  const linkNonceRef = useRef('');

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  const refreshStatus = useCallback(async () => {
    try {
      const res = await api.security.status();
      if (res.success && res.data) {
        setStatus(res.data);
        setLoadError(false);
      } else {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login?redirect=/security');
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    api.security
      .status()
      .then((res) => {
        if (res.success && res.data) {
          setStatus(res.data);
          setLoadError(false);
        } else {
          setLoadError(true);
        }
      })
      .catch(() => setLoadError(true));
  }, [isAuthenticated]);

  // Render Google's button for account linking on the security page.
  useEffect(() => {
    const container = googleLinkRef.current;
    if (!googleClientId || !container || status?.providers.includes('google')) return;
    linkNonceRef.current = generateOAuthNonce();
    renderGoogleButton(
      container,
      googleClientId,
      linkNonceRef.current,
      (response) => {
        void run(async () => {
          const res = await api.security.linkProvider('google', {
            idToken: response.credential,
            nonce: linkNonceRef.current,
          });
          if (!res.success) throw new Error(res.error || 'Link failed');
        });
      },
      // Compact, label-sized pill so it fits the row next to "Google" like Apple's Link button.
      { size: 'medium', shape: 'pill', text: 'signin', locale },
    ).catch(() => {
      // GIS unavailable — the Link button simply doesn't render.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleClientId, status?.providers]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      await refreshStatus();
    } catch (err) {
      setActionError(errorMessage(err, 'Something went wrong'));
    } finally {
      setBusy(false);
    }
  }

  const linkApple = () =>
    run(async () => {
      if (!appleServicesId || !appleRedirectUri) return;
      const nonce = generateOAuthNonce();
      const response = await signInWithApple({
        clientId: appleServicesId,
        redirectURI: appleRedirectUri,
        nonce,
      });
      const res = await api.security.linkProvider('apple', {
        idToken: response.authorization.id_token,
        nonce,
        name: appleUserName(response),
        authorizationCode: response.authorization.code,
      });
      if (!res.success) throw new Error(res.error || 'Link failed');
    });

  const unlinkProvider = (provider: OAuthProviderName) =>
    run(async () => {
      const res = await api.security.unlinkProvider(provider);
      if (!res.success) throw new Error(res.error || 'Unlink failed');
      setUnlinkTarget(null);
    });

  const addPasskey = () =>
    run(async () => {
      const optionsRes = await api.security.passkeyRegisterOptions();
      if (!optionsRes.success || !optionsRes.data) {
        throw new Error(optionsRes.error || 'Could not start passkey registration');
      }
      const { startRegistration } = await import('@simplewebauthn/browser');
      const response = await startRegistration({
        optionsJSON: optionsRes.data as never,
      });
      const verifyRes = await api.security.passkeyRegisterVerify({
        response: response as unknown as Record<string, unknown>,
        name: newPasskeyName.trim() || undefined,
      });
      if (!verifyRes.success) throw new Error(verifyRes.error || 'Passkey registration failed');
      setNewPasskeyName('');
    });

  const renamePasskey = () =>
    run(async () => {
      if (!renameTarget || !renameValue.trim()) return;
      const res = await api.security.renamePasskey(renameTarget.id, { name: renameValue.trim() });
      if (!res.success) throw new Error(res.error || 'Rename failed');
      setRenameTarget(null);
    });

  const deletePasskey = () =>
    run(async () => {
      if (!deletePasskeyTarget) return;
      const res = await api.security.deletePasskey(deletePasskeyTarget.id);
      if (!res.success) throw new Error(res.error || 'Delete failed');
      setDeletePasskeyTarget(null);
    });

  const startTwoFactorSetup = () =>
    run(async () => {
      const res = await api.security.twoFactorSetup();
      if (!res.success || !res.data) throw new Error(res.error || 'Setup failed');
      const qrDataUrl = await QRCode.toDataURL(res.data.otpauthUrl, { width: 200, margin: 1 });
      setSetupData({ secret: res.data.secret, qrDataUrl });
      setTwoFactorPhase('setup');
      setSetupCode('');
    });

  const enableTwoFactor = () =>
    run(async () => {
      const res = await api.security.twoFactorEnable({ code: setupCode.trim() });
      if (!res.success || !res.data) throw new Error(res.error || 'Invalid code');
      setRecoveryCodes(res.data.recoveryCodes);
      setTwoFactorPhase('codes');
    });

  /** `disable` and `regenerate` both need a current code — same dialog, different call. */
  const submitCodeDialog = () =>
    run(async () => {
      const code = dialogCode.trim();
      if (!code) return;
      if (codeDialog === 'disable') {
        const res = await api.security.twoFactorDisable({ code });
        if (!res.success) throw new Error(res.error || 'Invalid code');
        setTwoFactorPhase('idle');
      } else if (codeDialog === 'regenerate') {
        const res = await api.security.regenerateRecoveryCodes({ code });
        if (!res.success || !res.data) throw new Error(res.error || 'Invalid code');
        setRecoveryCodes(res.data.recoveryCodes);
        setTwoFactorPhase('codes');
      }
      setCodeDialog(null);
      setDialogCode('');
    });

  const copyText = async (text: string, which: 'secret' | 'codes') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard unavailable (permissions) — nothing to show.
    }
  };

  if (authLoading || !isAuthenticated) {
    return (
      <div className="bg-background flex min-h-dvh items-center justify-center p-4">
        <p className="text-muted-foreground text-xs">{t.security.loadingStatus}</p>
      </div>
    );
  }

  const providerLabel = (p: OAuthProviderName) =>
    p === 'google' ? t.security.providerGoogle : t.security.providerApple;

  const providerRow = (provider: OAuthProviderName) => {
    const linked = status?.providers.includes(provider) ?? false;
    const canLink =
      !linked && (provider === 'google' ? Boolean(googleClientId) : Boolean(appleServicesId));
    return (
      <li key={provider} className="flex items-center justify-between gap-3 py-3">
        <div className="flex items-center gap-3">
          {provider === 'google' ? (
            <BadgeCheck className="text-muted-foreground h-4 w-4" />
          ) : (
            <Apple className="text-muted-foreground h-4 w-4" />
          )}
          <span className="text-sm font-medium">{providerLabel(provider)}</span>
        </div>
        <div className="flex items-center gap-2">
          {linked ? (
            <>
              <Badge variant="secondary">{t.security.linkedBadge}</Badge>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setUnlinkTarget(provider)}
              >
                {t.security.unlinkBtn}
              </Button>
            </>
          ) : provider === 'google' ? (
            <div
              ref={googleLinkRef}
              aria-label={t.security.linkBtn}
              className="max-w-full shrink-0"
            />
          ) : canLink ? (
            <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={linkApple}>
              {t.security.linkBtn}
            </Button>
          ) : (
            <Badge variant="outline">{t.security.notLinkedBadge}</Badge>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="bg-background min-h-dvh p-4">
      <div className="mx-auto w-full max-w-md space-y-6">
        <h1 className="flex items-center gap-2 font-display text-xl font-bold">
          <ShieldCheck className="h-5 w-5" /> {t.security.pageTitle}
        </h1>

        {loadError && <p className="text-destructive text-xs">{t.security.unavailableStatus}</p>}
        {actionError && <p className="text-destructive text-xs">{actionError}</p>}

        {/* ── Sign-in methods ─────────────────────────────────────────────── */}
        <Card className="rounded-3xl p-6">
          <h2 className="text-sm font-semibold">{t.security.methodsTitle}</h2>
          <ul className="divide-border divide-y">
            <li className="flex items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-3">
                <KeyRound className="text-muted-foreground h-4 w-4" />
                <span className="text-sm font-medium">{t.security.passwordRow}</span>
              </div>
              {status?.hasPassword ? (
                <Button type="button" variant="ghost" size="sm" asChild>
                  <Link href="/change-password">{t.profile.changePasswordBtn}</Link>
                </Button>
              ) : (
                <div className="text-right">
                  <Button type="button" variant="secondary" size="sm" asChild>
                    <Link href="/forgot-password">{t.security.setPasswordBtn}</Link>
                  </Button>
                  <p className="text-muted-foreground mt-1 max-w-52 text-[0.6875rem]">
                    {t.security.setPasswordHint}
                  </p>
                </div>
              )}
            </li>
            {providerRow('google')}
            {providerRow('apple')}
          </ul>
        </Card>

        {/* ── Passkeys ────────────────────────────────────────────────────── */}
        <Card className="rounded-3xl p-6">
          <h2 className="text-sm font-semibold">{t.security.passkeysTitle}</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">{t.security.passkeysSub}</p>
          <ul className="divide-border divide-y">
            {status?.passkeys.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Fingerprint className="text-muted-foreground h-4 w-4 shrink-0" />
                    <span className="truncate text-sm font-medium">{p.name}</span>
                    {p.backedUp && (
                      <Badge variant="secondary">{t.security.passkeySyncedBadge}</Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-[0.6875rem]">
                    {format(t.security.passkeyCreatedLabel, { date: fmtDate(p.createdAt) })}
                    {' · '}
                    {p.lastUsedAt
                      ? format(t.security.passkeyLastUsedLabel, { date: fmtDate(p.lastUsedAt) })
                      : t.security.passkeyNeverUsed}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t.security.renamePasskeyBtn}
                    disabled={busy}
                    onClick={() => {
                      setRenameTarget(p);
                      setRenameValue(p.name);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t.common.delete}
                    disabled={busy}
                    onClick={() => setDeletePasskeyTarget(p)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {webAuthnSupported ? (
            <div className="mt-3 space-y-2">
              <Input
                value={newPasskeyName}
                onChange={(e) => setNewPasskeyName(e.target.value)}
                placeholder={t.security.passkeyNamePlaceholder}
                maxLength={40}
                className="h-9"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void addPasskey()}
                className="w-full"
              >
                <Fingerprint className="h-4 w-4" /> {t.security.addPasskeyBtn}
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground mt-3 text-xs">{t.security.passkeyUnsupported}</p>
          )}
        </Card>

        {/* ── Two-factor authentication ───────────────────────────────────── */}
        <Card className="rounded-3xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">{t.security.twoFactorTitle}</h2>
              <p className="text-muted-foreground mt-0.5 text-xs">{t.security.twoFactorOptional}</p>
            </div>
            <Badge variant={status?.twoFactorEnabled ? 'default' : 'outline'}>
              {status?.twoFactorEnabled ? t.security.twoFactorOn : t.security.twoFactorOff}
            </Badge>
          </div>

          {twoFactorPhase === 'setup' && setupData && (
            <div className="mt-4 space-y-3">
              <p className="text-muted-foreground text-xs">{t.security.setupScanHint}</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- data: URL QR code */}
              <img
                src={setupData.qrDataUrl}
                alt="TOTP QR code"
                className="mx-auto rounded-xl border bg-white p-2"
                width={200}
                height={200}
              />
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">{t.security.manualEntryLabel}</p>
                <div className="flex items-center gap-2">
                  <code
                    data-testid="totp-secret"
                    className="bg-muted flex-1 rounded-lg px-2.5 py-1.5 text-xs break-all"
                  >
                    {setupData.secret}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void copyText(setupData.secret, 'secret')}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copied === 'secret' ? t.security.copiedBtn : t.security.copyBtn}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="totp-setup-code" className="text-xs font-semibold">
                  {t.security.codeLabel}
                </Label>
                <Input
                  id="totp-setup-code"
                  value={setupCode}
                  onChange={(e) => setSetupCode(e.target.value)}
                  placeholder={t.auth.mfaCodePlaceholder}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  className="h-10"
                />
                <p className="text-muted-foreground text-[0.6875rem]">{t.security.enterCodeHint}</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setTwoFactorPhase('idle')}
                >
                  {t.common.cancel}
                </Button>
                <Button
                  type="button"
                  disabled={busy || !setupCode.trim()}
                  onClick={() => void enableTwoFactor()}
                >
                  {t.security.enableTwoFactorBtn}
                </Button>
              </div>
            </div>
          )}

          {twoFactorPhase === 'codes' && recoveryCodes && (
            <div className="mt-4 space-y-3">
              <div>
                <h3 className="text-xs font-semibold">{t.security.recoveryTitle}</h3>
                <p className="text-destructive mt-0.5 text-xs">{t.security.recoveryWarning}</p>
              </div>
              <ul
                data-testid="recovery-codes"
                className="bg-muted grid grid-cols-2 gap-1 rounded-xl p-3 font-mono text-xs"
              >
                {recoveryCodes.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void copyText(recoveryCodes.join('\n'), 'codes')}
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied === 'codes' ? t.security.copiedBtn : t.security.copyBtn}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => downloadRecoveryCodes(recoveryCodes, user?.email ?? '')}
                >
                  <Download className="h-3.5 w-3.5" /> {t.security.downloadTxtBtn}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="ml-auto"
                  onClick={() => {
                    setRecoveryCodes(null);
                    setTwoFactorPhase('idle');
                  }}
                >
                  {t.security.savedCodesAckBtn}
                </Button>
              </div>
            </div>
          )}

          {twoFactorPhase === 'idle' &&
            (status?.twoFactorEnabled ? (
              <div className="mt-4 space-y-3">
                <p className="text-muted-foreground text-xs">
                  {format(t.security.remainingCodes, {
                    count: status.recoveryCodesRemaining,
                  })}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setDialogCode('');
                      setCodeDialog('regenerate');
                    }}
                  >
                    {t.security.regenerateCodesBtn}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    className="hover:bg-destructive/20 hover:text-destructive"
                    onClick={() => {
                      setDialogCode('');
                      setCodeDialog('disable');
                    }}
                  >
                    {t.security.turnOffTwoFactorBtn}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="secondary"
                disabled={busy || !status}
                onClick={() => void startTwoFactorSetup()}
                className="mt-4 w-full"
              >
                {t.security.turnOnTwoFactorBtn}
              </Button>
            ))}
        </Card>
      </div>

      {/* ── Unlink provider confirm ───────────────────────────────────────── */}
      <Dialog open={unlinkTarget !== null} onOpenChange={() => setUnlinkTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {format(t.security.unlinkConfirmTitle, {
                provider: providerLabel(unlinkTarget ?? 'google'),
              })}
            </DialogTitle>
            <DialogDescription>
              {format(t.security.unlinkConfirmDesc, {
                provider: providerLabel(unlinkTarget ?? 'google'),
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setUnlinkTarget(null)}>
              {t.common.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => unlinkTarget && void unlinkProvider(unlinkTarget)}
            >
              {t.security.unlinkBtn}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Rename passkey ────────────────────────────────────────────────── */}
      <Dialog open={renameTarget !== null} onOpenChange={() => setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.security.renamePasskeyBtn}</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder={t.security.passkeyNamePlaceholder}
            maxLength={40}
            className="h-10"
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setRenameTarget(null)}>
              {t.common.cancel}
            </Button>
            <Button
              type="button"
              disabled={busy || !renameValue.trim()}
              onClick={() => void renamePasskey()}
            >
              {t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete passkey confirm ────────────────────────────────────────── */}
      <Dialog open={deletePasskeyTarget !== null} onOpenChange={() => setDeletePasskeyTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.security.deletePasskeyTitle}</DialogTitle>
            <DialogDescription>
              {format(t.security.deletePasskeyDesc, { name: deletePasskeyTarget?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDeletePasskeyTarget(null)}>
              {t.common.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void deletePasskey()}
            >
              {t.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 2FA code dialog (disable / regenerate) ────────────────────────── */}
      <Dialog open={codeDialog !== null} onOpenChange={() => setCodeDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.security.codeDialogTitle}</DialogTitle>
            <DialogDescription>{t.security.codeDialogDesc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="security-code" className="text-xs font-semibold">
              {t.security.codeLabel}
            </Label>
            <Input
              id="security-code"
              value={dialogCode}
              onChange={(e) => setDialogCode(e.target.value)}
              placeholder={t.auth.mfaCodePlaceholder}
              autoComplete="one-time-code"
              className="h-10"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCodeDialog(null)}>
              {t.common.cancel}
            </Button>
            <Button
              type="button"
              disabled={busy || !dialogCode.trim()}
              onClick={() => void submitCodeDialog()}
            >
              {t.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
