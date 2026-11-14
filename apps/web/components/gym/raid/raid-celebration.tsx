'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { RaidResultDto } from '@luki-fitti/common/schemas';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { useLocale } from '@/providers/i18n/locale-context';
import { raidsApi } from '@/lib/social/social-api';
import { BossCanvas } from './boss-canvas';
import { bossBySlug } from './raid-card';

/** Delay the celebration like the league overlay: one beat so the tab settles. */
export function useRaidResult(
  pending: RaidResultDto | null,
  setOverlay: (r: RaidResultDto | null) => void,
) {
  React.useEffect(() => {
    if (!pending) return;
    const id = window.setTimeout(() => setOverlay(pending), 600);
    return () => window.clearTimeout(id);
  }, [pending, setOverlay]);
}

export async function dismissRaidResult(raidId: string) {
  await raidsApi.markSeen(raidId).catch(() => undefined);
}

function Confetti() {
  const pieces = React.useMemo(
    () =>
      Array.from({ length: 120 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2 + Math.random() * 1.2,
        size: 5 + Math.random() * 7,
        hue: Math.floor(Math.random() * 360),
        drift: (Math.random() - 0.5) * 30,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-[2px]"
          style={{
            left: `${p.x}%`,
            top: '-4%',
            width: p.size,
            height: p.size * 0.6,
            background: `hsl(${p.hue} 90% 60%)`,
          }}
          initial={{ y: '-10vh', x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '110vh', x: p.drift, rotate: 540, opacity: [1, 1, 0.9] }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  );
}

/** Raid outcome overlay: loud on DEFEATED (explosion → trophy + confetti), calm on ESCAPED. */
export function RaidCelebration({ result, onDone }: { result: RaidResultDto; onDone: () => void }) {
  const { t, locale, format } = useLocale();
  const reduced = useReducedMotion() ?? false;
  const boss = bossBySlug(result.bossSlug);
  const defeated = result.outcome === 'DEFEATED';
  const name = locale === 'de' ? boss.name.de : boss.name.en;

  const close = async () => {
    await dismissRaidResult(result.raidId);
    onDone();
  };

  return (
    <motion.div
      className="bg-background/95 fixed inset-0 z-50 flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      data-testid="raid-celebration"
      role="dialog"
      aria-modal="true"
    >
      {defeated && !reduced && <Confetti />}
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <motion.div
          initial={reduced ? { opacity: 0 } : { scale: 0.3, opacity: 0 }}
          animate={reduced ? { opacity: 1 } : { scale: [0.3, 1.15, 1], opacity: 1 }}
          transition={
            reduced ? { duration: 0.3 } : { duration: 0.7, times: [0, 0.7, 1], ease: 'easeOut' }
          }
          className="w-full max-w-[260px]"
        >
          <BossCanvas
            boss={boss}
            state={defeated ? 'defeated' : 'escaped'}
            phase={defeated ? 3 : boss.parts.length ? 0 : 0}
            reducedMotion={reduced}
            interactive={false}
            label={name}
            className="aspect-square w-full"
          />
        </motion.div>

        <motion.h1
          className="mt-2 text-[2rem] leading-tight font-extrabold"
          initial={reduced ? { opacity: 0 } : { y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: reduced ? 0 : 0.35 }}
        >
          {defeated
            ? format(t.raid.defeatedTitle, { boss: name })
            : format(t.raid.escapedTitle, { boss: name })}
        </motion.h1>

        <motion.div
          initial={reduced ? { opacity: 0 } : { y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: reduced ? 0.1 : 0.5 }}
        >
          {defeated ? (
            <>
              <p className="text-muted-foreground mt-1 text-[1.0625rem]">
                {result.crownRank !== null
                  ? format(t.raid.defeatSub, {
                      points: result.you.toLocaleString(),
                      rank: result.crownRank,
                    })
                  : format(t.raid.defeatSubNoRank, { points: result.you.toLocaleString() })}
              </p>
              <div className="mt-2 flex justify-center gap-2">
                {result.crownRank !== null && (
                  <span className="bg-secondary rounded-full px-3 py-1 text-[0.8125rem] font-semibold">
                    🏆 {format(t.raid.crownBadge, { tier: result.crownRank })}
                  </span>
                )}
                {result.finalBlow && (
                  <span className="bg-secondary rounded-full px-3 py-1 text-[0.8125rem] font-semibold">
                    ⚔️ {t.raid.finalBlowBadge}
                  </span>
                )}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground mt-1 text-[1.0625rem]">{t.raid.escapedBody}</p>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduced ? 0.2 : 0.8 }}
          className="mt-6 w-full"
        >
          <Button
            className="w-full"
            onClick={() => void close()}
            data-testid="raid-celebration-done"
          >
            {t.raid.markSeen}
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}
