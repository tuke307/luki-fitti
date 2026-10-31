import { ExerciseType, MuscleGroup, SetType } from '../enums';

/**
 * Weekly hard sets per muscle. A set counts fully for the exercise's primary muscle and half for
 * each secondary muscle (e.g. bench press → chest 1, triceps 0.5, shoulders 0.5), which reflects
 * the real stimulus better than primary-only counts.
 *
 * Mirrored 1:1 in Swift (`MuscleVolume`) — keep both in sync.
 */
export const WEEKLY_SETS_TARGET = { min: 10, max: 20 } as const;
export const SECONDARY_SET_SHARE = 0.5;

export type WeeklySetsStatus = 'below' | 'within' | 'above';

export interface MuscleVolumeSession {
  startedAt: string;
  exercises: ReadonlyArray<{
    exerciseId?: string | null;
    primaryMuscleSnapshot: MuscleGroup | `${MuscleGroup}`;
    exerciseTypeSnapshot: ExerciseType | `${ExerciseType}`;
    sets: ReadonlyArray<{ completed: boolean; setType: SetType | `${SetType}` }>;
  }>;
}

export interface WeeklyMuscleSets {
  muscle: MuscleGroup;
  /** Average weighted sets per week (primary + ½ secondary), rounded to 0.5. */
  setsPerWeek: number;
  /** Average sets per week where this muscle was the primary target. */
  directSetsPerWeek: number;
  status: WeeklySetsStatus;
}

const roundHalf = (v: number) => Math.round(v * 2) / 2;

export function weeklySetsStatus(setsPerWeek: number): WeeklySetsStatus {
  if (setsPerWeek < WEEKLY_SETS_TARGET.min) return 'below';
  if (setsPerWeek > WEEKLY_SETS_TARGET.max) return 'above';
  return 'within';
}

/**
 * Average weekly sets per muscle over the `weeks` ending at `now`. Only completed working sets of
 * strength exercises count (no warm-ups, stretching or cardio). `secondaryMuscles` resolves an
 * exercise id to its secondary muscles (from the catalog); unknown ids count primary-only.
 * Full-body entries have no single muscle and are left out.
 */
export function weeklySetsByMuscle(
  sessions: readonly MuscleVolumeSession[],
  secondaryMuscles: (
    exerciseId: string,
  ) => ReadonlyArray<MuscleGroup | `${MuscleGroup}`> | undefined,
  options: { weeks: number; now?: Date },
): WeeklyMuscleSets[] {
  const weeks = Math.max(1, options.weeks);
  const end = (options.now ?? new Date()).getTime();
  const start = end - weeks * 7 * 24 * 60 * 60 * 1000;
  const total = new Map<MuscleGroup, number>();
  const direct = new Map<MuscleGroup, number>();
  const add = (map: Map<MuscleGroup, number>, m: MuscleGroup, v: number) =>
    map.set(m, (map.get(m) ?? 0) + v);

  for (const session of sessions) {
    const t = Date.parse(session.startedAt);
    if (!(t >= start && t <= end)) continue;
    for (const ex of session.exercises) {
      if (ex.exerciseTypeSnapshot !== ExerciseType.STRENGTH) continue;
      const hardSets = ex.sets.filter(
        (s) => s.completed && s.setType !== SetType.WARMUP && s.setType !== SetType.STRETCH,
      ).length;
      if (hardSets === 0) continue;
      const primary = ex.primaryMuscleSnapshot as MuscleGroup;
      if (primary !== MuscleGroup.FULL_BODY) {
        add(total, primary, hardSets);
        add(direct, primary, hardSets);
      }
      const secondary = new Set(ex.exerciseId ? (secondaryMuscles(ex.exerciseId) ?? []) : []);
      for (const m of secondary) {
        if (m === primary || m === MuscleGroup.FULL_BODY) continue;
        add(total, m as MuscleGroup, hardSets * SECONDARY_SET_SHARE);
      }
    }
  }

  return [...total.entries()]
    .map(([muscle, sets]) => {
      const setsPerWeek = roundHalf(sets / weeks);
      return {
        muscle,
        setsPerWeek,
        directSetsPerWeek: roundHalf((direct.get(muscle) ?? 0) / weeks),
        status: weeklySetsStatus(setsPerWeek),
      };
    })
    .filter((m) => m.setsPerWeek > 0)
    .sort((a, b) => b.setsPerWeek - a.setsPerWeek || a.muscle.localeCompare(b.muscle));
}
