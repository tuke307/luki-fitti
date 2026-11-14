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
  /** Exercise's primary muscle, used to attribute set points to raid weak spots. */
  primaryMuscleSnapshot?: string | null;
  /** Display name, used only to report `topExercise`. */
  exerciseNameSnapshot?: string | null;
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
  /**
   * Points attributed per weak spot: set + PR points under the exercise's
   * `primaryMuscleSnapshot`, cardio points under 'CARDIO', stretch points under
   * 'STRETCHING'. The finish bonus is unattributed. Keys match `WeakSpot`.
   */
  pointsByWeakSpot: Record<string, number>;
  /** Name of the exercise that earned the most points, when one did. */
  topExercise: string | null;
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

/** Sort key: timed sets chronologically, untimed sets last (stable order kept). */
const setTimeKey = (completedAt: string | null): number => {
  const ms = completedAt ? Date.parse(completedAt) : NaN;
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
};

export function computeSessionEffortPoints(session: EffortPointsSessionInput): EffortPointsResult {
  if (
    session.status !== 'COMPLETED' ||
    session.sourceDevice === 'IMPORT' ||
    session.activeDurationSeconds < EP_MIN_ACTIVE_SECONDS
  ) {
    return { total: 0, breakdown: { ...zero }, pointsByWeakSpot: {}, topExercise: null };
  }

  const breakdown: EffortPointsBreakdown = { ...zero };
  const pointsByWeakSpot: Record<string, number> = {};
  const credit = (spot: string | null | undefined, points: number): void => {
    if (spot && points > 0) pointsByWeakSpot[spot] = (pointsByWeakSpot[spot] ?? 0) + points;
  };
  const maxSets = Math.floor(session.activeDurationSeconds / EP_SET_PLAUSIBILITY_SECONDS);
  const isStretchSession = session.sessionType === 'STRETCHING';
  let countedSets = 0;
  let lastCountedAt: number | null = null;
  // Stretch sessions take the already-aggregated totalStretchSeconds; per-set
  // durations would double-count them.
  let stretchSeconds = isStretchSession ? session.totalStretchSeconds : 0;

  // Plausibility rules run on the chronological order the sets were actually
  // performed in, not on exercise-array order (supersets and unordered query
  // results would otherwise drop legitimate sets). Untimed sets keep their
  // relative order after all timed ones (stable sort, Infinity key).
  const orderedSets: Array<{
    set: EffortPointsSetInput;
    exerciseType: string;
    primaryMuscle: string | null;
    exerciseIndex: number;
  }> = [];
  session.exercises.forEach((exercise, exerciseIndex) => {
    for (const set of exercise.sets) {
      if (set.completed) {
        orderedSets.push({
          set,
          exerciseType: exercise.exerciseTypeSnapshot,
          primaryMuscle: exercise.primaryMuscleSnapshot ?? null,
          exerciseIndex,
        });
      }
    }
  });
  const pointsByExercise = new Map<number, number>();
  const creditExercise = (index: number, points: number): void => {
    if (points > 0) pointsByExercise.set(index, (pointsByExercise.get(index) ?? 0) + points);
  };
  orderedSets.sort((a, b) => setTimeKey(a.set.completedAt) - setTimeKey(b.set.completedAt));

  for (const { set, exerciseType, primaryMuscle, exerciseIndex } of orderedSets) {
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
    const isStrength = exerciseType === 'STRENGTH';
    const isStretchingExercise = exerciseType === 'STRETCHING';

    if (isWarmup) {
      breakdown.warmups += 1;
      credit(primaryMuscle, EP_WARMUP_SET);
      creditExercise(exerciseIndex, EP_WARMUP_SET);
    } else if (isStrength && (set.setType === 'WORKING' || set.setType === 'DROPSET')) {
      breakdown.sets += 1;
      credit(primaryMuscle, EP_WORKING_SET);
      creditExercise(exerciseIndex, EP_WORKING_SET);
    } else if (exerciseType === 'CARDIO') {
      const minutes = Math.floor((set.durationSeconds ?? 0) / 60);
      breakdown.cardioMinutes += minutes;
      creditExercise(exerciseIndex, minutes * EP_PER_CARDIO_MINUTE);
    } else if (!isStretchSession && (isStretchingExercise || set.setType === 'STRETCH')) {
      const seconds = set.durationSeconds ?? 0;
      stretchSeconds += seconds;
      creditExercise(exerciseIndex, Math.floor(seconds / 60) * EP_PER_STRETCH_MINUTE);
    }

    if (set.isPersonalRecord && breakdown.prs < EP_MAX_PRS_PER_SESSION) {
      breakdown.prs += 1;
      credit(primaryMuscle, EP_PERSONAL_RECORD);
      creditExercise(exerciseIndex, EP_PERSONAL_RECORD);
    }
  }

  breakdown.stretchMinutes = Math.min(
    Math.floor(stretchSeconds / 60),
    EP_MAX_STRETCH_POINTS / EP_PER_STRETCH_MINUTE,
  );
  if (session.activeDurationSeconds >= EP_FINISH_BONUS_MIN_SECONDS) {
    breakdown.finishBonus = EP_FINISH_BONUS;
  }

  credit('CARDIO', breakdown.cardioMinutes * EP_PER_CARDIO_MINUTE);
  credit('STRETCHING', breakdown.stretchMinutes * EP_PER_STRETCH_MINUTE);

  const total =
    breakdown.sets * EP_WORKING_SET +
    breakdown.warmups * EP_WARMUP_SET +
    breakdown.prs * EP_PERSONAL_RECORD +
    breakdown.cardioMinutes * EP_PER_CARDIO_MINUTE +
    breakdown.stretchMinutes * EP_PER_STRETCH_MINUTE +
    breakdown.finishBonus;

  let topExercise: string | null = null;
  let topPoints = 0;
  for (const [index, points] of pointsByExercise) {
    if (points > topPoints) {
      topPoints = points;
      topExercise = session.exercises[index]?.exerciseNameSnapshot ?? null;
    }
  }
  return { total, breakdown, pointsByWeakSpot, topExercise };
}
