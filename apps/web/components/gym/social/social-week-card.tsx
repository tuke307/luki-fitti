'use client';

import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { NextMoveDto, SocialSummaryDto } from '@luki-fitti/common/schemas';
import { useLocale } from '@/providers/i18n/locale-context';
import { nextMoveText, nextMoveTarget, type NextMoveTarget } from '@/lib/social/next-move';

/**
 * The "This week" line of the social summary plus a progress bar and the
 * server's next-move suggestion as a tappable row. Hidden while the summary
 * has no week (points features off or not loaded yet).
 */
export function SocialWeekCard({
  week,
  nextMove,
  onNextMove,
}: {
  week: SocialSummaryDto['week'] | undefined;
  nextMove: NextMoveDto | null | undefined;
  onNextMove: (target: NextMoveTarget) => void;
}) {
  const { t, format, locale } = useLocale();
  if (!week) return null;

  const progress = week.goal > 0 ? Math.min(1, week.workouts / week.goal) : 0;
  const moveText = nextMove ? nextMoveText(t, format, nextMove, locale) : null;

  return (
    <section className="bg-card rounded-[1.25rem]" data-testid="social-week-card">
      <div className="p-4 pb-3">
        <p className="text-muted-foreground text-[0.8125rem] font-medium tracking-wide uppercase">
          {t.league.thisWeek}
        </p>
        <p className="mt-1 text-[0.9375rem] font-medium" data-testid="social-week-line">
          {format(t.social.weekLine, {
            workouts: week.workouts,
            goal: week.goal,
            points: week.points,
          })}
        </p>
        <div
          className="bg-secondary mt-2.5 h-1.5 w-full overflow-hidden rounded-full"
          role="img"
          aria-label={`${week.workouts}/${week.goal}`}
        >
          <div
            className="bg-primary h-full rounded-full transition-[width]"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
      {nextMove && moveText && (
        <button
          type="button"
          onClick={() => onNextMove(nextMoveTarget(nextMove))}
          data-testid="next-move-row"
          className="border-border/60 hover:bg-secondary/40 flex w-full items-center gap-2 border-t px-4 py-3 text-left transition-colors"
        >
          <p className="min-w-0 flex-1 text-[0.9375rem]">{moveText}</p>
          <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
