'use client';

import React, { useState } from 'react';
import { Swords } from 'lucide-react';
import type { DuelItemDto, DuelListDto } from '@luki-fitti/common/schemas';
import { berlinDayKey } from '@luki-fitti/common/utils';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { useLocale } from '@/providers/i18n/locale-context';
import { duelsApi } from '@/lib/social/social-api';
import { UserAvatar } from './user-avatar';
import { DuelDetailSheet } from './duel-detail-sheet';
import type { MyProfile } from './duel-celebration';

/** Two-sided horizontal bar: you fill from the left, them from the right. */
function VersusBar({ you, them }: { you: number; them: number }) {
  const total = you + them;
  const youPct = total > 0 ? (you / total) * 100 : 50;
  if (total === 0) {
    // 0–0: both halves neutral with a centre tick — an orange half would read as a lead.
    return (
      <div
        className="bg-muted-foreground/30 relative flex h-2.5 w-full overflow-hidden rounded-full"
        role="img"
        aria-label={`${you} – ${them}`}
      >
        <div className="bg-foreground/40 absolute top-0 left-1/2 h-full w-0.5 -translate-x-1/2" />
      </div>
    );
  }
  return (
    <div
      className="bg-secondary flex h-2.5 w-full overflow-hidden rounded-full"
      role="img"
      aria-label={`${you} – ${them}`}
    >
      <div className="bg-primary h-full" style={{ width: `${youPct}%` }} />
      <div
        className="bg-muted-foreground/50 ml-auto h-full"
        style={{ width: `${100 - youPct}%` }}
      />
    </div>
  );
}

function ActiveDuelRow({
  duel,
  me,
  onOpen,
}: {
  duel: DuelItemDto;
  me: MyProfile;
  onOpen: () => void;
}) {
  const { t, locale } = useLocale();
  const bcp47 = locale === 'de' ? 'de-DE' : 'en-GB';
  // Accepted duels go ACTIVE immediately but only count from the next Berlin midnight.
  const notStarted = duel.startDayKey !== null && duel.startDayKey > berlinDayKey(new Date());
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        data-testid={`duel-row-${duel.id}`}
        className="hover:bg-secondary/40 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
      >
        <UserAvatar avatarUrl={me.avatarUrl} name={me.name} handle={me.handle} className="size-9" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[0.9375rem] font-semibold tabular-nums">
              {duel.you.toLocaleString(bcp47)}
            </span>
            <span className="text-muted-foreground truncate text-[0.8125rem]">
              @{duel.opponent.handle}
            </span>
            <span className="text-[0.9375rem] font-semibold tabular-nums">
              {duel.them.toLocaleString(bcp47)}
            </span>
          </div>
          <div className="mt-1.5">
            <VersusBar you={duel.you} them={duel.them} />
          </div>
        </div>
        <UserAvatar
          avatarUrl={duel.opponent.avatarUrl}
          name={duel.opponent.name}
          handle={duel.opponent.handle}
          className="size-9"
        />
      </button>
      {duel.daysLeft !== null && (
        <p className="text-muted-foreground px-4 pb-2 text-right text-[0.75rem]">
          {notStarted
            ? t.battle.startsTomorrow
            : t.battle.daysLeft.replace('{days}', String(duel.daysLeft))}
        </p>
      )}
    </li>
  );
}

/**
 * Duels section between the league card and Friends: active head-to-head
 * duels with a tap-through detail sheet, incoming/outgoing challenges and a
 * friendly empty state. Hidden entirely while `data` is null (duels off or
 * the list failed to load).
 */
export function DuelsCard({
  data,
  me,
  onAction,
}: {
  data: DuelListDto;
  me: MyProfile;
  onAction: (fn: () => Promise<unknown>) => void;
}) {
  const { t } = useLocale();
  const [detailId, setDetailId] = useState<string | null>(null);
  const hasOpen = data.active.length + data.incoming.length + data.outgoing.length > 0;

  return (
    <section className="bg-card rounded-[1.25rem]" data-testid="duels-card">
      <div className="flex items-center gap-3 p-4 pb-2">
        <Swords className="text-muted-foreground h-5 w-5" aria-hidden="true" />
        <p className="text-[1.0625rem] font-semibold">{t.battle.duelsTitle}</p>
      </div>

      {!hasOpen && (
        <p className="text-muted-foreground px-4 pb-4 text-[0.9375rem]" data-testid="duels-empty">
          {t.battle.duelsEmpty}
        </p>
      )}

      <ul className="divide-border/60 divide-y" data-testid="duels-active">
        {data.active.map((duel) => (
          <ActiveDuelRow key={duel.id} duel={duel} me={me} onOpen={() => setDetailId(duel.id)} />
        ))}
      </ul>

      {data.incoming.length > 0 && (
        <>
          <p className="text-muted-foreground px-4 pt-2 pb-1 text-[0.75rem] font-medium uppercase">
            {t.battle.incomingHeader}
          </p>
          <ul className="divide-border/60 divide-y" data-testid="duels-incoming">
            {data.incoming.map((duel) => (
              <li key={duel.id} className="flex items-center gap-3 px-4 py-2.5">
                <UserAvatar
                  avatarUrl={duel.opponent.avatarUrl}
                  name={duel.opponent.name}
                  handle={duel.opponent.handle}
                />
                <p className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium">
                  @{duel.opponent.handle}
                </p>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    data-testid={`duel-accept-${duel.id}`}
                    onClick={() => onAction(() => duelsApi.accept(duel.id))}
                  >
                    {t.social.accept}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    data-testid={`duel-decline-${duel.id}`}
                    onClick={() => onAction(() => duelsApi.decline(duel.id))}
                  >
                    {t.social.decline}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {data.outgoing.length > 0 && (
        <>
          <p className="text-muted-foreground px-4 pt-2 pb-1 text-[0.75rem] font-medium uppercase">
            {t.social.sectionSent}
          </p>
          <ul className="divide-border/60 divide-y" data-testid="duels-outgoing">
            {data.outgoing.map((duel) => (
              <li key={duel.id} className="flex items-center gap-3 px-4 py-2.5">
                <UserAvatar
                  avatarUrl={duel.opponent.avatarUrl}
                  name={duel.opponent.name}
                  handle={duel.opponent.handle}
                />
                <p className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium">
                  @{duel.opponent.handle}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid={`duel-cancel-${duel.id}`}
                  onClick={() => onAction(() => duelsApi.cancel(duel.id))}
                >
                  {t.battle.cancelDuel}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      <DuelDetailSheet
        duelId={detailId}
        me={me}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
      />
    </section>
  );
}
