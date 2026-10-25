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
  const { suggestedExercise, targetMuscle, reasonType, stallingExerciseName, splitArchetype } =
    suggestion;

  const reasonText =
    reasonType === 'HIGH_FATIGUE' && stallingExerciseName
      ? format(t.workouts.suggestionReasonHighFatigue, {
          stalling: stallingExerciseName,
          name: suggestedExercise.name,
          muscle: muscleLabel(targetMuscle),
        })
      : reasonType === 'PLATEAU' && stallingExerciseName
        ? format(t.workouts.suggestionReasonPlateau, {
            muscle: muscleLabel(targetMuscle),
            stalling: stallingExerciseName,
            name: suggestedExercise.name,
          })
        : format(t.workouts.suggestionReasonSplitBalance, {
            muscle: muscleLabel(targetMuscle),
            split: splitArchetype.replace('_', ' '),
          });

  const repRangeText =
    suggestion.recommendedRepsMin !== suggestion.recommendedRepsMax
      ? `${suggestion.recommendedRepsMin}–${suggestion.recommendedRepsMax}`
      : `${suggestion.recommendedRepsMin}`;

  return (
    <div
      data-testid={testId}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-destructive via-warning via-success via-cyan-400 to-fuchsia-500 p-[1.5px] shadow-md transition-all"
    >
      <div
        className={`bg-card/95 relative overflow-hidden rounded-[calc(1rem-1.5px)] ${
          compact ? 'p-3' : 'p-3.5 sm:p-4'
        }`}
      >
        {/* Subtle iridescent rainbow backdrop glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-destructive/10 via-warning/10 via-success/10 via-cyan-400/10 to-fuchsia-500/10"
        />

        <div className="relative space-y-2.5">
          {/* Header: Rainbow Badge + Target Muscle + Dismiss */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-destructive via-warning via-success via-cyan-500 to-fuchsia-500 px-2.5 py-0.5 text-xs font-semibold text-black shadow-xs">
                <Sparkles className="h-3 w-3 fill-current" />
                {t.workouts.smartSuggestionBadge}
              </span>
              <span className="bg-secondary/80 text-foreground rounded-full px-2 py-0.5 text-xs font-bold">
                {muscleLabel(targetMuscle)}
              </span>
            </div>

            {onDismiss && (
              <button
                type="button"
                onClick={() => {
                  trackEvent('suggestion_dismiss', { context });
                  onDismiss();
                }}
                title={t.workouts.dismissSuggestionTitle}
                aria-label={t.workouts.dismissSuggestionTitle}
                className="text-muted-foreground hover:text-foreground rounded-lg p-1 transition"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Exercise Info + Reason */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2.5">
              <ExerciseVisual
                exercise={suggestedExercise}
                variant="thumbnail"
                className="h-11 w-14 shrink-0"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-display truncate text-xs font-semibold sm:text-sm">
                    {suggestedExercise.name}
                  </span>
                  <span className="tabular-nums rounded-md bg-cyan-500/20 px-2 py-0.5 text-xs font-bold text-cyan-300">
                    {suggestion.recommendedSets}×{repRangeText}
                    {suggestion.recommendedWeight
                      ? ` ${suggestion.recommendedWeight} ${weightUnit.toLowerCase()}`
                      : ''}
                  </span>
                </div>
                <p className="text-muted-foreground mt-0.5 text-xs leading-snug">
                  {reasonText}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="xs"
                data-testid={`${testId}-add-btn`}
                onClick={() => {
                  trackEvent('suggestion_accept', { action: 'add', context });
                  onAdd(suggestion);
                }}
                className="bg-gradient-to-r from-destructive via-warning via-success to-cyan-400 font-semibold text-black hover:opacity-95"
              >
                <Plus className="h-3 w-3 stroke-[2.5]" />
                {t.workouts.addSuggestedBtn}
              </Button>
              {onSwap && stallingExerciseName && (
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  data-testid={`${testId}-swap-btn`}
                  onClick={() => {
                    trackEvent('suggestion_accept', { action: 'swap', context });
                    onSwap(suggestion);
                  }}
                  className="font-semibold"
                >
                  <ArrowRightLeft className="h-3 w-3" />
                  {format(t.workouts.swapSuggestedBtn, { name: stallingExerciseName })}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
