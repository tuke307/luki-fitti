'use client';

import React, { useEffect, useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Switch } from '@luki-fitti/ui/components/ui/switch';
import type { NotificationKind } from '@luki-fitti/common/enums';
import type { PushPreferencesDto } from '@luki-fitti/common/schemas';
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationCategoryId,
} from '@luki-fitti/common/notification-categories';
import { pushApi } from '@/lib/social/social-api';
import {
  enablePushOnThisDevice,
  fetchPushConfig,
  isIosStandaloneRequired,
  isWebPushSupported,
  thisDeviceEndpoint,
} from '@/lib/push/web-push';
import { useLocale } from '@/providers/i18n/locale-context';
import { SettingsButtonRow } from '@/components/gym/settings/settings-row';
import { MobileSheet } from '../mobile-sheet';

const CATEGORY_COPY: Record<
  NotificationCategoryId,
  {
    label: (t: ReturnType<typeof useLocale>['t']) => string;
    sub: (t: ReturnType<typeof useLocale>['t']) => string;
  }
> = {
  friends: { label: (t) => t.social.pushFriendsLabel, sub: (t) => t.social.pushFriendsSub },
  nudges: { label: (t) => t.social.pushNudgesLabel, sub: (t) => t.social.pushNudgesSub },
  leagues: { label: (t) => t.social.pushLeaguesLabel, sub: (t) => t.social.pushLeaguesSub },
  duels: { label: (t) => t.battle.pushDuelsLabel, sub: (t) => t.battle.pushDuelsSub },
  streaks: { label: (t) => t.battle.pushStreaksLabel, sub: (t) => t.battle.pushStreaksSub },
  raids: { label: (t) => t.raid.pushRaidsLabel, sub: (t) => t.raid.pushRaidsSub },
};

/**
 * Settings → Notifications: one row per notification category. The row's
 * switch is the category master toggle; tapping the row body drills into a
 * sheet with one toggle per kind (disabled while the category is off).
 * Below sits the per-device Web Push opt-in.
 */
export function PushSettingsCard() {
  const { t } = useLocale();
  const [prefs, setPrefs] = useState<PushPreferencesDto | null>(null);
  const [openCat, setOpenCat] = useState<NotificationCategory | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [deviceEnabled, setDeviceEnabled] = useState(
    () => isWebPushSupported() && thisDeviceEndpoint() !== null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void pushApi.preferences().then((res) => {
      if (!cancelled && res.data) setPrefs(res.data);
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

  const setCategory = async (cat: NotificationCategory, enabled: boolean) => {
    // Category ids double as the DTO field names (friends, nudges, leagues, …).
    const key = cat.id;
    setPrefs((p) => (p ? { ...p, [key]: enabled } : p));
    const res = await pushApi.updatePreferences({ [key]: enabled });
    if (res.data) setPrefs(res.data);
  };

  const toggleKind = async (kind: NotificationKind, enabled: boolean) => {
    if (!prefs) return;
    const disabled = enabled
      ? prefs.disabledKinds.filter((k) => k !== kind)
      : [...new Set([...prefs.disabledKinds, kind])];
    setPrefs({ ...prefs, disabledKinds: disabled });
    const res = await pushApi.updatePreferences({ disabledKinds: disabled });
    if (res.data) setPrefs(res.data);
  };

  return (
    <>
      {prefs &&
        NOTIFICATION_CATEGORIES.map((cat) => (
          <CategoryRow
            key={cat.id}
            cat={cat}
            title={CATEGORY_COPY[cat.id].label(t)}
            subtitle={CATEGORY_COPY[cat.id].sub(t)}
            enabled={prefs[cat.id]}
            onOpen={() => setOpenCat(cat)}
            onToggle={(enabled) => void setCategory(cat, enabled)}
          />
        ))}
      <MobileSheet
        open={openCat !== null}
        onOpenChange={(open) => {
          if (!open) setOpenCat(null);
        }}
        title={openCat ? CATEGORY_COPY[openCat.id].label(t) : ''}
        hideCancel
        confirm={{ label: t.common.done, onConfirm: () => setOpenCat(null) }}
        data-testid="push-category-sheet"
      >
        {openCat && prefs && (
          <ul className="divide-border/60 divide-y" data-testid="push-kind-list">
            {openCat.kinds.map((kind) => (
              <KindRow
                key={kind}
                kind={kind}
                label={t.social.pushKinds[kind]}
                checked={prefs[openCat.id] && !prefs.disabledKinds.includes(kind)}
                disabled={!prefs[openCat.id]}
                onToggle={(enabled) => void toggleKind(kind, enabled)}
              />
            ))}
          </ul>
        )}
      </MobileSheet>
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

/** Category row: the body drills into the kind sheet, the switch is the master toggle. */
function CategoryRow({
  cat,
  title,
  subtitle,
  enabled,
  onOpen,
  onToggle,
}: {
  cat: NotificationCategory;
  title: string;
  subtitle: string;
  enabled: boolean;
  onOpen: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const labelId = useId();
  return (
    <li className="before:bg-border relative not-first:before:absolute not-first:before:top-0 not-first:before:right-0 not-first:before:h-px not-first:before:left-4">
      <div className="flex min-h-11 w-full items-center gap-3 px-4 py-2">
        <button
          type="button"
          onClick={onOpen}
          id={labelId}
          className="focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 text-left text-[1.0625rem] leading-snug focus-visible:ring-2 focus-visible:outline-none"
          data-testid={`push-${cat.id}-row`}
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1">{title}</span>
            <span className="text-muted-foreground block text-[0.8125rem]">{subtitle}</span>
          </span>
          <ChevronRight className="text-muted-foreground/70 h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          aria-labelledby={labelId}
          data-testid={`push-${cat.id}-switch`}
        />
      </div>
    </li>
  );
}

/** One notification-kind toggle inside a category sheet. */
function KindRow({
  kind,
  label,
  checked,
  disabled,
  onToggle,
}: {
  kind: NotificationKind;
  label: string;
  checked: boolean;
  disabled: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const labelId = useId();
  return (
    <li className="flex min-h-11 items-center gap-3 py-2">
      <span id={labelId} className="min-w-0 flex-1 text-[0.9375rem]">
        {label}
      </span>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onToggle}
        aria-labelledby={labelId}
        data-testid={`push-kind-${kind}`}
      />
    </li>
  );
}
