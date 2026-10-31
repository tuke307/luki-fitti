import { MEAL_TYPES, MealAmountUnit, MealType, SessionStatus } from '@luki-fitti/common/enums';
import type {
  HealthDailyEnergyDto,
  HealthWorkoutDto,
  MealEntryDto,
  UpsertMealEntryDto,
  WorkoutSessionDto,
} from '@luki-fitti/common/schemas';
import {
  estimateWorkoutEnergy,
  startOfIsoWeek,
  sumMacros,
  weightAt,
  type MacroValues,
  type WeighIn,
} from '@luki-fitti/common/utils/client';

/** Local calendar day key (YYYY-MM-DD) in the device time zone. */
export function dayKey(date: Date | string | number): string {
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function shiftDay(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return dayKey(new Date(y, m - 1, d + days));
}

export function lastDays(endKey: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftDay(endKey, i - (count - 1)));
}

/** Monday of the ISO week containing `key`. */
export function weekStartKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return dayKey(startOfIsoWeek(new Date(y, m - 1, d)));
}

export function weekDays(startKey: string): string[] {
  return Array.from({ length: 7 }, (_, i) => shiftDay(startKey, i));
}

/** Kcal eaten per local day, for cheap week-strip lookups. */
export function kcalByDay(entries: readonly MealEntryDto[]): Map<string, number> {
  const byDay = new Map<string, MacroValues[]>();
  for (const e of entries) {
    const key = dayKey(e.eatenAt);
    const list = byDay.get(key);
    if (list) list.push(e.totals);
    else byDay.set(key, [e.totals]);
  }
  return new Map([...byDay].map(([key, totals]) => [key, sumMacros(totals).kcal]));
}

/**
 * Server rows replace every entry inside [from, to); entries outside the window (older weeks
 * loaded earlier) and pending local changes are kept.
 */
export function mergeWindow(
  existing: readonly MealEntryDto[],
  server: readonly MealEntryDto[],
  window: { from: string; to: string },
  pending: { ids: ReadonlySet<string>; upserts: readonly MealEntryDto[] },
): MealEntryDto[] {
  const from = Date.parse(window.from);
  const to = Date.parse(window.to);
  const serverIds = new Set(server.map((e) => e.clientEntryId));
  const outside = existing.filter((e) => {
    if (pending.ids.has(e.clientEntryId) || serverIds.has(e.clientEntryId)) return false;
    const t = Date.parse(e.eatenAt);
    return t < from || t >= to;
  });
  return [
    ...outside,
    ...server.filter((e) => !pending.ids.has(e.clientEntryId)),
    ...pending.upserts,
  ];
}

/**
 * Ring fill: share of the day's budget (goal + burned) already eaten, or full when something is
 * logged without a goal.
 */
export function ringProgress(
  eatenKcal: number,
  goal: number | null | undefined,
  burnedKcal = 0,
): number {
  if (goal && goal > 0) {
    const budget = goal + Math.max(0, burnedKcal);
    return Math.min(1, Math.max(0, eatenKcal / budget));
  }
  return eatenKcal > 0 ? 1 : 0;
}

/**
 * Body weight that applied to a workout: the latest weigh-in on/before it (or the earliest one for
 * workouts before the first weigh-in), then the profile weight. `null` = unknown.
 */
export function bodyWeightForSession(
  session: Pick<WorkoutSessionDto, 'startedAt'>,
  weighIns: readonly WeighIn[] = [],
  fallbackKg?: number | null,
): number | null {
  const kg = weightAt(weighIns, session.startedAt) ?? fallbackKg ?? null;
  return kg && kg > 0 ? kg : null;
}

/** Burn for a completed session: server estimate → HealthKit → local MET estimate. */
export function sessionBurnKcal(
  session: WorkoutSessionDto,
  weighIns: readonly WeighIn[] = [],
  fallbackKg?: number | null,
) {
  const bodyWeightKg = bodyWeightForSession(session, weighIns, fallbackKg);
  if (session.estimatedCaloriesKcal != null) {
    return {
      kcal: Math.round(session.estimatedCaloriesKcal),
      usedDefaultBodyWeight: bodyWeightKg === null,
    };
  }
  return estimateWorkoutEnergy(session, bodyWeightKg);
}

