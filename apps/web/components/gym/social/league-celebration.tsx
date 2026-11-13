'use client';

import React, { useEffect, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { LeagueOutcome } from '@luki-fitti/common/enums';
import type { LeaguePendingResultDto } from '@luki-fitti/common/schemas';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { useLocale } from '@/providers/i18n/locale-context';
import { ArenaBadge } from './arena-badge';
import { arenaName } from './league-card';
import { leagueApi } from '@/lib/social/social-api';
import { toast } from '@luki-fitti/ui/components/ui/sonner';

const CONFETTI_COLORS = ['#FFD54A', '#8EF0E2', '#8FD0FF', '#FF7A59', '#8A6BD1', '#34D399'];

/** Deterministic pseudo-random in [0,1) so confetti stays pure under the React compiler. */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        id: i,
        left: pseudoRandom(i * 7 + 1) * 100,
        delay: pseudoRandom(i * 7 + 2) * 0.6,
        duration: 2.2 + pseudoRandom(i * 7 + 3) * 1.4,
        size: 6 + pseudoRandom(i * 7 + 4) * 8,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: pseudoRandom(i * 7 + 5) * 360,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{ x: 0, y: '-10vh', rotate: p.rotate, opacity: 1 }}
          animate={{ x: [0, 24, -16, 8], y: '110vh', rotate: p.rotate + 540, opacity: [1, 1, 0.9] }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn', repeat: 1 }}
          className="absolute top-0 rounded-[2px]"
          style={{ left: `${p.left}%`, width: p.size, height: p.size * 0.6, background: p.color }}
        />
      ))}
    </div>
  );
}

/**
 * Once-per-result celebration. PROMOTED gets a spring badge + confetti; DEMOTED
 * stays kind and quiet; STAYED is only a toast (handled in `useLeagueResult`).
 * Reduced motion falls back to a plain cross-fade.
 */
export function LeagueCelebration({
  result,
  onDone,
}: {
  result: LeaguePendingResultDto;
  onDone: () => void;
}) {
  const { t } = useLocale();
  const reduced = useReducedMotion() ?? false;
  const promoted = result.outcome === LeagueOutcome.PROMOTED;

  const title = promoted
    ? t.league.promotedTitle.replace('{arena}', arenaName(t, result.toArena))
    : t.league.demotedTitle.replace('{arena}', arenaName(t, result.toArena));
  const sub = t.league.resultSub
    .replace('{rank}', String(result.rank))
    .replace('{points}', result.points.toLocaleString());

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="league-celebration"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="bg-background/95 fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 p-6 text-center backdrop-blur-sm"
    >
      {promoted && !reduced && <Confetti />}

      <div className="relative flex items-center justify-center">
        {promoted && !reduced ? (
          <>
            <motion.div
              initial={{ x: -80, opacity: 0.4 }}
              animate={{ x: -140, opacity: 0 }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="absolute"
            >
              <ArenaBadge arena={result.fromArena} size={72} />
            </motion.div>
            <motion.div
              initial={{ scale: 0.2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16 }}
            >
              <ArenaBadge arena={result.toArena} size={96} />
            </motion.div>
          </>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ArenaBadge arena={result.toArena} size={96} />
          </motion.div>
        )}
      </div>

      <div className="space-y-1.5">
        <motion.h1
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: promoted && !reduced ? 0.35 : 0, duration: 0.3 }}
          className="text-[1.75rem] font-bold"
        >
          {title}
        </motion.h1>
        <p className="text-muted-foreground text-[1.0625rem]">{sub}</p>
      </div>

      <Button size="lg" onClick={onDone} data-testid="league-celebration-dismiss">
        {t.league.celebrationContinue}
      </Button>
    </motion.div>
  );
}

/**
 * Applies the "show once" rule: PROMOTED/DEMOTED surface the overlay; STAYED is
 * a quiet toast. Both mark the result seen so it never comes back.
 */
export function useLeagueResult(
  pending: LeaguePendingResultDto | null,
  setOverlay: (r: LeaguePendingResultDto | null) => void,
) {
  const { t } = useLocale();
  useEffect(() => {
    if (!pending) return;
    if (pending.outcome === LeagueOutcome.STAYED) {
      toast(t.league.stayedToast.replace('{arena}', arenaName(t, pending.toArena)));
      void leagueApi.markResultSeen(pending.weekKey);
      return;
    }
    setOverlay(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.weekKey]);
}

export function dismissLeagueResult(result: LeaguePendingResultDto, done: () => void) {
  void leagueApi.markResultSeen(result.weekKey);
  done();
}
