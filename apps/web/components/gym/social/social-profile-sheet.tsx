'use client';

import React, { useRef, useState } from 'react';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { Switch } from '@luki-fitti/ui/components/ui/switch';
import { toast } from '@luki-fitti/ui/components/ui/sonner';
import { useLocale } from '@/providers/i18n/locale-context';
import type { SocialProfileDto } from '@luki-fitti/common/schemas';
import { normalizeHandle } from '@luki-fitti/common/utils';
import { socialApi } from '@/lib/social/social-api';
import { prepareImageForUpload } from '@/lib/images/prepare-image';
import { MobileSheet } from '../mobile-sheet';
import { UserAvatar } from './user-avatar';
import { HandleField, type HandleStatus } from './handle-field';

/**
 * Full social profile editor: handle (live availability, 30-day cooldown),
 * display name, avatar upload/remove, find-me-by-email, pause.
 */
export function SocialProfileSheet({
  open,
  onOpenChange,
  profile,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: SocialProfileDto | null;
  onSaved: () => void;
}) {
  const { t } = useLocale();
  const [handle, setHandle] = useState('');
  const [name, setName] = useState('');
  const [emailLookup, setEmailLookup] = useState(true);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<HandleStatus>({ state: 'idle' });
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setHandle(profile?.handle ?? '');
      setName(profile?.name ?? '');
      setEmailLookup(profile?.discoverableByEmail ?? true);
      setPaused(profile?.socialPaused ?? false);
      setStatus({ state: 'idle' });
    }
  }

  const save = async () => {
    const normalized = normalizeHandle(handle);
    setSaving(true);
    try {
      const res = await socialApi.updateMe({
        ...(normalized && normalized !== profile?.handle ? { handle: normalized } : {}),
        ...(name.trim() && name.trim() !== profile?.name ? { name: name.trim() } : {}),
        discoverableByEmail: emailLookup,
        socialPaused: paused,
      });
      if (res.success) {
        onSaved();
        onOpenChange(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '');
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    const jpeg = await prepareImageForUpload(file);
    const res = await socialApi.uploadAvatar(jpeg);
    if (res.success) onSaved();
  };

  const canSave =
    status.state !== 'checking' &&
    status.state !== 'unavailable' &&
    (normalizeHandle(handle) !== '' || Boolean(profile?.handle));

  return (
    <MobileSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t.social.editProfileTitle}
      confirm={{
        label: t.common.save,
        onConfirm: () => void save(),
        disabled: !canSave,
        loading: saving,
      }}
      data-testid="social-profile-sheet"
    >
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <UserAvatar
            avatarUrl={profile?.avatarUrl}
            name={name || profile?.name}
            handle={handle || profile?.handle}
            className="size-16"
          />
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              data-testid="avatar-input"
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
              data-testid="avatar-change"
            >
              {t.social.avatarChange}
            </button>
            {profile?.avatarUrl && (
              <button
                type="button"
                className="text-destructive text-[0.9375rem]"
                onClick={() => void socialApi.removeAvatar().then((r) => r.success && onSaved())}
                data-testid="avatar-remove"
              >
                {t.social.avatarRemove}
              </button>
            )}
          </div>
        </div>

        <HandleField
          value={handle}
          onChange={setHandle}
          currentHandle={profile?.handle}
          cooldownUntil={profile?.handleChangeAvailableAt}
          onStatus={setStatus}
        />

        <div>
          <label
            htmlFor="social-name"
            className="text-muted-foreground mb-1 block text-[0.8125rem]"
          >
            {t.social.nameLabel}
          </label>
          <Input
            id="social-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            data-testid="name-input"
          />
        </div>

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
            data-testid="email-lookup-switch"
          />
        </label>

        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="block text-[0.9375rem]">{t.social.pauseLabel}</span>
            <span className="text-muted-foreground block text-[0.8125rem]">
              {t.social.pauseHint}
            </span>
          </span>
          <Switch checked={paused} onCheckedChange={setPaused} data-testid="social-pause-switch" />
        </label>
      </div>
    </MobileSheet>
  );
}
