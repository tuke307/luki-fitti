'use client';

import React, { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Dumbbell, Search, X } from 'lucide-react';
import { Badge } from '@luki-fitti/ui/components/ui/badge';
import { Button } from '@luki-fitti/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@luki-fitti/ui/components/ui/dialog';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { cn } from '@luki-fitti/ui/lib/utils';
import { EQUIPMENT_LABELS, MUSCLE_GROUP_LABELS, MuscleGroup } from '@luki-fitti/common/enums';
import { getExerciseSearchNames, INITIAL_EXERCISE_CATALOG } from '@luki-fitti/common/catalog';
import type { ExerciseDto } from '@luki-fitti/common/schemas';
import {
  buildExerciseSearchIndex,
  searchExercises,
  type ExerciseSearchIndex,
} from '@luki-fitti/common/utils/client';
import { de } from '@/lib/i18n';
import { useLocale } from '@/providers/i18n/locale-context';
import { ExerciseVisual } from './exercise-visual';

const CORE_EXERCISE_IDS = new Set(INITIAL_EXERCISE_CATALOG.map((e) => e.id));
const searchIndexes = new WeakMap<ExerciseDto[], ExerciseSearchIndex>();

/** Search index of a catalog array, built once per array (the catalog is replaced, not mutated). */
export function searchIndexFor(exercises: ExerciseDto[]): ExerciseSearchIndex {
  let index = searchIndexes.get(exercises);
  if (!index) {
    index = buildExerciseSearchIndex(exercises, {
      // System exercises are searchable by their name in every language.
      names: getExerciseSearchNames,
      labels: (ex) => [
        MUSCLE_GROUP_LABELS[ex.primaryMuscleGroup],
        de.enums.muscleGroups[ex.primaryMuscleGroup],
        EQUIPMENT_LABELS[ex.equipment],
        de.enums.equipment[ex.equipment],
      ],
      // Everyday staples (the exercises of the starter workouts) before their variants.
      boost: (ex) => (CORE_EXERCISE_IDS.has(ex.id) ? 0.1 : 0),
    });
    searchIndexes.set(exercises, index);
  }
  return index;
}

/**
 * Exercises matching a search text (ranked best first) and muscle filter. Forgiving about
 * spelling, spacing, umlauts, plurals, German/English names and small typos — see
 * `searchExercises` in `@luki-fitti/common/utils`.
 */
export function filterExercisesByQuery(
  exercises: ExerciseDto[],
  search: string,
  muscleFilter: MuscleGroup | 'ALL' = 'ALL',
): ExerciseDto[] {
  const matchesMuscle = (ex: ExerciseDto) =>
    muscleFilter === 'ALL' ||
    ex.primaryMuscleGroup === muscleFilter ||
    !!ex.secondaryMuscleGroups?.includes(muscleFilter);
  if (!search.trim()) return exercises.filter(matchesMuscle);
  return searchExercises(searchIndexFor(exercises), search)
    .map((r) => r.exercise)
    .filter(matchesMuscle);
}

interface ExercisePickerProps {
  exercises: ExerciseDto[];
  value: string;
  onValueChange: (exerciseId: string) => void;
  emptyOptionLabel?: string;
  emptyOptionValue?: string;
  title?: string;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  triggerClassName?: string;
}

