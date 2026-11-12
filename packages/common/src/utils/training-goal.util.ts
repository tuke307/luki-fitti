import { ExerciseCategory, TrainingGoal } from '../enums';
import type { ExerciseDto } from '../schemas';

/**
 * Per-goal training profile: rep bands for compound vs isolation work, default rest, and
 * how the progression engine treats weight bumps.
 * Mirrored 1:1 in `LukiFittiDomain/TrainingGoal.swift` — keep both in sync.
 */
export interface TrainingGoalProfile {
  compound: { min: number; max: number };
  isolation: { min: number; max: number };
  restSeconds: number;
  /** Multiplier on the standard step for BARBELL compound exercises. */
  barbellCompoundStepMultiplier: number;
  /** Max effort (avg RPE >= MAX_EFFORT_RPE) at the top of the band still earns more weight. */
  maxEffortEarnsWeight: boolean;
  /** Weight only goes up when the last session's avg RPE is below this (null = no cap). */
  increaseWeightMaxRpe: number | null;
}

export const TRAINING_GOAL_PROFILES: Record<TrainingGoal, TrainingGoalProfile> = {
  [TrainingGoal.STRENGTH]: {
    compound: { min: 3, max: 6 },
    isolation: { min: 6, max: 10 },
    restSeconds: 180,
    barbellCompoundStepMultiplier: 2,
    maxEffortEarnsWeight: false,
    increaseWeightMaxRpe: null,
  },
  [TrainingGoal.HYPERTROPHY]: {
    compound: { min: 6, max: 10 },
    isolation: { min: 10, max: 15 },
    restSeconds: 90,
    barbellCompoundStepMultiplier: 1,
    maxEffortEarnsWeight: true,
    increaseWeightMaxRpe: null,
  },
  [TrainingGoal.ENDURANCE]: {
    compound: { min: 12, max: 20 },
    isolation: { min: 15, max: 25 },
    restSeconds: 60,
    barbellCompoundStepMultiplier: 1,
    maxEffortEarnsWeight: false,
    increaseWeightMaxRpe: 9,
  },
};

/** The rest value templates/exercises get when no goal applies; a goal overrides exactly this. */
export const LEGACY_DEFAULT_REST_SECONDS = 90;

/**
 * Goal resolution order: an explicit template goal beats the profile default; null means
 * "no goal" and keeps legacy behaviour everywhere.
 */
export function resolveTrainingGoal(
  templateGoal?: TrainingGoal | null,
  profileGoal?: TrainingGoal | null,
): TrainingGoal | null {
  return templateGoal ?? profileGoal ?? null;
}

/** Rep band for an exercise under a goal: isolation band only for ISOLATION exercises. */
export function goalRepRange(
  goal: TrainingGoal,
  exercise?: Pick<ExerciseDto, 'category'> | null,
): { min: number; max: number } {
  const profile = TRAINING_GOAL_PROFILES[goal];
  return exercise?.category === ExerciseCategory.ISOLATION ? profile.isolation : profile.compound;
}

/**
 * Goal-aware rest override. Only the untouched legacy default (90s) is swapped for the goal
 * rest; explicit values are kept, and 0 (superset link) is never touched.
 */
export function resolveRestSeconds(
  restSeconds: number,
  goal: TrainingGoal | null | undefined,
): number {
  if (goal && restSeconds === LEGACY_DEFAULT_REST_SECONDS) {
    return TRAINING_GOAL_PROFILES[goal].restSeconds;
  }
  return restSeconds;
}
