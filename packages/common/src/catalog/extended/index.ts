import {
  ExerciseType,
  type EquipmentType,
  type ExerciseCategory,
  type MuscleGroup,
  type SupportedLocale,
} from '../../enums';
import type { ExerciseDto } from '../../schemas';
import { INITIAL_EXERCISE_CATALOG } from '../data';
import { localizeExercise } from '../localize';
import { registerExerciseCatalogExtension } from '../registry';
import type { ExerciseText } from '../types';
import { EXTENDED_EXERCISE_RECORDS } from './records';

export type { ExtendedExerciseRecord } from './types';

/**
 * The imported exercise database (free-exercise-db + wger.de). Importing this module registers
 * it, so media lookup and localization work for these exercises as well.
 */
export const EXTENDED_EXERCISE_CATALOG: ExerciseDto[] = EXTENDED_EXERCISE_RECORDS.map((r) => ({
  id: r.id,
  slug: r.slug,
  userId: null,
  name: r.name,
  description: r.description,
  instructions: r.instructions,
  // The generated records hold the enum string values.
  category: r.category as ExerciseCategory,
  exerciseType: r.exerciseType as ExerciseType,
  primaryMuscleGroup: r.primaryMuscleGroup as MuscleGroup,
  secondaryMuscleGroups: r.secondaryMuscleGroups as MuscleGroup[],
  equipment: r.equipment as EquipmentType,
  recommendedDurationSeconds: r.exerciseType === ExerciseType.STRETCHING ? 30 : null,
  tags: r.tags,
  isSystem: true,
  alternativeExerciseIds: [],
  media: r.media,
}));

/** German text; missing German names/steps fall back to the English source. */
const GERMAN_TEXT: Record<string, ExerciseText> = Object.fromEntries(
  EXTENDED_EXERCISE_RECORDS.map((r) => [
    r.id,
    {
      name: r.de.name ?? r.name,
      description: r.de.description,
      instructions: r.de.instructions ?? r.instructions,
    },
  ]),
);

registerExerciseCatalogExtension(EXTENDED_EXERCISE_CATALOG, { de: GERMAN_TEXT });

/** Every system exercise: the curated catalog first, then the imported database. */
export const ALL_SYSTEM_EXERCISES: ExerciseDto[] = [
  ...INITIAL_EXERCISE_CATALOG,
  ...EXTENDED_EXERCISE_CATALOG,
];

export function getAllLocalizedExercises(locale: SupportedLocale): ExerciseDto[] {
  return ALL_SYSTEM_EXERCISES.map((e) => localizeExercise(e, locale));
}

/** Attribution shown in the app for imported data (CC-BY-SA requires it for wger content). */
export const EXTENDED_CATALOG_SOURCES = [
  {
    name: 'free-exercise-db',
    url: 'https://github.com/yuhonas/free-exercise-db',
    license: 'Unlicense (public domain)',
  },
  {
    name: 'wger Workout Manager',
    url: 'https://wger.de',
    license: 'CC-BY-SA 4.0',
  },
] as const;
