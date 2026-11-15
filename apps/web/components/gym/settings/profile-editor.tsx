'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { toast } from '@luki-fitti/ui/components/ui/sonner';
import { useLocale } from '@/providers/i18n/locale-context';
import { useAuth } from '@/providers/auth/auth-context';
import type { SocialProfileDto } from '@luki-fitti/common/schemas';
import { normalizeUsername } from '@luki-fitti/common/utils';
import { socialApi } from '@/lib/social/social-api';
import { prepareImageForUpload } from '@/lib/images/prepare-image';
import { UserAvatar } from '../social/user-avatar';
import { UsernameField, type UsernameStatus } from '../social/username-field';
import { SettingsSection, SettingsSwitchRow } from './settings-row';

/**
 * Inline social profile editor on Settings → account: avatar (upload/remove),
 * username (live availability, 30-day cooldown), display name, find-me-by-email, pause.
 * Saves through `updateMe`, so the display name here is `user.name`.
 */
export function ProfileEditor() {
  const { t } = useLocale();
  const { refreshUser } = useAuth();
  const [profile, setProfile] = useState<SocialProfileDto | null>(null);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [emailLookup, setEmailLookup] = useState(true);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<UsernameStatus>({ state: 'idle' });
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);

  const refresh = useCallback(async () => {
    const res = await socialApi.me();
    if (res.data) setProfile(res.data);
  }, []);

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    if (!profile || initialized.current) return;
    initialized.current = true;
    setUsername(profile.username ?? '');
    setName(profile.name ?? '');
    setEmailLookup(profile.discoverableByEmail ?? true);
    setPaused(profile.socialPaused ?? false);
  }, [profile]);

  const onChanged = () => {
    void refresh().catch(() => undefined);
    void refreshUser();
  };

  const save = async () => {
    const normalized = normalizeUsername(username);
    setSaving(true);
    try {
      const res = await socialApi.updateMe({
        ...(normalized && normalized !== profile?.username ? { username: normalized } : {}),
        ...(name.trim() && name.trim() !== profile?.name ? { name: name.trim() } : {}),
        discoverableByEmail: emailLookup,
        socialPaused: paused,
      });
      if (res.success) onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '');
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    try {
      const jpeg = await prepareImageForUpload(file);
      const res = await socialApi.uploadAvatar(jpeg);
      if (res.success) onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '');
    }
  };

  const canSave =
    status.state !== 'checking' &&
    status.state !== 'unavailable' &&
    (normalizeUsername(username) !== '' || Boolean(profile?.username));

  return (
    <SettingsSection title={t.social.editProfileTitle}>
      <li className="space-y-4 px-4 py-3.5">
        <div className="flex items-center gap-4">
          <UserAvatar
            avatarUrl={profile?.avatarUrl}
            name={name || profile?.name}
            username={username || profile?.username}
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
                onClick={() =>
                  void socialApi
                    .removeAvatar()
                    .then((r) => r.success && onChanged())
                    .catch((err) => toast.error(err instanceof Error ? err.message : ''))
                }
                data-testid="avatar-remove"
              >
                {t.social.avatarRemove}
              </button>
            )}
          </div>
        </div>

        <UsernameField
          value={username}
          onChange={setUsername}
          currentUsername={profile?.username}
          cooldownUntil={profile?.usernameChangeAvailableAt}
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

        <Button
          type="button"
          className="w-full"
          disabled={!canSave || saving}
          onClick={() => void save()}
        >
          {t.common.save}
        </Button>
      </li>
      <SettingsSwitchRow
        title={t.social.emailLookupLabel}
        subtitle={t.social.emailLookupHint}
        checked={emailLookup}
        onCheckedChange={setEmailLookup}
        data-testid="email-lookup-switch"
      />
      <SettingsSwitchRow
        title={t.social.pauseLabel}
        subtitle={t.social.pauseHint}
        checked={paused}
        onCheckedChange={setPaused}
        data-testid="social-pause-switch"
      />
    </SettingsSection>
  );
}
