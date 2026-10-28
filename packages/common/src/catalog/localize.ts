import { SUPPORTED_LOCALES, type SupportedLocale } from '../enums';
import type {
  ExerciseDto,
  StretchingRoutineDto,
  WorkoutFolderDto,
  WorkoutTemplateDto,
} from '../schemas';
import {
  DEFAULT_STARTER_FOLDERS,
  DEFAULT_STARTER_TEMPLATES,
  DEFAULT_STRETCHING_ROUTINES,
  INITIAL_EXERCISE_CATALOG,
} from './data';
import { de } from './locales/de';
import { EXERCISE_OVERRIDES } from './overrides';
import { getRegisteredExercise, getRegisteredExerciseText } from './registry';
import type {
  CatalogTranslation,
  ExerciseText,
  StarterRoutineText,
  StarterTemplateText,
} from './types';

export const SOURCE_LOCALE = 'en' satisfies SupportedLocale;

/** Every supported locale except the source language must provide a full translation. */
const TRANSLATIONS: Record<Exclude<SupportedLocale, typeof SOURCE_LOCALE>, CatalogTranslation> = {
  de,
};

const EXERCISES = new Map(INITIAL_EXERCISE_CATALOG.map((e) => [e.id, e]));
const FOLDERS = new Map(DEFAULT_STARTER_FOLDERS.map((f) => [f.id, f]));
const TEMPLATES = new Map(DEFAULT_STARTER_TEMPLATES.map((t) => [t.id, t]));
const ROUTINES = new Map(DEFAULT_STRETCHING_ROUTINES.map((r) => [r.id, r]));

export function getCatalogTranslation(locale: SupportedLocale): CatalogTranslation | null {
  return locale === SOURCE_LOCALE ? null : TRANSLATIONS[locale];
}

function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Picks the first supported locale from an `Accept-Language` header value. */
export function resolveSupportedLocale(acceptLanguage?: string | null): SupportedLocale {
  for (const part of acceptLanguage?.split(',') ?? []) {
    const base = part.split(';')[0]?.trim().toLowerCase().split(/[-_]/)[0];
    if (base && isSupportedLocale(base)) return base;
  }
  return SOURCE_LOCALE;
}

// ── Lookups by id ────────────────────────────────────────────────────────────

function sourceExercise(exerciseId: string): ExerciseDto | undefined {
  return EXERCISES.get(exerciseId) ?? getRegisteredExercise(exerciseId);
}

export function getExerciseText(exerciseId: string, locale: SupportedLocale): ExerciseText | null {
  const source = sourceExercise(exerciseId);
  if (!source) return null;
  const override = locale === SOURCE_LOCALE ? undefined : EXERCISE_OVERRIDES[exerciseId]?.[locale];
  return (
    override ??
    getRegisteredExerciseText(exerciseId, locale) ?? {
      name: source.name,
      description: source.description,
      instructions: source.instructions,
    }
  );
}

/** Names of a system exercise in every supported language (for search); none for custom ones. */
export function getExerciseSearchNames(exercise: Pick<ExerciseDto, 'id' | 'isSystem'>): string[] {
  if (!exercise.isSystem) return [];
  return Array.from(
    new Set(
      SUPPORTED_LOCALES.map((locale) => getExerciseText(exercise.id, locale)?.name).filter(
        (name): name is string => !!name,
      ),
    ),
  );
}

export function getStarterFolderName(systemKey: string, locale: SupportedLocale): string | null {
  const source = FOLDERS.get(systemKey);
  if (!source) return null;
  return getCatalogTranslation(locale)?.folders[systemKey] ?? source.name;
}

export function getStarterTemplateText(
  systemKey: string,
  locale: SupportedLocale,
): StarterTemplateText | null {
  const source = TEMPLATES.get(systemKey);
  if (!source) return null;
  return (
    getCatalogTranslation(locale)?.templates[systemKey] ?? {
      name: source.name,
      description: source.description,
    }
  );
}

export function getStarterRoutineText(
  systemKey: string,
  locale: SupportedLocale,
): StarterRoutineText | null {
  const source = ROUTINES.get(systemKey);
  if (!source) return null;
  return (
    getCatalogTranslation(locale)?.routines[systemKey] ?? {
      name: source.name,
      description: source.description,
      targetArea: source.targetArea,
    }
  );
}

/**
 * Note of the starter exercise at `orderIndex` of the starter template/routine `systemKey`.
 * Returns null when there is no matching starter exercise or it has no note.
 */
export function getStarterNote(
  systemKey: string,
  orderIndex: number,
  exerciseId: string,
  locale: SupportedLocale,
): string | null {
  const starter = TEMPLATES.get(systemKey) ?? ROUTINES.get(systemKey);
  const source = starter?.exercises.find((e) => e.orderIndex === orderIndex);
  if (!source?.notes || source.exerciseId !== exerciseId) return null;
  return getCatalogTranslation(locale)?.notes[source.id] ?? source.notes;
}

// ── DTO localization ─────────────────────────────────────────────────────────
// Built-in content is resolved from the catalog by id / systemKey. Custom (user-authored) content
// and starter copies the user has edited (systemKey cleared) are returned unchanged.

export function localizeExercise(exercise: ExerciseDto, locale: SupportedLocale): ExerciseDto {
  const text = exercise.isSystem ? getExerciseText(exercise.id, locale) : null;
  const alternatives = exercise.alternatives?.map((alt) => ({
    ...alt,
    name: getExerciseText(alt.id, locale)?.name ?? alt.name,
  }));
  const withAlternatives = alternatives ? { ...exercise, alternatives } : exercise;
  if (!text) return withAlternatives;
  // Keep the source (English) name searchable in every language.
  const sourceName = sourceExercise(exercise.id)!.name.toLowerCase();
  const keepTags = locale === SOURCE_LOCALE || exercise.tags.includes(sourceName);
  return {
    ...withAlternatives,
    ...text,
    tags: keepTags ? exercise.tags : [...exercise.tags, sourceName],
  };
}

export function getLocalizedExerciseCatalog(locale: SupportedLocale): ExerciseDto[] {
  return INITIAL_EXERCISE_CATALOG.map((e) => localizeExercise(e, locale));
}

export function localizeTemplate(
  template: WorkoutTemplateDto,
  locale: SupportedLocale,
): WorkoutTemplateDto {
  const key = template.systemKey;
  const text = key ? getStarterTemplateText(key, locale) : null;
  return {
    ...template,
    ...(text ?? {}),
    exercises: template.exercises.map((te) => ({
      ...te,
      notes: (key && getStarterNote(key, te.orderIndex, te.exerciseId, locale)) || te.notes,
      exercise: te.exercise && localizeExercise(te.exercise, locale),
    })),
  };
}

export function localizeFolder(
  folder: WorkoutFolderDto,
  locale: SupportedLocale,
): WorkoutFolderDto {
  return {
    ...folder,
    name: (folder.systemKey && getStarterFolderName(folder.systemKey, locale)) || folder.name,
    templates: folder.templates.map((t) => localizeTemplate(t, locale)),
  };
}

export function localizeStretchingRoutine(
  routine: StretchingRoutineDto,
  locale: SupportedLocale,
): StretchingRoutineDto {
  const key = routine.systemKey;
  const text = key ? getStarterRoutineText(key, locale) : null;
  return {
    ...routine,
    ...(text ?? {}),
    exercises: routine.exercises.map((re) => ({
      ...re,
      notes: (key && getStarterNote(key, re.orderIndex, re.exerciseId, locale)) || re.notes,
      exercise: re.exercise && localizeExercise(re.exercise, locale),
    })),
  };
}
