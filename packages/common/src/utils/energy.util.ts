import { ExerciseType, SessionType, SetType, type BiologicalSex } from '../enums';

/**
 * Workout energy estimates.
 *
 * Preference order: the HealthKit active-energy value when the workout was recorded on an
 * Apple Watch, otherwise a MET estimate (Compendium of Physical Activities):
 *
 *   active kcal = (MET − 1) × body weight (kg) × hours
 *
 * Subtracting 1 MET removes resting metabolism so the result is comparable to HealthKit's
 * "active energy" and can be shown next to food intake without double-counting BMR.
 */

export const DEFAULT_BODY_WEIGHT_KG = 75;

/** Light resistance training (long rests, few sets) … vigorous (dense circuits). */
export const STRENGTH_MET_RANGE = { light: 3.5, vigorous: 6.0 } as const;
export const STRETCHING_MET = 2.3;
export const DEFAULT_CARDIO_MET = 7.0;

/** Working sets per active minute that map to the light / vigorous ends of the range. */
const STRENGTH_DENSITY_RANGE = { light: 0.12, vigorous: 0.35 } as const;

export interface EnergySetInput {
  setType: SetType | `${SetType}`;
  completed: boolean;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
}

export interface EnergyExerciseInput {
  exerciseTypeSnapshot: ExerciseType | `${ExerciseType}`;
  sets: EnergySetInput[];
}

export interface EnergySessionInput {
  sessionType: SessionType | `${SessionType}`;
  activeDurationSeconds: number;
  activeCaloriesKcal?: number | null;
  exercises: EnergyExerciseInput[];
}

export interface WorkoutEnergyEstimate {
  kcal: number;
  source: 'healthkit' | 'estimate';
  usedDefaultBodyWeight: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Interpolates the strength MET from workout density (working sets per active minute). */
export function strengthMetForDensity(setsPerMinute: number): number {
  const { light, vigorous } = STRENGTH_DENSITY_RANGE;
  const t = clamp((setsPerMinute - light) / (vigorous - light), 0, 1);
  return STRENGTH_MET_RANGE.light + t * (STRENGTH_MET_RANGE.vigorous - STRENGTH_MET_RANGE.light);
}

/** Running/cycling-agnostic cardio MET from average speed; falls back to a moderate default. */
export function cardioMetForSpeed(kmPerHour: number | null): number {
  if (kmPerHour === null || !Number.isFinite(kmPerHour) || kmPerHour <= 0) return DEFAULT_CARDIO_MET;
  if (kmPerHour < 5) return 3.5; // walking
  if (kmPerHour < 7) return 5.0; // brisk walking
  if (kmPerHour < 9) return 8.3; // jogging
  if (kmPerHour < 11) return 9.8;
  if (kmPerHour < 13) return 11.0;
  return 11.8;
}

export function estimateWorkoutEnergy(
  session: EnergySessionInput,
  bodyWeightKg?: number | null,
): WorkoutEnergyEstimate {
  const usedDefaultBodyWeight = !(bodyWeightKg && bodyWeightKg > 0);
  if (session.activeCaloriesKcal !== null && session.activeCaloriesKcal !== undefined) {
    return {
      kcal: Math.round(Math.max(0, session.activeCaloriesKcal)),
      source: 'healthkit',
      usedDefaultBodyWeight: false,
    };
  }

  const weightKg = usedDefaultBodyWeight ? DEFAULT_BODY_WEIGHT_KG : (bodyWeightKg as number);
  const totalSeconds = Math.max(0, session.activeDurationSeconds);
  if (totalSeconds === 0) return { kcal: 0, source: 'estimate', usedDefaultBodyWeight };

  let stretchSeconds = 0;
  let cardioSeconds = 0;
  let cardioMeters = 0;
  let workingSets = 0;

  for (const exercise of session.exercises) {
    for (const set of exercise.sets) {
      if (!set.completed) continue;
      const duration = Math.max(0, set.durationSeconds ?? 0);
      if (exercise.exerciseTypeSnapshot === ExerciseType.STRETCHING || set.setType === SetType.STRETCH) {
        stretchSeconds += duration;
      } else if (exercise.exerciseTypeSnapshot === ExerciseType.CARDIO) {
        cardioSeconds += duration;
        cardioMeters += Math.max(0, set.distanceMeters ?? 0);
      } else if (set.setType !== SetType.WARMUP) {
        workingSets += 1;
      }
    }
  }

  // Timed work cannot exceed the session; scale down proportionally if clocks disagree.
  const timed = stretchSeconds + cardioSeconds;
  if (timed > totalSeconds) {
    const factor = totalSeconds / timed;
    stretchSeconds *= factor;
    cardioSeconds *= factor;
  }
  let strengthSeconds = Math.max(0, totalSeconds - stretchSeconds - cardioSeconds);

  // A pure stretching session spends its idle time (transitions) at stretching intensity.
  if (session.sessionType === SessionType.STRETCHING && workingSets === 0) {
    stretchSeconds += strengthSeconds;
    strengthSeconds = 0;
  }

  const strengthMinutes = strengthSeconds / 60;
  const strengthMet =
    strengthMinutes > 0 ? strengthMetForDensity(workingSets / strengthMinutes) : STRENGTH_MET_RANGE.light;
  const cardioSpeed = cardioSeconds > 0 && cardioMeters > 0 ? cardioMeters / 1000 / (cardioSeconds / 3600) : null;

  const kcal =
    (strengthMet - 1) * weightKg * (strengthSeconds / 3600) +
    (STRETCHING_MET - 1) * weightKg * (stretchSeconds / 3600) +
    (cardioMetForSpeed(cardioSpeed) - 1) * weightKg * (cardioSeconds / 3600);

  return { kcal: Math.round(kcal), source: 'estimate', usedDefaultBodyWeight };
}

/**
 * Suggested maintenance intake (Mifflin–St Jeor BMR × 1.4 for "lightly active + training").
 * Returns null when inputs are missing; the UI then asks the user to set a goal manually.
 */
export function suggestDailyKcal(input: {
  bodyWeightKg?: number | null;
  heightCm?: number | null;
  birthYear?: number | null;
  sex?: BiologicalSex | null;
  now?: Date;
}): number | null {
  const { bodyWeightKg, heightCm, birthYear, sex } = input;
  if (!bodyWeightKg || !heightCm || !birthYear || !sex) return null;
  const age = (input.now ?? new Date()).getUTCFullYear() - birthYear;
  if (age < 14 || age > 110) return null;
  const bmr = 10 * bodyWeightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
  return Math.round((bmr * 1.4) / 10) * 10;
}

/** 1.8 g protein per kg body weight, a common target for people who lift. */
export function suggestProteinGoalG(bodyWeightKg?: number | null): number | null {
  return bodyWeightKg ? Math.round(bodyWeightKg * 1.8) : null;
}