/** Apple Health activity (from `GET /activity`) used to refine the burned calories of a day. */
export interface DayActivity {
  days: readonly HealthDailyEnergyDto[];
  workouts: readonly HealthWorkoutDto[];
}

/** Minimum overlap, as a share of the shorter duration, for a session to match a Health workout. */
export const SESSION_WORKOUT_MIN_OVERLAP = 0.5;

interface TimeRange {
  start: number;
  end: number;
}

/** A completed session's time range; falls back to its active duration without `completedAt`. */
function sessionRange(session: WorkoutSessionDto): TimeRange {
  const start = Date.parse(session.startedAt);
  const completed = session.completedAt ? Date.parse(session.completedAt) : NaN;
  const end = Number.isFinite(completed)
    ? completed
    : start + Math.max(0, session.activeDurationSeconds) * 1000;
  return { start, end: Math.max(start, end) };
}

const workoutRange = (w: HealthWorkoutDto): TimeRange => {
  const start = Date.parse(w.startedAt);
  return { start, end: Math.max(start, Date.parse(w.endedAt)) };
};

/**
 * Overlap of two time ranges in ms when it covers at least half of the shorter one, else 0.
 * Ranges without any overlap (including zero-length ones) never match.
 */
export function matchingOverlapMs(a: TimeRange, b: TimeRange): number {
  const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start);
  if (!(overlap > 0)) return 0;
  const shorter = Math.min(a.end - a.start, b.end - b.start);
  return overlap >= SESSION_WORKOUT_MIN_OVERLAP * shorter ? overlap : 0;
}

const healthKcal = (w: HealthWorkoutDto) => Math.round(Math.max(0, w.activeKcal ?? 0));

export interface DayWorkoutBurn {
  session: WorkoutSessionDto;
  kcal: number;
  /** Matches a workout in Apple Health (own or from another app), so it's in the daily total. */
  covered?: boolean;
  /** The external Health workout whose energy is shown for this session, if any. */
  healthWorkout?: HealthWorkoutDto | null;
}

export interface DayNutrition {
  key: string;
  entries: MealEntryDto[];
  byMealType: Array<{ mealType: MealType; entries: MealEntryDto[]; kcal: number }>;
  totals: MacroValues;
  workouts: DayWorkoutBurn[];
  /** Workouts recorded by other apps/devices that don't match a LukiFitti session. */
  externalWorkouts: Array<{ workout: HealthWorkoutDto; kcal: number }>;
  /**
   * Apple Health active energy not explained by the listed workouts ("Daily activity");
   * `null` without Health data for the day.
   */
  dailyActivityKcal: number | null;
  burnedKcal: number;
  usedDefaultBodyWeight: boolean;
}

/**
 * Builds a day's food log and burn. With Apple Health `activity`, the day's active energy is the
 * base; sessions matching a Health workout are already part of it, and only unmatched sessions
 * are added on top. Without Health energy for the day, sessions and unmatched external workouts
 * are summed.
 */
