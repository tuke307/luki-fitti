import type { EquipmentType, ExerciseCategory, ExerciseType, MuscleGroup } from '../enums';
import type { ExerciseDto } from '../schemas';

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
 * One exercise generated from the open datasets by `scripts/import-catalog.ts`, with its English
 * text and the German text available for it.
 */
export interface ExerciseRecord {
  id: string;
  slug: string;
  name: string;
  description: string;
  instructions: string[];
  category: `${ExerciseCategory}`;
  exerciseType: `${ExerciseType}`;
  primaryMuscleGroup: `${MuscleGroup}`;
  secondaryMuscleGroups: Array<`${MuscleGroup}`>;
  equipment: `${EquipmentType}`;
  tags: string[];
  media: NonNullable<ExerciseDto['media']>;
  source: 'free-exercise-db' | 'wger';
  /** German text; `null` fields fall back to English. */
  de: { name: string | null; description: string; instructions: string[] | null };
}

/** Hand-written content that replaces the generated text and metadata of a dataset exercise. */
export interface ExerciseOverride {
  /** Dataset entry the exercise is built on (free-exercise-db id or wger exercise id). */
  source: { fedb: string } | { wger: number };
  name: string;
  description: string;
  instructions: string[];
  category: ExerciseCategory;
  exerciseType: ExerciseType;
  primaryMuscleGroup: MuscleGroup;
  secondaryMuscleGroups: MuscleGroup[];
  equipment: EquipmentType;
  recommendedDurationSeconds: number | null;
  tags: string[];
  alternativeExerciseIds: string[];
  de: ExerciseText;
}

/**
 * Translation of the built-in starter content into one non-source locale. English is the source
 * language and lives inline in `data.ts`; every key here refers to an id defined there. Exercise
 * text comes with the exercises themselves (`overrides.ts` and the generated records).
 */
export interface CatalogTranslation {
  /** Keyed by starter folder id. */
  folders: Record<string, string>;
  /** Keyed by starter template id. */
  templates: Record<string, StarterTemplateText>;
  /** Keyed by starter stretching routine id. */
  routines: Record<string, StarterRoutineText>;
  /** Keyed by starter template exercise / stretching routine exercise id. */
  notes: Record<string, string>;
}
