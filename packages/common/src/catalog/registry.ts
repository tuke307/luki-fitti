import type { SupportedLocale } from '../enums';
import type { ExerciseDto } from '../schemas';
import type { ExerciseText } from './types';

/**
 * Catalog extensions loaded on demand (the imported exercise database). Kept out of the core
 * catalog so web clients only download it when needed; once registered, media lookup and
 * localization treat these exercises like the built-in ones.
 */
const extraExercises = new Map<string, ExerciseDto>();
const extraText: Partial<Record<SupportedLocale, Record<string, ExerciseText>>> = {};

export function registerExerciseCatalogExtension(
  exercises: ExerciseDto[],
  text: Partial<Record<SupportedLocale, Record<string, ExerciseText>>>,
): void {
  for (const ex of exercises) extraExercises.set(ex.id, ex);
  for (const [locale, entries] of Object.entries(text) as Array<
    [SupportedLocale, Record<string, ExerciseText>]
  >) {
    extraText[locale] = { ...(extraText[locale] ?? {}), ...entries };
  }
}

export function getRegisteredExercise(id: string): ExerciseDto | undefined {
  return extraExercises.get(id);
}

export function getRegisteredExerciseText(
  id: string,
  locale: SupportedLocale,
): ExerciseText | undefined {
  return extraText[locale]?.[id];
}
