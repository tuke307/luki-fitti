'use client';

import React, { useEffect, useState } from 'react';
import { Badge } from '@luki-fitti/ui/components/ui/badge';
import { useLocale } from '@/providers/i18n/locale-context';
import { ExerciseVisual } from './exercise-visual';
import { ExerciseHistorySection } from './exercise-history-section';
import { LateralityBadge } from './laterality-badge';
import { MobileSheet } from './mobile-sheet';
import type { MuscleGroup } from '@luki-fitti/common/enums';
import type { ExerciseDto } from '@luki-fitti/common/schemas';

interface ExerciseGuideSheetProps {
  /** Catalog exercise to explain. `null` while closed or when the catalog has no match. */
  exercise: ExerciseDto | null;
  /** Shown when the exercise is not in the catalog (e.g. a renamed or removed custom exercise). */
  fallback?: { name: string; primaryMuscleGroup: MuscleGroup } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Show a friendly note instead of nothing when there are no steps. */
  showEmptyState?: boolean;
  /** Extra sections rendered below the history, e.g. alternatives. */
  children?: React.ReactNode;
}

/**
 * The phone sheet is a vaul drawer with its own Radix layer stack. Opened from a menu item, it
 * would mount while the menu is still closing: Escape then misses the drawer and the body keeps
 * `pointer-events: none` after it closes. Opening once the menu has unmounted avoids both.
 */
function useOpenAfterMenusClose(open: boolean): boolean {
  const [menusGone, setMenusGone] = useState(false);
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const waitForMenus = () => {
      if (document.querySelector('[role="menu"]')) frame = requestAnimationFrame(waitForMenus);
      else setMenusGone(true);
    };
    frame = requestAnimationFrame(waitForMenus);
    return () => {
      cancelAnimationFrame(frame);
      setMenusGone(false);
    };
  }, [open]);
  return open && menusGone;
}

export function ExerciseGuideSheet({
  exercise,
  fallback = null,
  open,
  onOpenChange,
  showEmptyState = false,
  children,
}: ExerciseGuideSheetProps) {
  const { t } = useLocale();
  const sheetOpen = useOpenAfterMenusClose(open);
  return (
    <MobileSheet
      open={sheetOpen}
      onOpenChange={onOpenChange}
      title={t.session.showGuideBtn}
      description={exercise?.name ?? fallback?.name ?? t.session.showGuideBtn}
      hideCancel
      confirm={{ label: t.common.done, onConfirm: () => onOpenChange(false) }}
      className="md:max-w-xl"
      data-testid="exercise-guide-sheet"
    >
      <ExerciseGuideContent exercise={exercise} fallback={fallback} showEmptyState={showEmptyState}>
        {children}
      </ExerciseGuideContent>
    </MobileSheet>
  );
}

type ExerciseGuideContentProps = Pick<
  ExerciseGuideSheetProps,
  'exercise' | 'fallback' | 'showEmptyState' | 'children'
>;

/** The guide body (meta, preview, steps, history) without chrome, e.g. for a page inside a sheet. */
export function ExerciseGuideContent({
  exercise,
  fallback = null,
  showEmptyState = false,
  children,
}: ExerciseGuideContentProps) {
  const { t, muscleLabel, equipmentLabel, exerciseTypeLabel } = useLocale();
  const name = exercise?.name ?? fallback?.name ?? '';
  const primaryMuscle = exercise?.primaryMuscleGroup ?? fallback?.primaryMuscleGroup;
  const steps = exercise?.instructions ?? [];
  if (!exercise && !fallback) return null;

  return (
    <div className="min-w-0 space-y-4">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {primaryMuscle && (
            <Badge variant="default" className="text-xs">
              {muscleLabel(primaryMuscle)}
            </Badge>
          )}
          {exercise && (
            <>
              <Badge variant="secondary" className="text-muted-foreground text-xs">
                {equipmentLabel(exercise.equipment)}
              </Badge>
              <Badge variant="secondary" className="text-muted-foreground text-xs">
                {exerciseTypeLabel(exercise.exerciseType)}
              </Badge>
              <LateralityBadge laterality={exercise.laterality} className="text-xs" />
            </>
          )}
        </div>
        <h3 className="font-display pt-1 text-xl leading-tight font-bold">{name}</h3>
        {exercise?.description && (
          <p className="text-muted-foreground text-xs leading-relaxed sm:text-sm">
            {exercise.description}
          </p>
        )}
      </div>

      {exercise && <ExerciseVisual exercise={exercise} variant="detail" />}

      {steps.length > 0 ? (
        <ol
          aria-label={t.exercises.executionCuesTitle}
          className="space-y-2 text-xs leading-relaxed"
        >
          {steps.map((step, idx) => (
            <li key={idx} className="bg-secondary/40 flex gap-2.5 rounded-xl p-2.5">
              <span className="bg-primary text-primary-foreground flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                {idx + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      ) : (
        showEmptyState && (
          <p className="bg-secondary/40 text-muted-foreground rounded-xl p-3 text-[0.8125rem]">
            {t.session.noGuideSteps}
          </p>
        )
      )}

      <ExerciseHistorySection
        key={exercise?.id ?? name}
        exerciseId={exercise?.id}
        exerciseName={name}
        exerciseType={exercise?.exerciseType}
      />

      {children}
    </div>
  );
}
