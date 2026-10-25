export interface ExerciseText {
  name: string;
  description: string;
  instructions: string[];
}

export interface StarterTemplateText {
  name: string;
  description: string;
}

export interface StarterRoutineText {
  name: string;
  description: string;
  targetArea: string;
}

/**
 * Translation of the built-in catalog into one non-source locale. English is the source language
 * and lives inline in `data.ts`; every key here refers to an id defined there.
 */
export interface CatalogTranslation {
  /** Keyed by exercise id. */
  exercises: Record<string, ExerciseText>;
  /** Keyed by starter folder id. */
  folders: Record<string, string>;
  /** Keyed by starter template id. */
  templates: Record<string, StarterTemplateText>;
  /** Keyed by starter stretching routine id. */
  routines: Record<string, StarterRoutineText>;
  /** Keyed by starter template exercise / stretching routine exercise id. */
  notes: Record<string, string>;
}
