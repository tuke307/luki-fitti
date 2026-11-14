'use client';

import React, { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import type { DuelItemDto } from '@luki-fitti/common/schemas';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { useLocale } from '@/providers/i18n/locale-context';
import { duelsApi } from '@/lib/social/social-api';
import { Confetti } from './league-celebration';
import { UserAvatar } from './user-avatar';

/** The signed-in user's identity for avatar spots in duel UI. */
export interface MyProfile {
  handle: string | null;
  name: string | null;
  avatarUrl: string | null;
}

const formatScore = (n: number, bcp47: string) => n.toLocaleString(bcp47);

/**
 * Once-per-result duel overlay. WON gets the loud treatment (trophy, radial
 * glow, confetti burst); TIE stays shared and warm; LOST stays kind and offers
 * a Rematch button that fires a fresh challenge. Reduced motion falls back to
 * a plain cross-fade. Dismiss marks the result seen via POST /duels/:id/seen.
 */
export function DuelCelebration({
  result,
  onDone,
  onRematch,
}: {
  result: DuelItemDto;
  onDone: () => void;
  /** Fires a new challenge to the same opponent, then dismisses. */
  onRematch: (opponentId: string) => void;
}) {
  const { t, locale } = useLocale();
  const bcp47 = locale === 'de' ? 'de-DE' : 'en-GB';
  const reduced = useReducedMotion() ?? false;
  const won = result.outcome === 'WON';
  const tie = result.outcome === 'TIE';
  const loud = won && !reduced;
  const handle = `@${result.opponent.handle}`;
  const score = `${formatScore(result.you, bcp47)}–${formatScore(result.them, bcp47)}`;

  const title = won
    ? `${t.battle.wonTitle.replace('{handle}', handle)} ${score}`
    : tie
      ? `${t.battle.tieTitle} ${score}`
      : `${t.battle.lostTitle.replace('{handle}', handle)} ${formatScore(result.them, bcp47)}–${formatScore(result.you, bcp47)}`;

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="duel-celebration"
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
              background: 'radial-gradient(circle, rgba(255,213,74,0.55) 0%, transparent 65%)',
            }}
          />
        )}
        {loud ? (
          <motion.div
            initial={{ scale: 0.3, y: 40, opacity: 0 }}
            animate={{ scale: [0.3, 1.15, 1], y: 0, opacity: 1 }}
            transition={{ duration: 0.9, times: [0, 0.45, 1], ease: 'easeOut' }}
            className="relative"
          >
            <Trophy className="h-44 w-44 text-amber-400" strokeWidth={1.2} aria-hidden="true" />
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {won ? (
              <Trophy className="h-28 w-28 text-amber-400" strokeWidth={1.4} aria-hidden="true" />
            ) : (
              <UserAvatar
                avatarUrl={result.opponent.avatarUrl}
                name={result.opponent.name}
                handle={result.opponent.handle}
                className="size-24"
              />
            )}
          </motion.div>
        )}
      </div>

      <div className="space-y-2">
        <motion.h1
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: loud ? 0.5 : 0, duration: 0.3 }}
          className={
            won ? 'text-[2.5rem] leading-tight font-extrabold' : 'text-[1.75rem] font-bold'
          }
        >
          {title}
        </motion.h1>
        {result.outcome === 'LOST' && (
          <p className="text-muted-foreground text-[1.25rem]">{t.battle.rematchHint}</p>
        )}
      </div>

      <div className="flex gap-3">
        {result.outcome === 'LOST' && (
          <Button
            size="lg"
            variant="secondary"
            onClick={() => onRematch(result.opponent.userId)}
            data-testid="duel-rematch"
          >
            {t.battle.rematch}
          </Button>
        )}
        <Button size="lg" onClick={onDone} data-testid="duel-celebration-dismiss">
          {t.league.celebrationContinue}
        </Button>
      </div>
    </motion.div>
  );
}

/** Applies the "show once" rule for `DuelListDto.pendingResult`. */
export function useDuelResult(
  pending: DuelItemDto | null,
  setOverlay: (r: DuelItemDto | null) => void,
) {
  useEffect(() => {
    if (pending) setOverlay(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.id]);
}

export function dismissDuelResult(result: DuelItemDto, done: () => void) {
  void duelsApi.markSeen(result.id);
  done();
}
