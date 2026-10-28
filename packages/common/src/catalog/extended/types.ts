import type { EquipmentType, ExerciseCategory, ExerciseType, MuscleGroup } from '../../enums';
import type { ExerciseDto } from '../../schemas';

/** One imported exercise with its English text and the German text available for it. */
export interface ExtendedExerciseRecord {
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
