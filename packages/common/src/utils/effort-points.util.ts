/**
 * Effort points (EP) for a completed workout session. Pure function — the same
 * code runs on the API ledger and on clients for the optimistic "+N EP" display;
 * the shared fixture keeps the Swift mirror honest.
 */

export interface EffortPointsSetInput {
  setType: string;
  completed: boolean;
  completedAt: string | null;
  isPersonalRecord: boolean;
  durationSeconds: number | null;
}

export interface EffortPointsExerciseInput {
  exerciseTypeSnapshot: string;
  sets: EffortPointsSetInput[];
}

export interface EffortPointsSessionInput {
  status: string;
  sessionType: string;
  sourceDevice?: string;
  activeDurationSeconds: number;
  totalStretchSeconds: number;
  completedAt: string | null;
  exercises: EffortPointsExerciseInput[];
}

/**
 * Counts/minutes behind `total` (not point values):
 * `total = 10·sets + 2·warmups + 25·prs + 2·cardioMinutes + 2·stretchMinutes + finishBonus`.
 * `stretchMinutes` is capped at 30 (60 points max); `droppedSets` counts completed
 * sets excluded by the plausibility rules.
 */
export interface EffortPointsBreakdown {
  sets: number;
  warmups: number;
  prs: number;
  cardioMinutes: number;
  stretchMinutes: number;
  finishBonus: number;
  droppedSets: number;
}

export interface EffortPointsResult {
  total: number;
  breakdown: EffortPointsBreakdown;
}

export const EP_WORKING_SET = 10;
export const EP_WARMUP_SET = 2;
export const EP_PERSONAL_RECORD = 25;
export const EP_MAX_PRS_PER_SESSION = 3;
export const EP_PER_CARDIO_MINUTE = 2;
export const EP_PER_STRETCH_MINUTE = 2;
export const EP_MAX_STRETCH_POINTS = 60;
export const EP_FINISH_BONUS = 20;
export const EP_MIN_ACTIVE_SECONDS = 300;
export const EP_FINISH_BONUS_MIN_SECONDS = 600;
/** One set every 15 s is the physical floor; faster or more is implausible. */
export const EP_SET_PLAUSIBILITY_SECONDS = 15;

const zero: EffortPointsBreakdown = {
  sets: 0,
  warmups: 0,
  prs: 0,
  cardioMinutes: 0,
  stretchMinutes: 0,
  finishBonus: 0,
  droppedSets: 0,
};

export function computeSessionEffortPoints(session: EffortPointsSessionInput): EffortPointsResult {
  if (
    session.status !== 'COMPLETED' ||
    session.sourceDevice === 'IMPORT' ||
    session.activeDurationSeconds < EP_MIN_ACTIVE_SECONDS
  ) {
    return { total: 0, breakdown: { ...zero } };
  }

  const breakdown: EffortPointsBreakdown = { ...zero };
  const maxSets = Math.floor(session.activeDurationSeconds / EP_SET_PLAUSIBILITY_SECONDS);
  const isStretchSession = session.sessionType === 'STRETCHING';
  let countedSets = 0;
  let lastCountedAt: number | null = null;
  // Stretch sessions take the already-aggregated totalStretchSeconds; per-set
  // durations would double-count them.
  let stretchSeconds = isStretchSession ? session.totalStretchSeconds : 0;

  for (const exercise of session.exercises) {
    for (const set of exercise.sets) {
      if (!set.completed) continue;
      if (countedSets >= maxSets) {
        breakdown.droppedSets += 1;
        continue;
      }
      const completedAtMs = set.completedAt ? Date.parse(set.completedAt) : NaN;
      if (
        lastCountedAt !== null &&
        Number.isFinite(completedAtMs) &&
        completedAtMs - lastCountedAt < EP_SET_PLAUSIBILITY_SECONDS * 1000
      ) {
        breakdown.droppedSets += 1;
        continue;
      }
      countedSets += 1;
      if (Number.isFinite(completedAtMs)) lastCountedAt = completedAtMs;

      const isWarmup = set.setType === 'WARMUP';
      const isStrength = exercise.exerciseTypeSnapshot === 'STRENGTH';
      const isStretchingExercise = exercise.exerciseTypeSnapshot === 'STRETCHING';

      if (isWarmup) {
        breakdown.warmups += 1;
      } else if (isStrength && (set.setType === 'WORKING' || set.setType === 'DROPSET')) {
        breakdown.sets += 1;
      } else if (exercise.exerciseTypeSnapshot === 'CARDIO') {
        breakdown.cardioMinutes += Math.floor((set.durationSeconds ?? 0) / 60);
      } else if (!isStretchSession && (isStretchingExercise || set.setType === 'STRETCH')) {
        stretchSeconds += set.durationSeconds ?? 0;
      }

      if (set.isPersonalRecord && breakdown.prs < EP_MAX_PRS_PER_SESSION) {
        breakdown.prs += 1;
      }
    }
  }

  breakdown.stretchMinutes = Math.min(
    Math.floor(stretchSeconds / 60),
    EP_MAX_STRETCH_POINTS / EP_PER_STRETCH_MINUTE,
  );
  if (session.activeDurationSeconds >= EP_FINISH_BONUS_MIN_SECONDS) {
    breakdown.finishBonus = EP_FINISH_BONUS;
  }

  const total =
    breakdown.sets * EP_WORKING_SET +
    breakdown.warmups * EP_WARMUP_SET +
    breakdown.prs * EP_PERSONAL_RECORD +
    breakdown.cardioMinutes * EP_PER_CARDIO_MINUTE +
    breakdown.stretchMinutes * EP_PER_STRETCH_MINUTE +
    breakdown.finishBonus;
  return { total, breakdown };
}
