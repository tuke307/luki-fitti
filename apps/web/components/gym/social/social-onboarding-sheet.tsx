'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Switch } from '@luki-fitti/ui/components/ui/switch';
import { toast } from '@luki-fitti/ui/components/ui/sonner';
import { useLocale } from '@/providers/i18n/locale-context';
import type { SocialProfileDto } from '@luki-fitti/common/schemas';
import { normalizeHandle } from '@luki-fitti/common/utils';
import { socialApi } from '@/lib/social/social-api';
import { prepareImageForUpload } from '@/lib/images/prepare-image';
import {
  enablePushOnThisDevice,
  fetchPushConfig,
  isIosStandaloneRequired,
  isWebPushSupported,
} from '@/lib/push/web-push';
import { MobileSheet } from '../mobile-sheet';
import { UserAvatar } from './user-avatar';
import { HandleField, type HandleStatus } from './handle-field';

/**
 * First-run social setup: handle with live availability, optional avatar,
 * "Find me by email" (default on) and a push opt-in button.
 */
export function SocialOnboardingSheet({
  open,
  onOpenChange,
  profile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: SocialProfileDto | null;
}) {
  const { t } = useLocale();
  const [handle, setHandle] = useState('');
  const [emailLookup, setEmailLookup] = useState(true);
  const [status, setStatus] = useState<HandleStatus>({ state: 'idle' });
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [pushKey, setPushKey] = useState<string | null>(null);
  const [pushDone, setPushDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Initialize fields when the sheet opens (documented render-phase adjust pattern).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setHandle(profile?.handle ?? '');
      setEmailLookup(profile?.discoverableByEmail ?? true);
      setAvatarUrl(profile?.avatarUrl ?? null);
      setStatus({ state: 'idle' });
    }
  }

  useEffect(() => {
    if (!open || !isWebPushSupported()) return;
    void fetchPushConfig().then((c) => setPushKey(c?.webPushPublicKey ?? null));
  }, [open]);

  const save = async () => {
    const normalized = normalizeHandle(handle);
    if (!normalized) return;
    setSaving(true);
    try {
      const res = await socialApi.updateMe({
        handle: normalized,
        discoverableByEmail: emailLookup,
      });
      if (res.success) onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '');
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    const jpeg = await prepareImageForUpload(file);
    const res = await socialApi.uploadAvatar(jpeg);
    if (res.success) setAvatarUrl(res.data?.avatarUrl ?? avatarUrl);
  };

  const enablePush = async () => {
    if (!pushKey) return;
    const ok = await enablePushOnThisDevice(pushKey);
    setPushDone(ok);
  };

  const canSave =
    normalizeHandle(handle).length > 0 &&
    status.state !== 'checking' &&
    status.state !== 'unavailable';

  return (
    <MobileSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t.social.onboardingTitle}
      cancelLabel={t.social.onboardingLater}
      confirm={{
        label: t.social.onboardingDone,
        onConfirm: () => void save(),
        disabled: !canSave,
        loading: saving,
      }}
      data-testid="social-onboarding-sheet"
    >
      <p className="text-muted-foreground mb-5 text-[0.9375rem]">{t.social.onboardingBody}</p>
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <UserAvatar avatarUrl={avatarUrl} handle={handle} className="size-16" />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadAvatar(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="text-primary text-[0.9375rem] font-medium"
            onClick={() => fileRef.current?.click()}
            data-testid="onboarding-avatar-btn"
          >
            {t.social.avatarChange}
          </button>
        </div>

        <HandleField value={handle} onChange={setHandle} onStatus={setStatus} />

        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="block text-[0.9375rem]">{t.social.emailLookupLabel}</span>
            <span className="text-muted-foreground block text-[0.8125rem]">
              {t.social.emailLookupHint}
            </span>
          </span>
          <Switch
            checked={emailLookup}
            onCheckedChange={setEmailLookup}
            data-testid="onboarding-email-lookup"
          />
        </label>

        {pushKey && (
          <div>
            <button
              type="button"
              onClick={() => void enablePush()}
              disabled={pushDone}
              data-testid="onboarding-push-btn"
              className="bg-secondary text-foreground w-full rounded-xl px-4 py-2.5 text-[0.9375rem] font-medium disabled:opacity-60"
            >
              {pushDone ? t.social.pushEnabled : t.social.pushOptIn}
            </button>
            <p className="text-muted-foreground mt-1 text-[0.8125rem]">
              {isIosStandaloneRequired() ? t.social.pushIosHint : t.social.pushBenefit}
            </p>
          </div>
        )}
      </div>
    </MobileSheet>
  );
}
