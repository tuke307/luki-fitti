'use client';

import React, { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { raidHitMoment, type RaidBoss } from '@luki-fitti/common/raid';
import type { RaidDto } from '@luki-fitti/common/schemas';
import { useLocale } from '@/providers/i18n/locale-context';
import { BossCanvas, type BossHit, type BossVisualState } from './boss-canvas';
import { RaidHpBar } from './raid-card';

type HitMoment = ReturnType<typeof raidHitMoment>;

/**
 * Workout-summary "boss moment" (mirrors RaidHitMomentView in the iOS app):
 * the picked raid's boss appears at its pre-workout HP, takes this session's
 * hit, the HP bar drains, it enrages when a threshold is crossed and explodes
 * on the final blow. Plays once per mount; reduced motion renders the
 * post-hit state directly.
 */
export function RaidHitMoment({
  boss,
  raid,
  moment,
}: {
  boss: RaidBoss;
  raid: RaidDto;
  moment: HitMoment;
}) {
  const { t, format, locale } = useLocale();
  const prefersReduced = useReducedMotion() ?? false;

  const [animPhase, setAnimPhase] = useState(moment.beforePhase);
  const [animDamage, setAnimDamage] = useState(moment.beforeDamage);
  const [animVisual, setAnimVisual] = useState<BossVisualState>('idle');
  const [hit, setHit] = useState<BossHit | null>(null);
  const [labelOn, setLabelOn] = useState(false);
  const [labelRisen, setLabelRisen] = useState(false);
  const [animCaption, setAnimCaption] = useState<string | null>(null);

  const bossName = locale === 'de' ? boss.name.de : boss.name.en;
  const hpLeft = Math.max(0, moment.maxHp - moment.afterDamage);
  const endCaption = moment.finishes
    ? t.raid.finalBlow
    : moment.afterPhase > moment.beforePhase
      ? t.raid.enraged
      : null;

  // Reduced motion skips the sequence: the post-hit state is shown directly.
  const phase = prefersReduced ? moment.afterPhase : animPhase;
  const damage = prefersReduced ? moment.afterDamage : animDamage;
  const visual = prefersReduced ? (moment.finishes ? 'defeated' : 'idle') : animVisual;
  const caption = prefersReduced ? endCaption : animCaption;
  const showLabel = prefersReduced || labelOn;
  const hpFraction = moment.maxHp > 0 ? Math.max(0, 1 - damage / moment.maxHp) : 0;

  useEffect(() => {
    if (prefersReduced) return;
    const timers: number[] = [];
    timers.push(
      window.setTimeout(() => {
        setHit({ id: 1, damage: moment.hit });
        setLabelOn(true);
        timers.push(window.setTimeout(() => setLabelRisen(true), 30));
        setAnimDamage(moment.afterDamage);
      }, 600),
    );
    timers.push(
      window.setTimeout(() => {
        if (moment.finishes) {
          setAnimPhase(moment.afterPhase);
          setAnimVisual('defeated');
          setAnimCaption(t.raid.finalBlow);
        } else if (moment.afterPhase > moment.beforePhase) {
          setAnimPhase(moment.afterPhase);
          setAnimCaption(t.raid.enraged);
        }
      }, 1000),
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [prefersReduced, moment, t]);

  return (
    <div
      data-testid="session-finish-raid"
      role="group"
      aria-label={`${format(t.raid.workoutDamage, {
        points: moment.hit.toLocaleString(),
        boss: bossName,
        weak: moment.weakBonus > 0 ? t.raid.weakBonus : '',
      })}, ${hpLeft.toLocaleString()} / ${moment.maxHp.toLocaleString()} HP`}
      className="bg-card space-y-2 rounded-[1.25rem] p-4 text-left"
    >
      <div className="relative">
        <BossCanvas
          boss={boss}
          state={visual}
          phase={phase}
          hit={hit}
          reducedMotion={prefersReduced}
          interactive={false}
          label={bossName}
          hpFraction={hpFraction}
          className="mx-auto h-40 w-full"
        />
        {showLabel && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 text-center transition-all duration-[1100ms] ease-out ${
              labelRisen ? '-translate-y-6 opacity-0' : 'translate-y-0 opacity-100'
            }`}
          >
            <p className="text-[1.25rem] font-bold tabular-nums">−{moment.hit.toLocaleString()}</p>
            {moment.weakBonus > 0 && (
              <p className="text-muted-foreground text-[0.75rem]">
                {format(t.raid.feedWeak, { points: moment.weakBonus.toLocaleString() })}
              </p>
            )}
          </div>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[0.9375rem] font-semibold">{bossName}</p>
        <p className="text-muted-foreground text-[0.75rem]">
          {raid.kind === 'SQUAD' && raid.squad ? raid.squad.name : t.raid.communityRaid}
        </p>
      </div>
      <RaidHpBar
        damage={damage}
        maxHp={moment.maxHp}
        fillClassName="bg-destructive h-full rounded-full transition-[width] duration-[800ms] ease-out"
      />
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-destructive text-[0.75rem] font-semibold">{caption}</p>
        <p className="text-muted-foreground text-[0.75rem] tabular-nums">
          {hpLeft.toLocaleString()} / {moment.maxHp.toLocaleString()} HP
        </p>
      </div>
    </div>
  );
}
