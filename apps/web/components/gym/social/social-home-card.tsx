'use client';

import React from 'react';
import { ChevronRight, Users } from 'lucide-react';
import { useLocale } from '@/providers/i18n/locale-context';
import { useSocialSummary } from '@/lib/social/use-social-summary';
import { nextMoveText, nextMoveTarget } from '@/lib/social/next-move';
import type { SocialSection } from './social-view';

/**
 * Small "Social" card on the Today tab: the same This-week line and next-move
 * line as the hub. A tap opens the Social tab at the next move's target (or
 * the hub). Hidden while social is off or the summary has not loaded.
 */
export function SocialHomeCard({
  enabled,
  onNavigate,
}: {
  enabled: boolean;
  onNavigate: (section: SocialSection) => void;
}) {
  const { t, format, locale } = useLocale();
  const { summary } = useSocialSummary(enabled);

  if (!enabled || !summary?.week) return null;

  const move = summary.nextMove;
  const target: SocialSection = move ? nextMoveTarget(move) : null;

  return (
    <button
      type="button"
      onClick={() => onNavigate(target)}
      data-testid="home-social-card"
      className="bg-card hover:bg-secondary/30 flex w-full items-center gap-3 rounded-[1.25rem] p-5 text-left transition-colors"
    >
      <Users className="text-muted-foreground h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="text-muted-foreground block text-[0.8125rem] font-medium tracking-wide uppercase">
          {t.nav.social}
        </span>
        <span className="mt-0.5 block truncate text-[0.9375rem] font-medium">
          {format(t.social.weekLine, {
            workouts: summary.week.workouts,
            goal: summary.week.goal,
            points: summary.week.points,
          })}
        </span>
        {move && (
          <span className="text-muted-foreground mt-0.5 block truncate text-[0.8125rem]">
            {nextMoveText(t, format, move, locale)}
          </span>
        )}
      </span>
      <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden="true" />
    </button>
  );
}