export function buildDay(
  key: string,
  entries: MealEntryDto[],
  sessions: WorkoutSessionDto[],
  weighIns: readonly WeighIn[] = [],
  fallbackBodyWeightKg?: number | null,
  activity?: DayActivity | null,
): DayNutrition {
  const dayEntries = entries
    .filter((e) => dayKey(e.eatenAt) === key)
    .sort((a, b) => Date.parse(a.eatenAt) - Date.parse(b.eatenAt));
  const daySessions = sessions.filter(
    (s) => s.status === SessionStatus.COMPLETED && dayKey(s.startedAt) === key,
  );
  const healthWorkouts = (activity?.workouts ?? []).map((w) => ({ w, range: workoutRange(w) }));
  const matchedExternal = new Set<string>();

  const workouts = daySessions.map((session) => {
    const estimate = sessionBurnKcal(session, weighIns, fallbackBodyWeightKg);
    const range = sessionRange(session);
    let covered = false;
    let best: { w: HealthWorkoutDto; overlap: number } | null = null;
    for (const { w, range: wr } of healthWorkouts) {
      const overlap = matchingOverlapMs(range, wr);
      if (overlap === 0) continue;
      covered = true;
      if (!w.isOwn) {
        matchedExternal.add(w.id);
        if (w.activeKcal != null && (!best || overlap > best.overlap)) best = { w, overlap };
      }
    }
    return best
      ? { session, kcal: healthKcal(best.w), usedDefaultBodyWeight: false, covered, best: best.w }
      : { session, ...estimate, covered, best: null };
  });

  const externalWorkouts = (activity?.workouts ?? [])
    .filter((w) => !w.isOwn && !matchedExternal.has(w.id) && dayKey(w.startedAt) === key)
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
    .map((workout) => ({ workout, kcal: healthKcal(workout) }));
  const externalKcal = externalWorkouts.reduce((acc, w) => acc + w.kcal, 0);

  const healthDay = activity?.days.find((d) => d.day === key);
  const sessionsKcal = workouts.reduce((acc, w) => acc + w.kcal, 0);
  let burnedKcal: number;
  let dailyActivityKcal: number | null = null;
  if (healthDay) {
    const activeKcal = Math.round(Math.max(0, healthDay.activeKcal));
    const coveredKcal = workouts.filter((w) => w.covered).reduce((acc, w) => acc + w.kcal, 0);
    burnedKcal = activeKcal + (sessionsKcal - coveredKcal);
    dailyActivityKcal = Math.max(0, activeKcal - externalKcal - coveredKcal);
  } else {
    burnedKcal = sessionsKcal + externalKcal;
  }

  return {
    key,
    entries: dayEntries,
    byMealType: MEAL_TYPES.map((mealType) => {
      const list = dayEntries.filter((e) => e.mealType === mealType);
      return { mealType, entries: list, kcal: sumMacros(list.map((e) => e.totals)).kcal };
    }).filter((g) => g.entries.length > 0),
    totals: sumMacros(dayEntries.map((e) => e.totals)),
    workouts: workouts.map(({ session, kcal, covered, best }) => ({
      session,
      kcal,
      covered,
      healthWorkout: best,
    })),
    externalWorkouts,
    dailyActivityKcal,
    burnedKcal,
    usedDefaultBodyWeight: workouts.some((w) => w.usedDefaultBodyWeight),
  };
}

/** Builds the optimistic DTO shown while an upsert is pending or offline. */
export function entryFromPayload(
  payload: UpsertMealEntryDto,
  existing?: MealEntryDto | null,
): MealEntryDto {
  const now = new Date().toISOString();
  return {
    id: existing?.id ?? `local-${payload.clientEntryId}`,
    clientEntryId: payload.clientEntryId,
    eatenAt: payload.eatenAt,
    mealType: payload.mealType,
    label: payload.label ?? null,
    notes: payload.notes ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    items: payload.items.map((item, index) => ({
      id: `local-item-${index}`,
      orderIndex: index,
      name: item.name,
      grams: item.grams ?? null,
      amountUnit: item.amountUnit ?? MealAmountUnit.G,
      kcal: item.kcal,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      fiberG: item.fiberG ?? null,
      sugarG: item.sugarG ?? null,
      source: item.source,
      confidence: item.confidence ?? null,
    })),
    photos: existing?.photos ?? [],
    totals: sumMacros(payload.items),
  };
}

/** Default meal for "now", so a quick add lands in the obvious slot. */
export function mealTypeForTime(date: Date): MealType {
  const h = date.getHours();
  if (h < 10) return MealType.BREAKFAST;
  if (h < 14) return MealType.LUNCH;
  if (h < 17) return MealType.SNACK;
  if (h < 22) return MealType.DINNER;
  return MealType.SNACK;
}

export function newClientId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `meal-${crypto.randomUUID()}`
    : `meal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
