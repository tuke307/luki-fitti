import { MEAL_TYPES, MealType, SessionStatus } from '@luki-fitti/common/enums';
import type {
  MealEntryDto,
  UpsertMealEntryDto,
  WorkoutSessionDto,
} from '@luki-fitti/common/schemas';
import {
  estimateWorkoutEnergy,
  sumMacros,
  type MacroValues,
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

/** Burn for a completed session: server estimate → HealthKit → local MET estimate. */
export function sessionBurnKcal(session: WorkoutSessionDto, bodyWeightKg?: number | null) {
  if (session.estimatedCaloriesKcal != null) {
    return {
      kcal: Math.round(session.estimatedCaloriesKcal),
      usedDefaultBodyWeight: !bodyWeightKg,
    };
  }
  return estimateWorkoutEnergy(session, bodyWeightKg);
}

export interface DayNutrition {
  key: string;
  entries: MealEntryDto[];
  byMealType: Array<{ mealType: MealType; entries: MealEntryDto[]; kcal: number }>;
  totals: MacroValues;
  workouts: Array<{ session: WorkoutSessionDto; kcal: number }>;
  burnedKcal: number;
  usedDefaultBodyWeight: boolean;
}

export function buildDay(
  key: string,
  entries: MealEntryDto[],
  sessions: WorkoutSessionDto[],
  bodyWeightKg?: number | null,
): DayNutrition {
  const dayEntries = entries
    .filter((e) => dayKey(e.eatenAt) === key)
    .sort((a, b) => Date.parse(a.eatenAt) - Date.parse(b.eatenAt));
  const workouts = sessions
    .filter((s) => s.status === SessionStatus.COMPLETED && dayKey(s.startedAt) === key)
    .map((session) => ({ session, ...sessionBurnKcal(session, bodyWeightKg) }));
  return {
    key,
    entries: dayEntries,
    byMealType: MEAL_TYPES.map((mealType) => {
      const list = dayEntries.filter((e) => e.mealType === mealType);
      return { mealType, entries: list, kcal: sumMacros(list.map((e) => e.totals)).kcal };
    }).filter((g) => g.entries.length > 0),
    totals: sumMacros(dayEntries.map((e) => e.totals)),
    workouts: workouts.map(({ session, kcal }) => ({ session, kcal })),
    burnedKcal: workouts.reduce((acc, w) => acc + w.kcal, 0),
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
