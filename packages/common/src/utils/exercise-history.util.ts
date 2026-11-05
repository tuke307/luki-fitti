import { ExerciseType, SetType, WeightUnit } from '../enums';
import type { WorkoutSessionDto } from '../schemas';
import { convertWeight, estimateOneRepMax } from './progression.util';

/** What an exercise's history is measured in: weight lifted, reps (bodyweight) or time. */
export type ExerciseHistoryMetric = 'WEIGHT' | 'REPS' | 'DURATION';

export interface ExerciseHistorySet {
  warmup: boolean;
  /** In the requested unit; `null` when no weight was logged. */
  weight: number | null;
  reps: number | null;
  durationSeconds: number | null;
}

export interface ExerciseHistoryLogEntry {
  clientSessionId: string;
  workoutName: string;
  startedAt: string;
  /** Completed sets in logged order, warm-ups included. */
  sets: ExerciseHistorySet[];
  /** Best estimated 1RM of the working sets; `null` without weighted sets. */
  bestEstimated1RM: number | null;
  /** Headline value in the log's metric: estimated 1RM, most reps or longest set (s). */
  best: number;
  isPersonalRecord: boolean;
}

export interface ExerciseHistoryLog {
  metric: ExerciseHistoryMetric;
  /** Newest first. */
  sessions: ExerciseHistoryLogEntry[];
  bestEstimated1RM: number | null;
  heaviestSet: { weight: number; reps: number } | null;
  mostReps: number | null;
  longestDurationSeconds: number | null;
  /** Oldest first: estimated 1RM (weight) or most reps per session; empty for timed exercises. */
  trend: Array<{ startedAt: string; value: number }>;
}

interface LoggedSet extends ExerciseHistorySet {
  rpe: number | null;
}

const maxOrNull = (values: number[]): number | null =>
  values.length > 0 ? Math.max(...values) : null;

/**
 * Every completed session of one exercise for the exercise sheet: sets (warm-ups flagged),
 * best estimated 1RM, heaviest set, PR session and a trend line. Matches by id, or by name for
 * sessions logged without an id, like `extractGlobalExerciseHistory`. Ported 1:1 to iOS as
 * `ExerciseHistoryLog.build` (LukiFittiDomain).
 */
export function buildExerciseHistoryLog(params: {
  exerciseId: string | null | undefined;
  exerciseName?: string | null;
  exerciseType?: ExerciseType | null;
  historySessions: WorkoutSessionDto[];
  weightUnit?: WeightUnit;
}): ExerciseHistoryLog {
  const { exerciseId, historySessions, weightUnit = WeightUnit.KG } = params;
  const name = params.exerciseName?.trim().toLowerCase() ?? '';
  let stretching = params.exerciseType === ExerciseType.STRETCHING;

  const raw: Array<{ session: WorkoutSessionDto; sets: LoggedSet[] }> = [];
  if (exerciseId || name) {
    const completed = historySessions
      .filter((s) => s.status === 'COMPLETED' || s.completedAt !== null)
      .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
    for (const session of completed) {
      const sets: LoggedSet[] = [];
      for (const ex of session.exercises) {
        const matches =
          (exerciseId && ex.exerciseId === exerciseId) ||
          (!ex.exerciseId && name && ex.exerciseNameSnapshot.trim().toLowerCase() === name);
        if (!matches) continue;
        if (ex.exerciseTypeSnapshot === ExerciseType.STRETCHING) stretching = true;
        for (const s of ex.sets) {
          if (!s.completed) continue;
          const weight =
            s.weight && s.weight > 0 ? convertWeight(s.weight, s.weightUnit, weightUnit) : null;
          const reps = s.reps && s.reps > 0 ? s.reps : null;
          const durationSeconds =
            s.durationSeconds && s.durationSeconds > 0 ? s.durationSeconds : null;
          if (weight === null && reps === null && durationSeconds === null) continue;
          sets.push({
            warmup: s.setType === SetType.WARMUP,
            weight,
            reps,
            durationSeconds,
            rpe: s.rpe ?? null,
          });
        }
      }
      if (sets.some((s) => !s.warmup)) raw.push({ session, sets });
    }
  }

  const working = raw.flatMap((r) => r.sets.filter((s) => !s.warmup));
  const metric: ExerciseHistoryMetric = stretching
    ? 'DURATION'
    : working.some((s) => s.weight !== null)
      ? 'WEIGHT'
      : working.some((s) => s.reps !== null)
        ? 'REPS'
        : working.some((s) => s.durationSeconds !== null)
          ? 'DURATION'
          : 'WEIGHT';

  const entries: ExerciseHistoryLogEntry[] = raw.map(({ session, sets }) => {
    const work = sets.filter((s) => !s.warmup);
    const bestEstimated1RM = stretching
      ? null
      : maxOrNull(
          work
            .filter((s) => s.weight !== null && s.reps !== null)
            .map((s) => estimateOneRepMax(s.weight!, s.reps!, s.rpe)),
        );
    const best =
      metric === 'WEIGHT'
        ? (bestEstimated1RM ?? 0)
        : metric === 'REPS'
          ? (maxOrNull(work.flatMap((s) => (s.reps === null ? [] : [s.reps]))) ?? 0)
          : (maxOrNull(
              work.flatMap((s) => (s.durationSeconds === null ? [] : [s.durationSeconds])),
            ) ?? 0);
    return {
      clientSessionId: session.clientSessionId,
      workoutName: session.workoutNameSnapshot,
      startedAt: session.startedAt,
      sets: sets.map((s) => ({
        warmup: s.warmup,
        weight: s.weight,
        reps: s.reps,
        durationSeconds: s.durationSeconds,
      })),
      bestEstimated1RM,
      best,
      isPersonalRecord: false,
    };
  });

  // The PR is the first session that reached the best value; a single session is no record.
  if (entries.length >= 2) {
    const top = Math.max(...entries.map((e) => e.best));
    const pr = entries.find((e) => e.best === top && top > 0);
    if (pr) pr.isPersonalRecord = true;
  }

  let heaviestSet: ExerciseHistoryLog['heaviestSet'] = null;
  if (!stretching) {
    for (const s of working) {
      if (s.weight === null) continue;
      const reps = s.reps ?? 0;
      if (
        !heaviestSet ||
        s.weight > heaviestSet.weight ||
        (s.weight === heaviestSet.weight && reps > heaviestSet.reps)
      ) {
        heaviestSet = { weight: s.weight, reps };
      }
    }
  }

  return {
    metric,
    sessions: [...entries].reverse(),
    bestEstimated1RM: maxOrNull(
      entries.flatMap((e) => (e.bestEstimated1RM === null ? [] : [e.bestEstimated1RM])),
    ),
    heaviestSet,
    mostReps: maxOrNull(working.flatMap((s) => (s.reps === null ? [] : [s.reps]))),
    longestDurationSeconds: maxOrNull(
      working.flatMap((s) => (s.durationSeconds === null ? [] : [s.durationSeconds])),
    ),
    trend:
      metric === 'DURATION'
        ? []
        : entries.filter((e) => e.best > 0).map((e) => ({ startedAt: e.startedAt, value: e.best })),
  };
}
