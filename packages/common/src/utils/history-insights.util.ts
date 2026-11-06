import { ExerciseType, MuscleGroup, SetType, WeightUnit } from '../enums';
import type { WorkoutSessionDto } from '../schemas';

const LBS_TO_KG = 0.45359237;

export interface HistoryMuscleShare {
  muscle: MuscleGroup;
  /** Completed sets, warm-ups included. */
  sets: number;
  /** Working volume in kg (no warm-ups), rounded. */
  volumeKg: number;
  /** Share of all counted sets, 0–100, rounded. */
  pct: number;
}

export interface HistoryPersonalBest {
  /** Exercise id, or the name snapshot for exercises without one. */
  key: string;
  exerciseName: string;
  muscle: MuscleGroup;
  /** Heaviest working set in kg, rounded to 0.1. */
  maxWeightKg: number;
  reps: number;
  /** Epley estimate of that set in kg, rounded to 0.1. */
  est1RM: number;
  startedAt: string;
}

export interface HistoryInsightsFilter {
  muscle?: MuscleGroup | null;
  exerciseId?: string | null;
}

export interface HistoryInsights {
  muscleDistribution: HistoryMuscleShare[];
  /** Sorted by estimated max, highest first. */
  personalRecords: HistoryPersonalBest[];
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Muscles trained and personal bests for the History page. Sessions are walked oldest first, so
 * the first time a weight × reps was reached wins a tie. Exercises outside the muscle / exercise
 * filter are skipped. Ported 1:1 to Swift as `HistoryInsights` (shared fixture
 * `__fixtures__/history-insights-cases.json`).
 */
export function computeHistoryInsights(
  sessions: WorkoutSessionDto[],
  filter: HistoryInsightsFilter = {},
): HistoryInsights {
  const muscleSets = new Map<MuscleGroup, { sets: number; volumeKg: number }>();
  const prMap = new Map<string, HistoryPersonalBest>();
  const ordered = [...sessions].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));

  for (const s of ordered) {
    for (const ex of s.exercises) {
      if (filter.muscle && ex.primaryMuscleSnapshot !== filter.muscle) continue;
      if (filter.exerciseId && ex.exerciseId !== filter.exerciseId) continue;
      const isStretch = ex.exerciseTypeSnapshot === ExerciseType.STRETCHING;

      for (const set of ex.sets) {
        if (!set.completed) continue;
        const cur = muscleSets.get(ex.primaryMuscleSnapshot) ?? { sets: 0, volumeKg: 0 };
        cur.sets += 1;
        const reps = set.reps ?? 0;
        if (
          !isStretch &&
          set.setType !== SetType.STRETCH &&
          set.setType !== SetType.WARMUP &&
          set.weight &&
          set.weight > 0 &&
          reps > 0
        ) {
          const wKg = set.weightUnit === WeightUnit.LBS ? set.weight * LBS_TO_KG : set.weight;
          cur.volumeKg += wKg * reps;
          const key = ex.exerciseId ?? ex.exerciseNameSnapshot;
          const prev = prMap.get(key);
          const maxWeightKg = round1(wKg);
          if (
            !prev ||
            maxWeightKg > prev.maxWeightKg ||
            (maxWeightKg === prev.maxWeightKg && reps > prev.reps)
          ) {
            prMap.set(key, {
              key,
              exerciseName: ex.exerciseNameSnapshot,
              muscle: ex.primaryMuscleSnapshot,
              maxWeightKg,
              reps,
              est1RM: round1(wKg * (1 + reps / 30)),
              startedAt: s.startedAt,
            });
          }
        }
        muscleSets.set(ex.primaryMuscleSnapshot, cur);
      }
    }
  }

  const total = Array.from(muscleSets.values()).reduce((a, b) => a + b.sets, 0);
  const muscleDistribution = Array.from(muscleSets.entries())
    .filter(([, d]) => d.sets > 0)
    .map(([muscle, d]) => ({
      muscle,
      sets: d.sets,
      volumeKg: Math.round(d.volumeKg),
      pct: total > 0 ? Math.round((d.sets / total) * 100) : 0,
    }))
    .sort((a, b) => b.sets - a.sets || cmp(a.muscle, b.muscle));

  const personalRecords = Array.from(prMap.values()).sort(
    (a, b) => b.est1RM - a.est1RM || cmp(a.exerciseName, b.exerciseName),
  );
  return { muscleDistribution, personalRecords };
}
