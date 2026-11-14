'use client';

import React from 'react';
import { RAID_BOSSES, type RaidBoss } from '@luki-fitti/common/raid';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { useLocale } from '@/providers/i18n/locale-context';
import { BossCanvas, type BossHit, type BossVisualState } from '@/components/gym/raid/boss-canvas';

const STATE_BUTTONS: Array<{ key: string; state: BossVisualState; phase?: number; hit?: boolean }> =
  [
    { key: 'bossTriggerIdle', state: 'idle', phase: 0 },
    { key: 'bossTriggerHit', state: 'idle', hit: true },
    { key: 'bossTriggerPhase1', state: 'idle', phase: 1 },
    { key: 'bossTriggerPhase2', state: 'idle', phase: 2 },
    { key: 'bossTriggerPhase3', state: 'idle', phase: 3 },
    { key: 'bossTriggerDefeated', state: 'defeated' },
    { key: 'bossTriggerEscaped', state: 'escaped' },
  ];

function BossPreviewCard({ boss, reduced }: { boss: RaidBoss; reduced: boolean }) {
  const { t, locale } = useLocale();
  const [state, setState] = React.useState<BossVisualState>('idle');
  const [phase, setPhase] = React.useState(0);
  const [hit, setHit] = React.useState<BossHit | null>(null);
  const hitSeq = React.useRef(0);
  const name = locale === 'de' ? boss.name.de : boss.name.en;

  return (
    <div className="bg-card rounded-[1.25rem] p-4" data-testid={`boss-card-${boss.slug}`}>
      <BossCanvas
        boss={boss}
        state={state}
        phase={phase}
        hit={hit}
        reducedMotion={reduced}
        label={name}
        className="mx-auto aspect-square w-full max-w-[280px]"
      />
      <p className="mt-1 text-center text-[0.9375rem] font-semibold">{name}</p>
      <p className="text-muted-foreground text-center text-[0.75rem]">{boss.weakTo.join(' · ')}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
        {STATE_BUTTONS.map((b) => (
          <Button
            key={b.key}
            size="sm"
            variant="secondary"
            data-testid={`boss-${b.key}-${boss.slug}`}
            onClick={() => {
              setState(b.state);
              setPhase(b.phase ?? phase);
              if (b.hit) setHit({ id: (hitSeq.current += 1), damage: 120 });
            }}
          >
            {t.admin[b.key as keyof typeof t.admin]}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** Admin preview grid: all 8 raid bosses live, with per-state triggers. */
export function AdminBosses() {
  const { t } = useLocale();
  const [reduced, setReduced] = React.useState(false);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[2.125rem] leading-tight font-bold">{t.admin.bossesTitle}</h1>
          <p className="text-muted-foreground text-[0.9375rem]">{t.admin.bossesSub}</p>
        </div>
        <label className="text-muted-foreground flex items-center gap-2 text-[0.875rem]">
          <input
            type="checkbox"
            checked={reduced}
            onChange={(e) => setReduced(e.target.checked)}
            data-testid="boss-reduced-motion"
          />
          {t.admin.bossReducedMotion}
        </label>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {RAID_BOSSES.map((boss) => (
          <BossPreviewCard key={boss.slug} boss={boss} reduced={reduced} />
        ))}
      </div>
    </div>
  );
}
