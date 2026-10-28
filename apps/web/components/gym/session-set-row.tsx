'use client';

import React from 'react';
import { Check, Minus, Plus, Sparkles, Trash2 } from 'lucide-react';
import { ExerciseType, SetType } from '@luki-fitti/common/enums';
import {
  formatCompactDelta,
  type ExerciseProgressionInsight,
  type SetProgressionSuggestion,
} from '@luki-fitti/common/utils/client';
import type { SessionExerciseDto, SessionSetDto } from '@luki-fitti/common/schemas';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@luki-fitti/ui/components/ui/dropdown-menu';
import { useGym } from '@/providers/gym/gym-context';
import { useLocale } from '@/providers/i18n/locale-context';
import { unitLabel, weightStep } from '@/lib/format/weight';
import { NumberInput } from './number-input';
import { SET_TYPE_TEXT_CLASS, SetTypeBadge } from './set-type-badge';
import { SwipeRow } from './swipe-row';

const SET_TYPE_ORDER = [SetType.WARMUP, SetType.WORKING, SetType.DROPSET, SetType.STRETCH] as const;

/** Aligns progression suggestions to sets: only working-type sets get one (warm-ups/stretches don't). */
export function alignSetSuggestions(
  exercise: SessionExerciseDto,
  insight: ExerciseProgressionInsight | null,
): Array<SetProgressionSuggestion | null> {
  let workingIdx = 0;
  return exercise.sets.map((set) => {
    const isStretch =
      exercise.exerciseTypeSnapshot === ExerciseType.STRETCHING || set.setType === SetType.STRETCH;
    if (isStretch || set.setType === SetType.WARMUP || !insight) return null;
    return (
      insight.setSuggestions[workingIdx++] ??
      insight.setSuggestions[insight.setSuggestions.length - 1] ??
      null
    );
  });
}

interface SessionSetRowProps {
  exercise: SessionExerciseDto;
  set: SessionSetDto;
  /** 0-based position of the set inside its exercise. */
  setIndex: number;
  badgeLabel: string;
  suggestion: SetProgressionSuggestion | null;
  /** Shown above the inputs in superset rounds, e.g. "A · Shoulder Press". */
  contextLabel?: string;
  testId?: string;
}

