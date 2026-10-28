import {
  ExerciseType,
  type EquipmentType,
  type ExerciseCategory,
  type MuscleGroup,
} from '../enums';
import type { ExerciseDto } from '../schemas';
import type { ExerciseOverride, ExerciseRecord, ExerciseText } from './types';

export function exerciseVideoLink(slug: string, name: string) {
  return {
    id: `${slug || 'ex'}-video`,
    mediaType: 'VIDEO_LINK' as const,
    url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise form tutorial`)}`,
    caption: `Watch ${name} Video Form Guide`,
    attribution: 'YouTube Form Guide',
    license: 'External Link',
  };
}

/** A generated dataset exercise as a DTO, with its hand-written override applied if it has one. */
export function exerciseRecordToDto(r: ExerciseRecord, override?: ExerciseOverride): ExerciseDto {
  // The generated records hold the enum string values.
  const exerciseType = (override?.exerciseType ?? r.exerciseType) as ExerciseType;
  const name = override?.name ?? r.name;
  return {
    id: r.id,
    slug: r.slug,
    userId: null,
    name,
    description: override?.description ?? r.description,
    instructions: override?.instructions ?? r.instructions,
    category: (override?.category ?? r.category) as ExerciseCategory,
    exerciseType,
    primaryMuscleGroup: (override?.primaryMuscleGroup ?? r.primaryMuscleGroup) as MuscleGroup,
    secondaryMuscleGroups: (override?.secondaryMuscleGroups ??
      r.secondaryMuscleGroups) as MuscleGroup[],
    equipment: (override?.equipment ?? r.equipment) as EquipmentType,
    recommendedDurationSeconds: override
      ? override.recommendedDurationSeconds
      : exerciseType === ExerciseType.STRETCHING
        ? 30
        : null,
    tags: override ? Array.from(new Set([...override.tags, ...r.tags])) : r.tags,
    isSystem: true,
    alternativeExerciseIds: override?.alternativeExerciseIds ?? [],
    media: [...r.media, exerciseVideoLink(r.slug, name)],
  };
}

/** German text of a generated exercise; missing German names/steps fall back to English. */
export function exerciseRecordGermanText(
  r: ExerciseRecord,
  override?: ExerciseOverride,
): ExerciseText {
  return (
    override?.de ?? {
      name: r.de.name ?? r.name,
      description: r.de.description,
      instructions: r.de.instructions ?? r.instructions,
    }
  );
}
