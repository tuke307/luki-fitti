import { SessionExerciseStatus } from '../enums';

interface FocusableSet {
  completed: boolean;
  completedAt?: string | null;
}

interface FocusableExercise {
  clientExerciseId: string;
  status: SessionExerciseStatus;
  sets: ReadonlyArray<FocusableSet>;
}

const hasOpenSets = (ex: FocusableExercise) => ex.sets.some((s) => !s.completed);

/**
 * Index of the exercise a running workout should show when it is (re)opened: the one the user
 * last opened, else the one with the most recently logged set while it still has open sets, else
 * the first unfinished one. Returns 0 for an empty or fully finished workout.
 */
export function resolveFocusedExerciseIndex(
  exercises: ReadonlyArray<FocusableExercise>,
  rememberedClientExerciseId?: string | null,
): number {
  if (rememberedClientExerciseId) {
    const remembered = exercises.findIndex(
      (e) => e.clientExerciseId === rememberedClientExerciseId,
    );
    if (remembered !== -1) return remembered;
  }

  let latestIdx = -1;
  let latestMs = -Infinity;
  exercises.forEach((ex, idx) => {
    for (const s of ex.sets) {
      const ms = s.completed && s.completedAt ? Date.parse(s.completedAt) : NaN;
      if (!Number.isNaN(ms) && ms > latestMs) {
        latestMs = ms;
        latestIdx = idx;
      }
    }
  });
  if (latestIdx !== -1 && hasOpenSets(exercises[latestIdx]!)) return latestIdx;

  const firstOpen = exercises.findIndex(
    (e) =>
      e.status !== SessionExerciseStatus.COMPLETED &&
      e.status !== SessionExerciseStatus.SKIPPED &&
      hasOpenSets(e),
  );
  return Math.max(0, firstOpen);
}