export function SessionSetRow({
  exercise: ex,
  set,
  setIndex: sIdx,
  badgeLabel,
  suggestion: setSuggestion,
  contextLabel,
  testId,
}: SessionSetRowProps) {
  const { updateSet, toggleCompleteSet, removeSetFromExercise } = useGym();
  const { t, format, setTypeLabel } = useLocale();
  const n = sIdx + 1;
  const step = weightStep(set.weightUnit);
  const unit = unitLabel(set.weightUnit);
  const removeSet = () => void removeSetFromExercise(ex.clientExerciseId, set.clientSetId);

  const isStretchSet =
    ex.exerciseTypeSnapshot === ExerciseType.STRETCHING || set.setType === SetType.STRETCH;
  const patch = (p: Parameters<typeof updateSet>[2]) =>
    void updateSet(ex.clientExerciseId, set.clientSetId, p);

  const dynamicWeightDelta =
    setSuggestion?.suggestedWeight !== null &&
    setSuggestion?.suggestedWeight !== undefined &&
    (set.weight ?? setSuggestion.lastWeight ?? 0) > 0
      ? Math.round(
          (setSuggestion.suggestedWeight - (set.weight ?? setSuggestion.lastWeight ?? 0)) * 100,
        ) / 100
      : 0;
  const dynamicRepsDelta =
    setSuggestion?.suggestedReps !== null &&
    setSuggestion?.suggestedReps !== undefined &&
    (set.reps ?? setSuggestion.lastReps ?? 0) > 0
      ? setSuggestion.suggestedReps - (set.reps ?? setSuggestion.lastReps ?? 0)
      : 0;

  const weightBadgeLabel = !set.completed ? formatCompactDelta(dynamicWeightDelta) : null;
  const repsBadgeLabel = !set.completed ? formatCompactDelta(dynamicRepsDelta) : null;

  const intensityLevel =
    set.rpe === null || set.rpe === undefined ? 0 : set.rpe <= 7.5 ? 1 : set.rpe < 9.5 ? 2 : 3;
  const intensityMeta = [
    {
      label: t.session.intensityEffort,
      hint: t.session.intensityEffortHint,
      nextRpe: 7,
      activeBarClass: 'bg-muted-foreground/30',
    },
    {
      label: t.session.intensityLight,
      hint: t.session.intensityLightHint,
      nextRpe: 8,
      activeBarClass: 'bg-success',
    },
    {
      label: t.session.intensitySweetSpot,
      hint: t.session.intensitySweetSpotHint,
      nextRpe: 9.5,
      activeBarClass: 'bg-warning',
    },
    {
      label: t.session.intensityLimit,
      hint: t.session.intensityLimitHint,
      nextRpe: null,
      activeBarClass: 'bg-destructive',
    },
  ][intensityLevel]!;

  const loggedPrescriptionSummary = isStretchSet
    ? `${set.durationSeconds ?? 45} ${t.common.sec}`
    : `${set.weight ?? 0} ${unit} × ${set.reps ?? 0}`;

  const hasSuggestion =
    !set.completed &&
    setSuggestion &&
    ((weightBadgeLabel && setSuggestion.suggestedWeight !== null) ||
      (repsBadgeLabel && setSuggestion.suggestedReps !== null));

  const stepperBtn =
    'text-foreground/70 hover:text-foreground flex h-11 w-9 shrink-0 items-center justify-center rounded-lg transition-colors active:bg-background/70';
  const isSpecialType = set.setType !== SetType.WORKING;

  return (
    <SwipeRow
      className="rounded-xl"
      trailingActions={[
        {
          id: 'delete',
          label: t.common.delete,
          icon: Trash2,
          tone: 'destructive',
          onSelect: removeSet,
        },
      ]}
    >
      <div
        data-testid={testId ?? `session-set-row-${sIdx + 1}`}
        data-set-logged={set.completed ? 'true' : 'false'}
        data-set-type={set.setType}
        className="py-1.5"
      >
        {contextLabel && (
          <p className="text-muted-foreground mb-1 ml-11 truncate text-[0.75rem] font-medium">
            {contextLabel}
          </p>
        )}
        <div className="flex items-center gap-2">
          {/* Set badge opens the set menu: type picker plus Delete, so nothing is swipe-only. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-testid="set-menu-trigger"
                aria-label={format(t.a11y.setTypeMenu, { n, type: setTypeLabel(set.setType) })}
                className="focus-visible:ring-ring/50 -m-1 flex size-11 shrink-0 items-center justify-center rounded-full outline-hidden focus-visible:ring-[3px]"
              >
                <SetTypeBadge setType={set.setType} label={badgeLabel} completed={set.completed} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuLabel>{t.session.setTypeHeading}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={set.setType}
                onValueChange={(v) => patch({ setType: v as SetType })}
              >
                {SET_TYPE_ORDER.map((type) => (
                  <DropdownMenuRadioItem key={type} value={type}>
                    {setTypeLabel(type)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={removeSet}>
                <Trash2 /> {t.session.deleteSetBtn}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {set.completed ? (
            <span
              data-testid="logged-set-summary-pill"
              className="tabular-nums min-w-0 flex-1 truncate px-1 text-[1.0625rem]"
            >
              {isSpecialType && (
                <span
                  className={`mr-1.5 text-[0.8125rem] font-semibold ${SET_TYPE_TEXT_CLASS[set.setType]}`}
                >
                  {setTypeLabel(set.setType)}
                </span>
              )}
              <span className="text-muted-foreground">{loggedPrescriptionSummary}</span>
            </span>
          ) : isStretchSet ? (
            <div className="bg-secondary flex h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-xl px-2">
              <NumberInput
                variant="bare"
                min={0}
                fallbackValue={45}
                aria-label={format(t.a11y.setDuration, { n })}
                value={set.durationSeconds ?? 45}
                onValueChange={(val) => patch({ durationSeconds: val })}
                className="font-rounded w-14 bg-transparent text-center text-[1.0625rem] font-semibold outline-none"
              />
              <span className="text-muted-foreground text-[0.8125rem]">{t.common.sec}</span>
            </div>
          ) : (
            <>
              <div className="bg-secondary flex h-11 min-w-0 flex-[1.3] items-center rounded-xl px-0.5">
                <button
                  type="button"
                  aria-label={format(t.a11y.decreaseWeight, { step, n })}
                  onClick={() => patch({ weight: Math.max(0, (set.weight ?? 0) - step) })}
                  className={stepperBtn}
                >
                  <Minus className="h-4 w-4" />
                </button>
                <div className="flex min-w-0 flex-1 items-baseline justify-center gap-0.5">
                  <NumberInput
                    variant="bare"
                    allowNull
                    step="0.5"
                    min={0}
                    aria-label={format(t.a11y.setWeight, { n })}
                    value={set.weight}
                    onValueChange={(val) => patch({ weight: val })}
                    placeholder="0"
                    className="font-rounded w-full min-w-0 bg-transparent text-center text-[1.0625rem] font-semibold outline-none"
                  />
                  <span className="text-muted-foreground text-[0.8125rem]">{unit}</span>
                </div>
                <button
                  type="button"
                  aria-label={format(t.a11y.increaseWeight, { step, n })}
                  onClick={() => patch({ weight: (set.weight ?? 0) + step })}
                  className={stepperBtn}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <div className="bg-secondary flex h-11 min-w-0 flex-1 items-center rounded-xl px-0.5">
                <button
                  type="button"
                  aria-label={format(t.a11y.decreaseReps, { n })}
                  onClick={() => patch({ reps: Math.max(0, (set.reps ?? 0) - 1) })}
                  className={stepperBtn}
                >
                  <Minus className="h-4 w-4" />
                </button>
                <NumberInput
                  variant="bare"
                  allowNull
                  min={0}
                  aria-label={format(t.a11y.setReps, { n })}
                  value={set.reps}
                  onValueChange={(val) => patch({ reps: val })}
                  placeholder="0"
                  className="font-rounded w-full min-w-0 bg-transparent text-center text-[1.0625rem] font-semibold outline-none"
                />
                <button
                  type="button"
                  aria-label={format(t.a11y.increaseReps, { n })}
                  onClick={() => patch({ reps: (set.reps ?? 0) + 1 })}
                  className={stepperBtn}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </>
          )}

          {set.completed && (
            <button
              type="button"
              aria-label={format(t.a11y.setIntensity, { n, label: intensityMeta.label })}
              title={intensityMeta.hint}
              onClick={() => patch({ rpe: intensityMeta.nextRpe })}
              className="hover:bg-secondary flex size-11 shrink-0 items-end justify-center gap-0.5 rounded-full pb-3.5 transition-colors"
            >
              {[1, 2, 3].map((barIdx) => (
                <span
                  key={barIdx}
                  aria-hidden="true"
                  className={`w-1 rounded-full ${
                    barIdx === 1 ? 'h-2' : barIdx === 2 ? 'h-3' : 'h-4'
                  } ${barIdx <= intensityLevel ? intensityMeta.activeBarClass : 'bg-muted-foreground/25'}`}
                />
              ))}
            </button>
          )}

          <button
            type="button"
            onClick={() => void toggleCompleteSet(ex.clientExerciseId, set.clientSetId)}
            aria-label={format(set.completed ? t.a11y.uncompleteSet : t.a11y.completeSet, { n })}
            title={set.completed ? t.session.tapToUndoSet : t.session.logSetBtn}
            className={`flex size-11 shrink-0 items-center justify-center rounded-full transition-[transform,background-color] duration-150 active:scale-90 ${
              set.completed
                ? 'bg-success text-success-foreground'
                : 'bg-primary/12 text-primary hover:bg-primary/18'
            }`}
          >
            <Check className="h-5 w-5 stroke-[2.5]" />
          </button>
        </div>

        {hasSuggestion && setSuggestion && (
          <button
            type="button"
            onClick={() =>
              patch({
                ...(setSuggestion.suggestedWeight !== null
                  ? { weight: setSuggestion.suggestedWeight }
                  : {}),
                ...(setSuggestion.suggestedReps !== null
                  ? { reps: setSuggestion.suggestedReps }
                  : {}),
              })
            }
            aria-label={format(t.a11y.applySuggestion, {
              value: [weightBadgeLabel, repsBadgeLabel].filter(Boolean).join(' '),
            })}
            className="text-primary ml-11 flex min-h-11 items-center gap-1 text-[0.8125rem] font-medium"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="tabular-nums">
              {[
                weightBadgeLabel ? `${weightBadgeLabel} ${unit}` : null,
                repsBadgeLabel ? `${repsBadgeLabel} ${t.common.reps}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </button>
        )}
      </div>
    </SwipeRow>
  );
}
