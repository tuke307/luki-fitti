import { ExerciseType, MuscleGroup, SetType, WeightUnit } from '@luki-fitti/common/enums';
import type {
  ExerciseDto,
  PublicExerciseDto,
  PublicSessionDto,
  PublicSessionExerciseDto,
} from '@luki-fitti/common/schemas';
import {
  buildExerciseSearchIndex,
  foldSearchText,
  searchExercises,
  type ExerciseSearchIndex,
} from '@luki-fitti/common/utils';
import { estimateOneRepMax, convertWeight } from '@luki-fitti/common/utils';
import { weeklySetsByMuscle, type MuscleVolumeSession } from '@luki-fitti/common/utils';
import { kgToLbs } from '@luki-fitti/common/utils';
import { dayKeyInZone, weekStartDayKey, addDaysToDayKey } from './mcp-date-utils';

const KG_PER_LBS = kgToLbs(1); // lbs per kg

/** Weight unit the assistant answers in: the user's unit, or kg without `read:profile`. */
export type OutputWeightUnit = 'kg' | 'lbs';

export function outputWeightUnit(weightUnit: WeightUnit | null): OutputWeightUnit {
  return weightUnit === WeightUnit.LBS ? 'lbs' : 'kg';
}

export const weightInUnit = (kg: number, unit: OutputWeightUnit): number =>
  Math.round((unit === 'lbs' ? kg * KG_PER_LBS : kg) * 100) / 100;

// ── Exercise resolution ──

export type ExerciseResolution<T> =
  { kind: 'resolved'; exercise: T } | { kind: 'none' } | { kind: 'ambiguous'; candidates: T[] };

/** Search index plus the id→row map to translate hits back to the caller's DTO. */
export interface ExerciseLookup<T extends { id: string; name: string }> {
  index: ExerciseSearchIndex;
  byId: Map<string, T>;
}

/**
 * Builds the search index plus a lookup that maps hits back to the caller's
 * own rows. `buildExerciseSearchIndex` is typed on the full internal
 * `ExerciseDto`, but it only ever reads `id`, `name` and `tags` — the minimal
 * stand-in below is the one place a cast is needed.
 */
export function exerciseIndex<T extends { id: string; name: string }>(
  exercises: T[],
  tags: (e: T) => string[],
): ExerciseLookup<T> {
  const stubs = exercises.map((e) => ({ id: e.id, name: e.name, tags: tags(e) }));
  return {
    index: buildExerciseSearchIndex(stubs as unknown as ExerciseDto[]),
    byId: new Map(exercises.map((e) => [e.id, e])),
  };
}

/**
 * Resolves a free-text exercise name. Rule: an exact folded-name match
 * anywhere in the results wins (not only the top score); otherwise the top
 * hit wins only when it is clearly ahead (score at least 25% above the
 * runner-up); anything else is ambiguous and the caller should list the
 * candidates instead of guessing.
 */
export function resolveExercise<T extends { id: string; name: string }>(
  lookup: ExerciseLookup<T>,
  query: string,
): ExerciseResolution<T> {
  const results = searchExercises(lookup.index, query, { limit: 5, matchAllWords: false });
  if (results.length === 0) return { kind: 'none' };
  const folded = foldSearchText(query);
  const exact = results.find((r) => foldSearchText(r.exercise.name) === folded);
  if (exact) return { kind: 'resolved', exercise: lookup.byId.get(exact.exercise.id)! };
  const top = results[0]!;
  const second = results[1]?.score ?? 0;
  if (top.score >= second * 1.25) {
    return { kind: 'resolved', exercise: lookup.byId.get(top.exercise.id)! };
  }
  return {
    kind: 'ambiguous',
    candidates: results.map((r) => lookup.byId.get(r.exercise.id)!),
  };
}

// ── Per-session exercise stats ──

const isWorkingSet = (setType: SetType): boolean =>
  setType !== SetType.WARMUP && setType !== SetType.STRETCH;

export interface ExerciseSessionStat {
  sessionId: string;
  date: string;
  bestSet: { weight: number; reps: number } | null;
  e1rm: number | null;
  volume: number;
}

/** Best set (heaviest completed working set), e1RM and volume of one exercise in a session. */
export function exerciseStatInSession(
  session: PublicSessionDto,
  exerciseId: string,
  unit: OutputWeightUnit,
): ExerciseSessionStat | null {
  const entry = session.exercises.find((e) => e.exerciseId === exerciseId);
  if (!entry) return null;
  const working = entry.sets.filter(
    (s) => s.completed && isWorkingSet(s.setType) && s.weightKg !== null && s.reps !== null,
  );
  const best = working.reduce<(typeof working)[number] | null>(
    (acc, s) => (acc === null || (s.weightKg ?? 0) > (acc.weightKg ?? 0) ? s : acc),
    null,
  );
  const volume = working.reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0);
  return {
    sessionId: session.id,
    date: session.startedAt,
    bestSet: best ? { weight: weightInUnit(best.weightKg!, unit), reps: best.reps! } : null,
    e1rm: best ? weightInUnit(estimateOneRepMax(best.weightKg!, best.reps!, best.rpe), unit) : null,
    volume: weightInUnit(volume, unit),
  };
}

