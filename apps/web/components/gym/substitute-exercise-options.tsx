'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { CORE_EXERCISE_CATALOG } from '@luki-fitti/common/catalog';
import { Laterality } from '@luki-fitti/common/enums';
import type {
  ExerciseDto,
  SessionExerciseDto,
  WorkoutSessionDto,
} from '@luki-fitti/common/schemas';
import { rankAlternatives, type RankedAlternative } from '@luki-fitti/common/utils/client';
import { useLocale } from '@/providers/i18n/locale-context';
import { filterExercisesByQuery } from './exercise-picker';

const CORE_EXERCISE_IDS = CORE_EXERCISE_CATALOG.map((e) => e.id);
const BEST_MATCH_LIMIT = 8;

interface SubstituteExerciseOptionsProps {
  target: SessionExerciseDto;
  catalog: ExerciseDto[];
  /** Exercises already in the session; never offered again. */
  sessionExerciseIds: Array<string | null>;
  historySessions: WorkoutSessionDto[];
  search: string;
  onSelect: (exerciseId: string) => void | Promise<void>;
}

/**
 * The choices of the replace dialog: the user's own alternatives, the best matches by movement
 * (with a short reason), and on request every exercise of the same muscle.
 */
export function SubstituteExerciseOptions({
  target,
  catalog,
  sessionExerciseIds,
  historySessions,
  search,
  onSelect,
}: SubstituteExerciseOptionsProps) {
  const { t, format, muscleLabel, equipmentLabel } = useLocale();
  const [showAll, setShowAll] = useState(false);
  const searching = Boolean(search.trim());

  const targetExercise = target.exerciseId
    ? catalog.find((c) => c.id === target.exerciseId)
    : undefined;
  // The user's alternatives have their own section; a string key keeps the ranking memoized
  // across the session view's timer re-renders.
  const excludeKey = [...sessionExerciseIds, ...target.alternativeExerciseIds]
    .filter(Boolean)
    .join('\n');
  const bestMatches = useMemo<RankedAlternative[]>(
    () =>
      targetExercise
        ? rankAlternatives(targetExercise, catalog, {
            historySessions,
            excludeIds: excludeKey.split('\n'),
            popularIds: CORE_EXERCISE_IDS,
            limit: BEST_MATCH_LIMIT,
          })
        : [],
    [targetExercise, catalog, historySessions, excludeKey],
  );
  const showFullList = searching || showAll || bestMatches.length === 0;

  const reasonLine = ({ exercise, reasons }: RankedAlternative) =>
    [
      reasons.includes('SAME_MOVEMENT')
        ? t.session.reasonSameMovement
        : reasons.includes('SIMILAR_MOVEMENT')
          ? t.session.reasonSimilarMovement
          : null,
      equipmentLabel(exercise.equipment),
      exercise.laterality === Laterality.UNILATERAL
        ? t.session.reasonOneSide
        : exercise.laterality === Laterality.BILATERAL
          ? t.session.reasonBothSides
          : null,
      reasons.includes('DONE_BEFORE') ? t.session.reasonDoneBefore : null,
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <>
      {!searching && target.alternativeExerciseIds.length > 0 && (
        <div className="space-y-2">
          <p className="text-primary text-xs font-bold">{t.session.predefinedAlternatives}</p>
          {target.alternativeExerciseIds.map((altId) => {
            const alt = catalog.find((c) => c.id === altId);
            if (!alt) return null;
            return (
              <Button
                key={alt.id}
                type="button"
                variant="outline"
                onClick={() => onSelect(alt.id)}
                className="bg-primary/12 border-primary/40 hover:bg-primary/12 flex h-auto w-full items-center justify-between rounded-2xl p-3.5 text-left text-xs font-bold"
              >
                <span>{alt.name}</span>
                <span className="text-primary text-xs">{t.session.useBackupBtn}</span>
              </Button>
            );
          })}
        </div>
      )}

      {!searching && bestMatches.length > 0 && (
        <div className="space-y-2 pt-1" data-testid="substitute-best-matches">
          <p className="text-foreground text-xs font-bold">{t.session.bestMatches}</p>
          {bestMatches.map((match) => (
            <Button
              key={match.exercise.id}
              type="button"
              variant="secondary"
              onClick={() => onSelect(match.exercise.id)}
              className="flex h-auto w-full flex-col items-start gap-0.5 rounded-xl p-3 text-left text-xs font-medium"
            >
              <span>{match.exercise.name}</span>
              <span className="text-muted-foreground text-[11px] font-normal">
                {reasonLine(match)}
              </span>
            </Button>
          ))}
        </div>
      )}

      {showFullList ? (
        <div className="space-y-2 pt-1">
          <p className="text-muted-foreground text-xs font-bold">
            {searching
              ? t.session.allCatalogExercises
              : format(t.session.sameMuscleGroup, {
                  muscle: muscleLabel(target.primaryMuscleSnapshot),
                })}
          </p>
          {filterExercisesByQuery(
            catalog.filter((c) => c.id !== target.exerciseId),
            search,
            searching ? 'ALL' : target.primaryMuscleSnapshot,
          ).map((alt) => (
            <Button
              key={alt.id}
              type="button"
              variant="secondary"
              onClick={() => onSelect(alt.id)}
              className="flex h-auto w-full items-center justify-between rounded-xl p-3 text-left text-xs font-medium"
            >
              <span>{alt.name}</span>
              <span className="text-muted-foreground text-xs">{equipmentLabel(alt.equipment)}</span>
            </Button>
          ))}
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowAll(true)}
          data-testid="substitute-show-all"
          className="w-full text-xs"
        >
          {t.session.showAllAlternatives}
        </Button>
      )}
    </>
  );
}