export function ExercisePicker({
  exercises,
  value,
  onValueChange,
  emptyOptionLabel,
  emptyOptionValue = '',
  title,
  placeholder,
  ariaLabel,
  className,
  triggerClassName,
}: ExercisePickerProps) {
  const { t, muscleLabel, equipmentLabel, exerciseTypeLabel } = useLocale();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | 'ALL'>('ALL');

  const selectedExercise = useMemo(
    () => exercises.find((e) => e.id === value) ?? null,
    [exercises, value],
  );

  const filtered = useMemo(
    () => filterExercisesByQuery(exercises, search, selectedMuscle),
    [exercises, search, selectedMuscle],
  );

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSearch('');
      setSelectedMuscle('ALL');
    }
  };

  const displayLabel = selectedExercise
    ? `${selectedExercise.name} (${muscleLabel(selectedExercise.primaryMuscleGroup)})`
    : (emptyOptionLabel ?? placeholder ?? t.picker.selectExercise);

  return (
    <div className={cn('min-w-0', className)}>
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel ?? title ?? t.picker.selectExercise}
        onClick={() => setOpen(true)}
        className={cn(
          'bg-background hover:bg-secondary/60 flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-xl border px-3 text-left text-xs font-semibold',
          triggerClassName,
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
          <Search className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{displayLabel}</span>
        </span>
        <ChevronsUpDown className="text-muted-foreground h-3.5 w-3.5 shrink-0 opacity-70" />
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[88dvh] overflow-hidden p-4 sm:max-w-lg sm:p-5">
          <div className="flex max-h-[calc(88dvh-2.5rem)] min-w-0 flex-col gap-3 overflow-hidden">
            <DialogHeader className="shrink-0 space-y-1">
              <DialogTitle className="font-display text-base font-bold sm:text-lg">
                {title ?? t.picker.selectExercise}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {t.picker.changeExercise} ({exercises.length})
              </DialogDescription>
            </DialogHeader>

            {/* Search Input */}
            <div className="relative shrink-0">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.picker.searchPlaceholder}
                aria-label={t.picker.searchPlaceholder}
                className="h-10 pr-9 pl-9 text-xs sm:text-sm"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label={t.common.clear}
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Muscle Group Quick Filter Pills — single-line horizontal scroll on mobile */}
            <div className="scrollbar-hide -mx-1 flex shrink-0 items-center gap-1.5 overflow-x-auto px-1 pb-0.5 sm:flex-wrap sm:overflow-visible">
              <Button
                type="button"
                variant={selectedMuscle === 'ALL' ? 'default' : 'secondary'}
                size="xs"
                onClick={() => setSelectedMuscle('ALL')}
                className="h-7 shrink-0 px-2.5 text-xs"
              >
                {t.picker.allMuscles}
              </Button>
              {Object.values(MuscleGroup).map((mg) => (
                <Button
                  key={mg}
                  type="button"
                  variant={selectedMuscle === mg ? 'default' : 'secondary'}
                  size="xs"
                  onClick={() => setSelectedMuscle(mg)}
                  className="h-7 shrink-0 px-2.5 text-xs"
                >
                  {muscleLabel(mg)}
                </Button>
              ))}
            </div>

            {/* Scrollable Exercise List */}
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
              {emptyOptionLabel !== undefined && (
                <button
                  type="button"
                  onClick={() => {
                    onValueChange(emptyOptionValue);
                    handleOpenChange(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition',
                    value === emptyOptionValue
                      ? 'border-primary bg-primary/12 text-foreground'
                      : 'bg-secondary/40 hover:bg-secondary/80 border-transparent',
                  )}
                >
                  <span>{emptyOptionLabel}</span>
                  {value === emptyOptionValue && (
                    <Check className="text-primary h-4 w-4 shrink-0" />
                  )}
                </button>
              )}

              {filtered.length === 0 ? (
                <div className="text-muted-foreground flex flex-col items-center justify-center py-8 text-center text-xs">
                  <Dumbbell className="mb-2 h-7 w-7 opacity-40" />
                  <p className="font-semibold">{t.picker.noResults}</p>
                </div>
              ) : (
                filtered.map((ex) => {
                  const isSelected = ex.id === value;
                  return (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => {
                        onValueChange(ex.id);
                        handleOpenChange(false);
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-2.5 rounded-xl border p-2.5 text-left text-xs transition',
                        isSelected
                          ? 'border-primary bg-primary/12'
                          : 'bg-secondary/35 hover:bg-secondary/75 border-transparent',
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <ExerciseVisual exercise={ex} variant="thumbnail" className="h-9 w-11" />
                        <div className="min-w-0">
                          <p className="truncate font-bold">{ex.name}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                              {muscleLabel(ex.primaryMuscleGroup)}
                            </Badge>
                            <span className="text-muted-foreground text-xs">
                              {equipmentLabel(ex.equipment)} • {exerciseTypeLabel(ex.exerciseType)}
                            </span>
                          </div>
                        </div>
                      </div>
                      {isSelected && <Check className="text-primary h-4 w-4 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
