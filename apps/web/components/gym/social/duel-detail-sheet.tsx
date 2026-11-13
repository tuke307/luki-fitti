'use client';

import React, { useEffect, useState } from 'react';
import type { DuelDetailDto } from '@luki-fitti/common/schemas';
import { berlinDayKey } from '@luki-fitti/common/utils';
import { useLocale } from '@/providers/i18n/locale-context';
import { duelsApi } from '@/lib/social/social-api';
import { MobileSheet } from '../mobile-sheet';
import { UserAvatar } from './user-avatar';
import type { MyProfile } from './duel-celebration';

/** Per-day paired bars inside the duel detail sheet. */
export function DuelDetailSheet({
  duelId,
  me,
  onOpenChange,
}: {
  duelId: string | null;
  me: MyProfile;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale } = useLocale();
  const bcp47 = locale === 'de' ? 'de-DE' : 'en-GB';
  const [detailFor, setDetailFor] = useState<{ id: string; data: DuelDetailDto } | null>(null);
  const detail = duelId !== null && detailFor?.id === duelId ? detailFor.data : null;

  useEffect(() => {
    if (!duelId) return;
    const id = duelId;
    let cancelled = false;
    void duelsApi
      .detail(id)
      .then((res) => {
        if (!cancelled && res.data) setDetailFor({ id, data: res.data });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [duelId]);

  const max = Math.max(1, ...(detail?.days ?? []).flatMap((d) => [d.you, d.them]));
  const notStarted =
    detail !== null && detail.startDayKey !== null && detail.startDayKey > berlinDayKey(new Date());

  return (
    <MobileSheet
      open={duelId !== null}
      onOpenChange={onOpenChange}
      title={detail ? t.battle.detailTitle.replace('{handle}', `@${detail.opponent.handle}`) : '…'}
      hideCancel
      data-testid="duel-detail-sheet"
    >
      {detail && (
        <div className="space-y-4" data-testid="duel-detail-body">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <UserAvatar
                avatarUrl={me.avatarUrl}
                name={me.name}
                handle={me.handle}
                className="size-10"
              />
              <span className="text-[1.25rem] font-bold tabular-nums">
                {detail.you.toLocaleString(bcp47)}
              </span>
            </div>
            <span className="text-muted-foreground text-[0.8125rem]">
              {notStarted
                ? t.battle.startsTomorrow
                : detail.daysLeft !== null &&
                  t.battle.daysLeft.replace('{days}', String(detail.daysLeft))}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[1.25rem] font-bold tabular-nums">
                {detail.them.toLocaleString(bcp47)}
              </span>
              <UserAvatar
                avatarUrl={detail.opponent.avatarUrl}
                name={detail.opponent.name}
                handle={detail.opponent.handle}
                className="size-10"
              />
            </div>
          </div>

          <ul className="space-y-3" data-testid="duel-detail-days">
            {detail.days.map((day) => (
              <li key={day.dayKey}>
                <div className="flex items-baseline justify-between text-[0.75rem]">
                  <span className="font-medium tabular-nums">{day.you.toLocaleString(bcp47)}</span>
                  <span className="text-muted-foreground">
                    {new Date(`${day.dayKey}T12:00:00Z`).toLocaleDateString(bcp47, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      timeZone: 'UTC',
                    })}
                  </span>
                  <span className="font-medium tabular-nums">{day.them.toLocaleString(bcp47)}</span>
                </div>
                <div className="mt-1 flex gap-1">
                  <div className="bg-secondary flex h-2 flex-1 justify-end overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full"
                      style={{ width: `${(day.you / max) * 100}%` }}
                    />
                  </div>
                  <div className="bg-secondary h-2 flex-1 overflow-hidden rounded-full">
                    <div
                      className="bg-muted-foreground/50 h-full"
                      style={{ width: `${(day.them / max) * 100}%` }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </MobileSheet>
  );
}
