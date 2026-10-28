'use client';

import React from 'react';
import { Sparkles, Plus, ArrowRightLeft, X } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { trackEvent } from '@/lib/analytics/track';
import { useLocale } from '@/providers/i18n/locale-context';
import type { WorkoutExerciseSuggestion } from '@luki-fitti/common/utils/client';
import type { WeightUnit } from '@luki-fitti/common/enums';
import { ExerciseVisual } from './exercise-visual';

interface RainbowExerciseSuggestionCardProps {
  suggestion: WorkoutExerciseSuggestion;
  weightUnit: WeightUnit;
  onAdd: (suggestion: WorkoutExerciseSuggestion) => void;
  onSwap?: (suggestion: WorkoutExerciseSuggestion) => void;
  onDismiss?: () => void;
  compact?: boolean;
  testId?: string;
  /** Where the card is shown — reported with suggestion analytics events. */
  analyticsContext?: 'session' | 'template' | 'builder';
}

export function RainbowExerciseSuggestionCard({
  suggestion,
  weightUnit,
  onAdd,
  onSwap,
  onDismiss,
  compact = false,
  testId = 'rainbow-exercise-suggestion',
  analyticsContext: context = 'session',
}: RainbowExerciseSuggestionCardProps) {
  const { t, format, muscleLabel } = useLocale();
  const {
    suggestedExercise,
    targetMuscle,
    reasonType,
    stallingExerciseName,
    splitArchetype,
    evidence,
  } = suggestion;

  const reasonTemplates: Record<WorkoutExerciseSuggestion['reasonType'], string> = {
    PLATEAU: t.workouts.suggestionReasonPlateau,
    GRINDING: t.workouts.suggestionReasonGrinding,
    REGRESSION: t.workouts.suggestionReasonRegression,
    MISSING_MUSCLE: t.workouts.suggestionReasonMissingMuscle,
    LOW_VOLUME: t.workouts.suggestionReasonLowVolume,
  };
  const reasonText = format(reasonTemplates[reasonType], {
    stalling: stallingExerciseName ?? '',
    name: suggestedExercise.name,
    muscle: muscleLabel(targetMuscle),
    split: splitArchetype.replace('_', ' '),
  });

  const roundedChange = Math.round(evidence.changePct);
  const evidenceText =
    reasonType === 'PLATEAU'
      ? format(
          evidence.weeksSinceBest >= 1
            ? t.workouts.suggestionChipPlateauWeeks
            : t.workouts.suggestionChipPlateau,
          { sessions: evidence.sessionsSinceBest, weeks: evidence.weeksSinceBest },
        )
      : reasonType === 'GRINDING'
        ? format(t.workouts.suggestionChipGrinding, {
            hard: evidence.hardSessionsRecent,
            window: evidence.recentWindow,
          })
        : reasonType === 'REGRESSION'
          ? format(t.workouts.suggestionChipRegression, {
              change: `${roundedChange < 0 ? '−' : ''}${Math.abs(roundedChange)}`,
              window: evidence.recentWindow,
            })
          : evidence.setsTotal > 0
            ? format(t.workouts.suggestionChipSets, {
                sets: evidence.setsForMuscle,
                total: evidence.setsTotal,
              })
            : null;

  const repRangeText =
    suggestion.recommendedRepsMin !== suggestion.recommendedRepsMax
      ? `${suggestion.recommendedRepsMin}–${suggestion.recommendedRepsMax}`
      : `${suggestion.recommendedRepsMin}`;

  return (
    <div
      data-testid={testId}
      className={`bg-card ring-border/70 rounded-[1.25rem] ring-1 ${compact ? 'p-3.5' : 'p-4'}`}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-primary flex items-center gap-1.5 text-[0.8125rem] font-semibold">
            <Sparkles className="h-3.5 w-3.5" />
            {t.workouts.smartSuggestionBadge}
            <span className="text-muted-foreground font-medium">· {muscleLabel(targetMuscle)}</span>
          </p>

          {onDismiss && (
            <button
              type="button"
              onClick={() => {
                trackEvent('suggestion_dismiss', { context });
                onDismiss();
              }}
              title={t.workouts.dismissSuggestionTitle}
              aria-label={t.workouts.dismissSuggestionTitle}
              className="text-muted-foreground hover:bg-secondary hover:text-foreground -m-1 flex size-8 items-center justify-center rounded-full transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <ExerciseVisual
              exercise={suggestedExercise}
              variant="thumbnail"
              className="h-12 w-14 shrink-0"
            />
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-[0.9375rem] font-semibold">{suggestedExercise.name}</span>
                <span className="bg-secondary text-secondary-foreground tabular-nums rounded-full px-2.5 py-0.5 text-[0.8125rem] font-medium">
                  {suggestion.recommendedSets}×{repRangeText}
                  {suggestion.recommendedWeight
                    ? ` · ${suggestion.recommendedWeight} ${weightUnit.toLowerCase()}`
                    : ''}
                </span>
              </div>
              <p className="text-muted-foreground text-[0.8125rem] leading-snug">{reasonText}</p>
              {evidenceText && (
                <span
                  data-testid={`${testId}-evidence`}
                  className="bg-secondary/60 text-muted-foreground tabular-nums inline-block rounded-full px-2 py-0.5 text-[0.75rem] font-medium"
                >
                  {evidenceText}
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              data-testid={`${testId}-add-btn`}
              onClick={() => {
                trackEvent('suggestion_accept', { action: 'add', context });
                onAdd(suggestion);
              }}
            >
              <Plus className="h-4 w-4" />
              {t.workouts.addSuggestedBtn}
            </Button>
            {onSwap && stallingExerciseName && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                data-testid={`${testId}-swap-btn`}
                onClick={() => {
                  trackEvent('suggestion_accept', { action: 'swap', context });
                  onSwap(suggestion);
                }}
              >
                <ArrowRightLeft className="h-4 w-4" />
                {format(t.workouts.swapSuggestedBtn, { name: stallingExerciseName })}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
