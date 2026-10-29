'use client';

import React from 'react';
import { Badge } from '@luki-fitti/ui/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@luki-fitti/ui/components/ui/dialog';
import { useLocale } from '@/providers/i18n/locale-context';
import { ExerciseVisual } from './exercise-visual';
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
  /** Extra sections rendered below the steps, e.g. alternatives or history. */
  children?: React.ReactNode;
}

export function ExerciseGuideSheet({
  exercise,
  fallback = null,
  open,
  onOpenChange,
  showEmptyState = false,
  children,
}: ExerciseGuideSheetProps) {
  const { t, muscleLabel, equipmentLabel, exerciseTypeLabel } = useLocale();
  const name = exercise?.name ?? fallback?.name ?? '';
  const primaryMuscle = exercise?.primaryMuscleGroup ?? fallback?.primaryMuscleGroup;
  const steps = exercise?.instructions ?? [];
  const hasContent = Boolean(exercise || fallback);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="exercise-guide-sheet"
        className="max-h-[90dvh] overflow-hidden p-4 sm:max-w-xl sm:p-6"
      >
        {hasContent && (
          <div className="flex max-h-[calc(90dvh-2.5rem)] min-w-0 flex-col gap-3 overflow-hidden">
            <DialogHeader className="shrink-0">
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
                  </>
                )}
              </div>
              <DialogTitle className="font-display pt-1 text-xl font-bold">{name}</DialogTitle>
              <DialogDescription
                className={exercise?.description ? 'text-xs leading-relaxed sm:text-sm' : 'sr-only'}
              >
                {exercise?.description || name}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-0.5">
              {exercise && <ExerciseVisual exercise={exercise} variant="detail" />}

              {steps.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="font-display text-sm font-bold">
                    {t.exercises.executionCuesTitle}
                  </h3>
                  <ol className="space-y-2 text-xs leading-relaxed">
                    {steps.map((step, idx) => (
                      <li key={idx} className="bg-secondary/40 flex gap-2.5 rounded-xl p-2.5">
                        <span className="bg-primary text-primary-foreground flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                          {idx + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : (
                showEmptyState && (
                  <p className="bg-secondary/40 text-muted-foreground rounded-xl p-3 text-[0.8125rem]">
                    {t.session.noGuideSteps}
                  </p>
                )
              )}

              {children}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
