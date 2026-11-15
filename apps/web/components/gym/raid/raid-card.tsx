'use client';

import React from 'react';
import type { RaidDto } from '@luki-fitti/common/schemas';
import { MuscleGroup } from '@luki-fitti/common/enums';
import { RAID_BOSSES, raidPhaseFor, type WeakSpot } from '@luki-fitti/common/raid';
import { useLocale } from '@/providers/i18n/locale-context';
import { BossCanvas } from './boss-canvas';

export function bossBySlug(slug: string) {
  return RAID_BOSSES.find((b) => b.slug === slug) ?? RAID_BOSSES[0]!;
}

/** Localized boss name for the active locale. */
export function bossName(slug: string, locale: string) {
  const boss = bossBySlug(slug);
  return locale === 'de' ? boss.name.de : boss.name.en;
}

/** Localized weak-spot label: real muscle groups via the locale helper,
 *  CARDIO/STRETCHING pseudo spots via raid strings. */
export function weakSpotLabel(
  spot: WeakSpot,
  t: { raid: { spotCardio: string; spotStretching: string } },
  muscleLabel: (m: MuscleGroup) => string,
): string {
  if (spot === 'CARDIO') return t.raid.spotCardio;
  if (spot === 'STRETCHING') return t.raid.spotStretching;
  return muscleLabel(spot);
}

/** Effective enrage phase — max(server phase, HP-derived) so stale rows still enrage. */
export function effectivePhase(raid: { damage: number; maxHp: number; phase: number }): number {
  return Math.max(raid.phase, raidPhaseFor(raid.damage, raid.maxHp));
}

/** HP bar with tick marks at the 75/50/25 % enrage thresholds. */
export function RaidHpBar({ damage, maxHp }: { damage: number; maxHp: number }) {
  const left = Math.max(0, maxHp - damage);
  const pct = maxHp > 0 ? (left / maxHp) * 100 : 0;
  return (
    <div
      className="bg-secondary relative h-2.5 w-full overflow-hidden rounded-full"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="bg-destructive h-full rounded-full transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
      {[75, 50, 25].map((tick) => (
        <div
          key={tick}
          className="bg-background/80 absolute top-0 h-full w-0.5"
          style={{ left: `${tick}%` }}
        />
      ))}
    </div>
  );
}

export function useCountdown(endsAt?: string): string {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const ms = Math.max(0, (endsAt ? Date.parse(endsAt) : 0) - now);
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} m`;
  return `${minutes} m`;
}

/** Compact raid card for the Social tab: small live boss, HP bar, countdown, your damage. */
export function RaidCard({
  raid,
  yourDamage,
  onOpen,
}: {
  raid: RaidDto;
  yourDamage: number;
  onOpen: () => void;
}) {
  const { t, locale, muscleLabel } = useLocale();
  const boss = bossBySlug(raid.bossSlug);
  const name = locale === 'de' ? boss.name.de : boss.name.en;
  const endsIn = useCountdown(raid.endsAt);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="bg-card block w-full rounded-[1.25rem] p-4 text-left"
      data-testid="raid-card"
    >
      <div className="flex items-center gap-3">
        <BossCanvas
          boss={boss}
          state={
            raid.status === 'DEFEATED' ? 'defeated' : raid.status === 'ESCAPED' ? 'escaped' : 'idle'
          }
          phase={effectivePhase(raid)}
          interactive={false}
          label={name}
          className="h-20 w-20 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.9375rem] font-semibold">{name}</p>
          <p className="text-muted-foreground text-[0.8125rem]">
            {raid.kind === 'SQUAD' && raid.squad ? raid.squad.name : t.raid.communityRaid}
            {' · '}
            {endsIn}
          </p>
          <div className="mt-1.5">
            <RaidHpBar damage={raid.damage} maxHp={raid.maxHp} />
          </div>
          <p className="text-muted-foreground mt-1 text-[0.75rem]">
            {t.raid.yourDamage.replace('{points}', yourDamage.toLocaleString())}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {boss.weakTo.map((spot) => (
          <span
            key={spot}
            className="bg-secondary text-muted-foreground rounded-full px-2 py-0.5 text-[0.6875rem] font-medium"
          >
            {weakSpotLabel(spot, t, muscleLabel)}
          </span>
        ))}
      </div>
    </button>
  );
}
