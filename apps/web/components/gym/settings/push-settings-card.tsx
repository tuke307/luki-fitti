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
  const [leagues, setLeagues] = useState<boolean | null>(null);
  const [duels, setDuels] = useState<boolean | null>(null);
  const [streaks, setStreaks] = useState<boolean | null>(null);
  const [raids, setRaids] = useState<boolean | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [deviceEnabled, setDeviceEnabled] = useState(
    () => isWebPushSupported() && thisDeviceEndpoint() !== null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void pushApi.preferences().then((res) => {
      if (!cancelled && res.data) {
        setFriends(res.data.friends);
        setLeagues(res.data.leagues);
        setDuels(res.data.duels);
        setStreaks(res.data.streaks);
        setRaids(res.data.raids);
      }
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
      {leagues !== null && (
        <SettingsSwitchRow
          title={t.social.pushLeaguesLabel}
          subtitle={t.social.pushLeaguesSub}
          checked={leagues}
          onCheckedChange={async (enabled) => {
            setLeagues(enabled);
            const res = await pushApi.updatePreferences({ leagues: enabled });
            if (res.data) setLeagues(res.data.leagues);
          }}
          data-testid="push-leagues-switch"
        />
      )}
      {duels !== null && (
        <SettingsSwitchRow
          title={t.battle.pushDuelsLabel}
          subtitle={t.battle.pushDuelsSub}
          checked={duels}
          onCheckedChange={async (enabled) => {
            setDuels(enabled);
            const res = await pushApi.updatePreferences({ duels: enabled });
            if (res.data) setDuels(res.data.duels);
          }}
          data-testid="push-duels-switch"
        />
      )}
      {streaks !== null && (
        <SettingsSwitchRow
          title={t.battle.pushStreaksLabel}
          subtitle={t.battle.pushStreaksSub}
          checked={streaks}
          onCheckedChange={async (enabled) => {
            setStreaks(enabled);
            const res = await pushApi.updatePreferences({ streaks: enabled });
            if (res.data) setStreaks(res.data.streaks);
          }}
          data-testid="push-streaks-switch"
        />
      )}
      {raids !== null && (
        <SettingsSwitchRow
          title={t.raid.pushRaidsLabel}
          subtitle={t.raid.pushRaidsSub}
          checked={raids}
          onCheckedChange={async (enabled) => {
            setRaids(enabled);
            const res = await pushApi.updatePreferences({ raids: enabled });
            if (res.data) setRaids(res.data.raids);
          }}
          data-testid="push-raids-switch"
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