/** First-vs-last e1RM change, in percent, over chronological stats. */
export function e1rmTrend(stats: ExerciseSessionStat[]): {
  firstE1rm: number | null;
  lastE1rm: number | null;
  changePercent: number | null;
} {
  const withE1rm = stats.filter((s) => s.e1rm !== null);
  if (withE1rm.length === 0) return { firstE1rm: null, lastE1rm: null, changePercent: null };
  const first = withE1rm[0]!.e1rm!;
  const last = withE1rm[withE1rm.length - 1]!.e1rm!;
  const changePercent = first > 0 ? Math.round(((last - first) / first) * 1000) / 10 : null;
  return { firstE1rm: first, lastE1rm: last, changePercent };
}

// ── Training summary ──

/** Maps public session rows onto the `weeklySetsByMuscle` input shape. */
export function toMuscleVolumeSessions(sessions: PublicSessionDto[]): MuscleVolumeSession[] {
  return sessions.map((s) => ({
    startedAt: s.startedAt,
    exercises: s.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      primaryMuscleSnapshot: e.primaryMuscle,
      exerciseTypeSnapshot: e.exerciseType,
      sets: e.sets.map((set) => ({ completed: set.completed, setType: set.setType })),
    })),
  }));
}

export function muscleVolume(
  sessions: PublicSessionDto[],
  exercises: PublicExerciseDto[],
  weeks: number,
  now: Date,
) {
  const secondary = new Map(
    exercises.map((e) => [e.id, e.muscleGroups.filter((m) => m !== e.primaryMuscleGroup)]),
  );
  return weeklySetsByMuscle(toMuscleVolumeSessions(sessions), (id) => secondary.get(id), {
    weeks,
    now,
  });
}

export interface WeekCount {
  weekKey: string;
  sessions: number;
}

/** Completed sessions per ISO week (Monday start), evaluated in `timeZone`. */
export function sessionsPerIsoWeek(
  startedAts: readonly string[],
  timeZone: string,
): Map<string, number> {
  const perWeek = new Map<string, number>();
  for (const iso of startedAts) {
    const week = weekStartDayKey(dayKeyInZone(new Date(iso), timeZone));
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
  }
  return perWeek;
}

/**
 * Consecutive ISO weeks meeting `weeklyGoal`, walking back from the week
 * containing `periodEnd` (at most `maxWeeks`, the current week counts only when
 * it is already over — an incomplete week neither breaks nor extends the run).
 */
export function weeklyGoalStreak(
  startedAts: readonly string[],
  weeklyGoal: number,
  periodEnd: Date,
  timeZone: string,
  now: Date,
  maxWeeks = 52,
): number {
  if (weeklyGoal <= 0) return 0;
  const perWeek = sessionsPerIsoWeek(startedAts, timeZone);
  let week = weekStartDayKey(dayKeyInZone(periodEnd, timeZone));
  // Skip the current, still-running week.
  if (zoneDayKeyCompare(week, weekStartDayKey(dayKeyInZone(now, timeZone))) === 0) {
    week = addDaysToDayKey(week, -7);
  }
  let streak = 0;
  for (let i = 0; i < maxWeeks; i++) {
    if ((perWeek.get(week) ?? 0) >= weeklyGoal) streak += 1;
    else break;
    week = addDaysToDayKey(week, -7);
  }
  return streak;
}

const zoneDayKeyCompare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Whole weeks the period spans — goal scaling for month/year periods. */
export function weeksInRange(fromDayKey: string, toDayKey: string): number {
  let weeks = 0;
  for (let d = fromDayKey; d <= toDayKey && weeks < 60; d = addDaysToDayKey(d, 7)) weeks += 1;
  // Partial trailing week still counts toward the goal comparison as a week.
  const days = dayCount(fromDayKey, toDayKey);
  return Math.max(1, Math.ceil(days / 7));
}

const dayCount = (fromDayKey: string, toDayKey: string): number => {
  let days = 0;
  for (let d = fromDayKey; d <= toDayKey && days < 400; d = addDaysToDayKey(d, 1)) days += 1;
  return days;
};

/** Completed strength sessions only, chronological. */
export function completedStrengthSessions(sessions: PublicSessionDto[]): PublicSessionDto[] {
  return sessions
    .filter((s) => s.status === 'COMPLETED')
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

/** Session-level muscle volume needs STRENGTH exercises only; other types kept harmlessly. */
export const isStrengthExercise = (e: PublicSessionExerciseDto): boolean =>
  e.exerciseType === ExerciseType.STRENGTH;

export const MUSCLE_ORDER = Object.values(MuscleGroup);

export { convertWeight };
