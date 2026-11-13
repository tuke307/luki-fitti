'use client';

import React, { useEffect, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { LeagueOutcome } from '@luki-fitti/common/enums';
import type { LeaguePendingResultDto } from '@luki-fitti/common/schemas';
import { ARENA_STYLE } from '@luki-fitti/common/league';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { useLocale } from '@/providers/i18n/locale-context';
import { ArenaBadge } from './arena-badge';
import { arenaName } from './league-card';
import { leagueApi } from '@/lib/social/social-api';
import { toast } from '@luki-fitti/ui/components/ui/sonner';

const CONFETTI_COLORS = ['#FFD54A', '#8EF0E2', '#8FD0FF', '#FF7A59', '#8A6BD1', '#34D399'];

/** Same shield outline as `ArenaBadge` — reused to clip the shine sweep. */
const SHIELD_PATH = 'M20 2 L34 7 V19 C34 29 28 35.5 20 38 C12 35.5 6 29 6 19 V7 Z';

/** Deterministic pseudo-random in [0,1) so confetti stays pure under the React compiler. */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Dense radial burst out of the badge (~120 pieces over the first 2.5 s, eased
 * outward with a gravity drop), then a light top-down drizzle that keeps going.
 */
function Confetti() {
  const burst = useMemo(
    () =>
      Array.from({ length: 120 }, (_, i) => ({
        id: i,
        angle: pseudoRandom(i * 7 + 1) * Math.PI * 2,
        distance: 180 + pseudoRandom(i * 7 + 2) * 320,
        delay: pseudoRandom(i * 7 + 3) * 0.3,
        duration: 1.6 + pseudoRandom(i * 7 + 4) * 0.9,
        size: 5 + pseudoRandom(i * 7 + 5) * 9,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: pseudoRandom(i * 7 + 6) * 360,
      })),
    [],
  );
  const drizzle = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        id: i,
        left: pseudoRandom(i * 11 + 1) * 100,
        delay: 2.4 + pseudoRandom(i * 11 + 2) * 1.2,
        duration: 3 + pseudoRandom(i * 11 + 3) * 1.6,
        size: 4 + pseudoRandom(i * 11 + 4) * 6,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: pseudoRandom(i * 11 + 5) * 360,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {burst.map((p) => (
        <motion.span
          key={`b-${p.id}`}
          initial={{ x: 0, y: 0, rotate: p.rotate, opacity: 1 }}
          animate={{
            x: Math.cos(p.angle) * p.distance,
            y: Math.sin(p.angle) * p.distance * 0.6 + p.distance * 0.75,
            rotate: p.rotate + 540,
            opacity: [1, 1, 0],
          }}
          transition={{ duration: p.duration, delay: p.delay, ease: [0.15, 0.6, 0.45, 1] }}
          className="absolute top-[38%] left-1/2 rounded-[2px]"
          style={{ width: p.size, height: p.size * 0.6, background: p.color }}
        />
      ))}
      {drizzle.map((p) => (
        <motion.span
          key={`d-${p.id}`}
          initial={{ x: 0, y: '-10vh', rotate: p.rotate, opacity: 0.9 }}
          animate={{
            x: [0, 24, -16, 8],
            y: '110vh',
            rotate: p.rotate + 360,
            opacity: [0.9, 0.9, 0],
          }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
          className="absolute top-0 rounded-[2px]"
          style={{ left: `${p.left}%`, width: p.size, height: p.size * 0.6, background: p.color }}
        />
      ))}
    </div>
  );
}

/** White sheen sweeping across the badge, clipped to the shield silhouette. */
function BadgeShine({ size }: { size: number }) {
  const clipId = React.useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
    >
      <defs>
        <clipPath id={clipId}>
          <path d={SHIELD_PATH} />
        </clipPath>
        <linearGradient id={`${clipId}-shine`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <motion.rect
          x={-20}
          y={-10}
          width={14}
          height={60}
          fill={`url(#${clipId}-shine)`}
          initial={{ x: -20 }}
          animate={{ x: 60 }}
          transition={{ delay: 0.55, duration: 0.6, ease: 'linear' }}
        />
      </g>
    </svg>
  );
}

/**
 * Once-per-result celebration. PROMOTED gets the loud treatment: 180 px badge
 * springing 0.3 → 1.15 → 1 over a radial arena-colour glow with a shine sweep,
 * the old badge sliding away, a confetti burst plus drizzle. DEMOTED stays kind
 * and quiet; STAYED is only a toast (handled in `useLeagueResult`). Reduced
 * motion falls back to a plain cross-fade.
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
  const style = ARENA_STYLE[result.toArena];

  const title = promoted
    ? t.league.promotedTitle.replace('{arena}', arenaName(t, result.toArena))
    : t.league.demotedTitle.replace('{arena}', arenaName(t, result.toArena));
  const sub = t.league.resultSub
    .replace('{rank}', String(result.rank))
    .replace('{points}', result.points.toLocaleString());

  const loud = promoted && !reduced;

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="league-celebration"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="bg-background/95 fixed inset-0 z-50 flex flex-col items-center justify-center gap-7 p-6 text-center backdrop-blur-sm"
    >
      {loud && <Confetti />}

      <div className="relative flex h-56 items-center justify-center">
        {loud && (
          <motion.div
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: [0.3, 1.15, 1], opacity: 1 }}
            transition={{ duration: 0.9, times: [0, 0.45, 1], ease: 'easeOut' }}
            className="absolute h-72 w-72 rounded-full"
            style={{
              background: `radial-gradient(circle, ${style.from}8C 0%, transparent 65%)`,
            }}
          />
        )}

        {/* Old badge: visible first, drops and fades as the new one lands. */}
        {loud && (
          <motion.div
            initial={{ y: 0, opacity: 1 }}
            animate={{ y: 90, opacity: 0 }}
            transition={{ delay: 0.1, duration: 0.45, ease: 'easeIn' }}
            className="absolute"
          >
            <ArenaBadge arena={result.fromArena} size={180} />
          </motion.div>
        )}

        {loud ? (
          <motion.div
            initial={{ scale: 0.3, y: 40, opacity: 0 }}
            animate={{ scale: [0.3, 1.15, 1], y: 0, opacity: 1 }}
            transition={{ duration: 0.9, times: [0, 0.45, 1], ease: 'easeOut' }}
            className="relative"
          >
            <ArenaBadge arena={result.toArena} size={180} />
            <BadgeShine size={180} />
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ArenaBadge arena={result.toArena} size={promoted ? 180 : 96} />
          </motion.div>
        )}
      </div>

      <div className="space-y-2">
        <motion.h1
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: loud ? 0.5 : 0, duration: 0.3 }}
          className={
            promoted ? 'text-[2.5rem] leading-tight font-extrabold' : 'text-[1.75rem] font-bold'
          }
          style={
            promoted
              ? {
                  backgroundImage: `linear-gradient(90deg, ${style.from}, ${style.to})`,
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  color: 'transparent',
                }
              : undefined
          }
        >
          {title}
        </motion.h1>
        <p className="text-muted-foreground text-[1.25rem]">{sub}</p>
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
