'use client';

import React, { useEffect, useState } from 'react';
import { pushApi } from '@/lib/social/social-api';
import {
  enablePushOnThisDevice,
  fetchPushConfig,
  isIosStandaloneRequired,
  isWebPushSupported,
  thisDeviceEndpoint,
} from '@/lib/push/web-push';
import { useLocale } from '@/providers/i18n/locale-context';
import { SettingsButtonRow, SettingsSwitchRow } from '@/components/gym/settings/settings-row';

/**
 * Settings → Notifications: friend-push toggle plus the per-device Web Push
 * opt-in. The device button only appears when the API exposes a VAPID key and
 * the browser supports PushManager.
 */
export function PushSettingsCard() {
  const { t } = useLocale();
  const [friends, setFriends] = useState<boolean | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [deviceEnabled, setDeviceEnabled] = useState(
    () => isWebPushSupported() && thisDeviceEndpoint() !== null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void pushApi.preferences().then((res) => {
      if (!cancelled && res.data) setFriends(res.data.friends);
    });
    if (isWebPushSupported()) {
      void fetchPushConfig().then((config) => {
        if (!cancelled) setPublicKey(config?.webPushPublicKey ?? null);
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      {friends !== null && (
        <SettingsSwitchRow
          title={t.social.pushFriendsLabel}
          subtitle={t.social.pushFriendsSub}
          checked={friends}
          onCheckedChange={async (enabled) => {
            setFriends(enabled);
            const res = await pushApi.updatePreferences({ friends: enabled });
            if (res.data) setFriends(res.data.friends);
          }}
          data-testid="push-friends-switch"
        />
      )}
      {isWebPushSupported() && publicKey && !isIosStandaloneRequired() && !deviceEnabled && (
        <SettingsButtonRow
          title={busy ? '…' : t.social.pushEnable}
          data-testid="push-enable-btn"
          onClick={async () => {
            setBusy(true);
            try {
              if (await enablePushOnThisDevice(publicKey)) setDeviceEnabled(true);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {isWebPushSupported() && isIosStandaloneRequired() && (
        <p className="text-muted-foreground px-4 py-3 text-[0.8125rem]">{t.social.pushIosHint}</p>
      )}
    </>
  );
}
