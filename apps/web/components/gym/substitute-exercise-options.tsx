'use client';

import React, { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
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
import { ExerciseVisual } from './exercise-visual';
import { LateralityBadge } from './laterality-badge';

const CORE_EXERCISE_IDS = CORE_EXERCISE_CATALOG.map((e) => e.id);
const BEST_MATCH_LIMIT = 8;
const ONE_SIDED_LIMIT = 3;

interface SubstituteExerciseOptionsProps {
  target: SessionExerciseDto;
  catalog: ExerciseDto[];
  /** Exercises already in the session; never offered again. */
  sessionExerciseIds: Array<string | null>;
  historySessions: WorkoutSessionDto[];
  search: string;
  onSelect: (exerciseId: string) => void | Promise<void>;
  /** Tapping the picture or the ⓘ button opens the guide instead of selecting. */
  onShowGuide: (exercise: ExerciseDto) => void;
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
  onShowGuide,
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
  // A two-sided exercise gets its one-sided versions first; they are left out of the best matches.
  const { oneSided, bestMatches } = useMemo(() => {
    if (!targetExercise) return { oneSided: [], bestMatches: [] };
    const options = {
      historySessions,
      excludeIds: excludeKey.split('\n'),
      popularIds: CORE_EXERCISE_IDS,
    };
    const oneSided: RankedAlternative[] =
      targetExercise.laterality === Laterality.BILATERAL
        ? rankAlternatives(targetExercise, catalog, {
            ...options,
            preferLaterality: Laterality.UNILATERAL,
            limit: ONE_SIDED_LIMIT,
          }).filter((r) => r.reasons.includes('UNILATERAL_VARIANT'))
        : [];
    const bestMatches = rankAlternatives(targetExercise, catalog, {
      ...options,
      excludeIds: [...options.excludeIds, ...oneSided.map((r) => r.exercise.id)],
      limit: BEST_MATCH_LIMIT,
    });
    return { oneSided, bestMatches };
  }, [targetExercise, catalog, historySessions, excludeKey]);
  const showFullList = searching || showAll || bestMatches.length === 0;

  const reasonLine = ({ exercise, reasons }: RankedAlternative) =>
    [
      reasons.includes('SAME_MOVEMENT')
        ? t.session.reasonSameMovement
        : reasons.includes('SIMILAR_MOVEMENT')
          ? t.session.reasonSimilarMovement
          : null,
      equipmentLabel(exercise.equipment),
      reasons.includes('DONE_BEFORE') ? t.session.reasonDoneBefore : null,
    ]
      .filter(Boolean)
      .join(' · ');

  /** Tapping the picture opens the how-to; it sits next to (never inside) the select button. */
  const thumbnailButton = (ex: ExerciseDto) => (
    <button
      type="button"
      data-testid="substitute-exercise-thumbnail"
      aria-label={format(t.picker.exerciseInfoAria, { name: ex.name })}
      onClick={() => onShowGuide(ex)}
      className="focus-visible:ring-ring/50 flex shrink-0 items-center justify-center rounded-lg outline-hidden focus-visible:ring-[3px] active:opacity-70"
    >
      <ExerciseVisual exercise={ex} variant="thumbnail" className="h-9 w-11" />
    </button>
  );

  const infoButton = (ex: ExerciseDto) => (
    <button
      type="button"
      data-testid="substitute-exercise-info"
      aria-label={format(t.picker.exerciseInfoAria, { name: ex.name })}
      onClick={() => onShowGuide(ex)}
      className="text-muted-foreground hover:text-primary focus-visible:ring-ring/50 flex size-11 shrink-0 items-center justify-center rounded-full outline-hidden focus-visible:ring-[3px]"
    >
      <Info className="h-5 w-5" />
    </button>
  );

  return (
    <>
      {!searching && target.alternativeExerciseIds.length > 0 && (
        <div className="space-y-2">
          <p className="text-primary text-xs font-bold">{t.session.predefinedAlternatives}</p>
          {target.alternativeExerciseIds.map((altId) => {
            const alt = catalog.find((c) => c.id === altId);
            if (!alt) return null;
            return (
              <div
                key={alt.id}
                className="bg-primary/12 border-primary/40 flex w-full items-center gap-1 rounded-2xl border p-3.5 text-xs font-bold"
              >
                {thumbnailButton(alt)}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onSelect(alt.id)}
                  className="h-auto min-w-0 flex-1 items-center justify-between p-0 text-left text-xs font-bold hover:bg-transparent"
                >
                  <span className="min-w-0 truncate">{alt.name}</span>
                  <span className="text-primary text-xs">{t.session.useBackupBtn}</span>
                </Button>
                {infoButton(alt)}
              </div>
            );
          })}
        </div>
      )}

      {!searching &&
        [
          { id: 'one-sided', title: t.laterality.oneSideGroup, matches: oneSided },
          { id: 'best-matches', title: t.session.bestMatches, matches: bestMatches },
        ].map(
          (group) =>
            group.matches.length > 0 && (
              <div key={group.id} className="space-y-2 pt-1" data-testid={`substitute-${group.id}`}>
                <p className="text-foreground text-xs font-bold">{group.title}</p>
                {group.matches.map((match) => (
                  <div
                    key={match.exercise.id}
                    className="bg-secondary flex w-full items-center gap-1 rounded-xl p-3 text-xs font-medium"
                  >
                    {thumbnailButton(match.exercise)}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => onSelect(match.exercise.id)}
                      className="h-auto min-w-0 flex-1 flex-col items-start gap-0.5 p-0 text-left text-xs font-medium hover:bg-transparent"
                    >
                      <span>{match.exercise.name}</span>
                      <span className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-[11px] font-normal">
                        {reasonLine(match)}
                        <LateralityBadge
                          laterality={match.exercise.laterality}
                          className="px-1.5 text-[11px]"
                        />
                      </span>
                    </Button>
                    {infoButton(match.exercise)}
                  </div>
                ))}
              </div>
            ),
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
            <div
              key={alt.id}
              className="bg-secondary flex w-full items-center gap-1 rounded-xl p-3 text-xs font-medium"
            >
              {thumbnailButton(alt)}
              <Button
                type="button"
                variant="ghost"
                onClick={() => onSelect(alt.id)}
                className="h-auto min-w-0 flex-1 items-center justify-between p-0 text-left text-xs font-medium hover:bg-transparent"
              >
                <span className="min-w-0 truncate">{alt.name}</span>
                <span className="text-muted-foreground text-xs">{equipmentLabel(alt.equipment)}</span>
              </Button>
              {infoButton(alt)}
            </div>
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
