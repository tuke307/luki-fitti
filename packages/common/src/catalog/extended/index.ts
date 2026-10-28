import type { SupportedLocale } from '../../enums';
import type { ExerciseDto } from '../../schemas';
import { INITIAL_EXERCISE_CATALOG } from '../data';
import { exerciseRecordGermanText, exerciseRecordToDto } from '../exercise-record';
import { localizeExercise } from '../localize';
import { registerExerciseCatalogExtension } from '../registry';
import type { ExerciseText } from '../types';
import { EXTENDED_EXERCISE_RECORDS } from './records';

export type { ExerciseRecord } from '../types';

/**
 * The rest of the imported exercise database (free-exercise-db + wger.de). Importing this module
 * registers it, so media lookup and localization work for these exercises as well.
 */
export const EXTENDED_EXERCISE_CATALOG: ExerciseDto[] = EXTENDED_EXERCISE_RECORDS.map((r) =>
  exerciseRecordToDto(r),
);

const GERMAN_TEXT: Record<string, ExerciseText> = Object.fromEntries(
  EXTENDED_EXERCISE_RECORDS.map((r) => [r.id, exerciseRecordGermanText(r)]),
);

registerExerciseCatalogExtension(EXTENDED_EXERCISE_CATALOG, { de: GERMAN_TEXT });

/** Every system exercise: the core exercises first, then the rest of the database. */
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
