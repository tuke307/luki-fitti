import { MealAmountUnit } from '../enums';

export interface MacroValues {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface ScalableFoodItem extends MacroValues {
  grams?: number | null;
  fiberG?: number | null;
  sugarG?: number | null;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export const EMPTY_MACROS: MacroValues = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

/** Sums macros; non-finite or negative values count as 0 so one bad item can't poison totals. */
export function sumMacros(items: ReadonlyArray<Partial<MacroValues>>): MacroValues {
  const safe = (v: number | undefined) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  const total = items.reduce<MacroValues>(
    (acc, item) => ({
      kcal: acc.kcal + safe(item.kcal),
      proteinG: acc.proteinG + safe(item.proteinG),
      carbsG: acc.carbsG + safe(item.carbsG),
      fatG: acc.fatG + safe(item.fatG),
    }),
    { ...EMPTY_MACROS },
  );
  return {
    kcal: Math.round(total.kcal),
    proteinG: round1(total.proteinG),
    carbsG: round1(total.carbsG),
    fatG: round1(total.fatG),
  };
}

/**
 * Rescales an item's nutrients when the user corrects the portion size
 * (e.g. the AI guessed 150 g, it was 200 g). Items without a gram value are returned as-is.
 */
export function scaleFoodItemToGrams<T extends ScalableFoodItem>(item: T, grams: number): T {
  if (!item.grams || item.grams <= 0 || !Number.isFinite(grams) || grams < 0) {
    return { ...item, grams };
  }
  const factor = grams / item.grams;
  const scale = (v: number | null | undefined) => (v === null || v === undefined ? v : round1(v * factor));
  return {
    ...item,
    grams,
    kcal: Math.round(item.kcal * factor),
    proteinG: round1(item.proteinG * factor),
    carbsG: round1(item.carbsG * factor),
    fatG: round1(item.fatG * factor),
    fiberG: scale(item.fiberG),
    sugarG: scale(item.sugarG),
  };
}

/** Units offered in amount inputs; `l` is input/display only and stored as `ML` × 1000. */
export type MealAmountDisplayUnit = 'g' | 'ml' | 'l';

export const MEAL_AMOUNT_DISPLAY_UNITS: MealAmountDisplayUnit[] = ['g', 'ml', 'l'];

/**
 * Rescales proportionally when the amount changes within the same unit. Switching between
 * g and ml only relabels the amount (a density guess would be worse than the user's own fix).
 */
export function scaleFoodItemToAmount<T extends ScalableFoodItem & { amountUnit?: MealAmountUnit }>(
  item: T,
  amount: number,
  unit: MealAmountUnit = item.amountUnit ?? MealAmountUnit.G,
): T {
  if ((item.amountUnit ?? MealAmountUnit.G) !== unit) return { ...item, grams: amount, amountUnit: unit };
  return { ...scaleFoodItemToGrams(item, amount), amountUnit: unit };
}

/** Converts a typed amount (e.g. 1.5 l) into the stored amount and unit (1500 ML). */
export function fromDisplayAmount(
  value: number,
  displayUnit: MealAmountDisplayUnit,
): { amount: number; unit: MealAmountUnit } {
  if (displayUnit === 'l') return { amount: round1(value * 1000), unit: MealAmountUnit.ML };
  return { amount: value, unit: displayUnit === 'ml' ? MealAmountUnit.ML : MealAmountUnit.G };
}

/** Picks the friendliest display unit: millilitres from one litre upward are shown as litres. */
export function toDisplayAmount(
  amount: number,
  unit: MealAmountUnit,
): { value: number; unit: MealAmountDisplayUnit } {
  if (unit === MealAmountUnit.ML) {
    return amount >= 1000 ? { value: amount / 1000, unit: 'l' } : { value: amount, unit: 'ml' };
  }
  return { value: amount, unit: 'g' };
}

/** "500 g", "500 ml", "1,5 l" (locale-aware decimals). */
export function formatMealAmount(
  amount: number | null | undefined,
  unit: MealAmountUnit | null | undefined,
  locale = 'en',
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '';
  const display = toDisplayAmount(amount, unit ?? MealAmountUnit.G);
  const value = new Intl.NumberFormat(locale, {
    maximumFractionDigits: display.unit === 'l' ? 2 : 1,
  }).format(display.value);
  return `${value} ${display.unit}`;
}

/** kcal implied by macros (4/4/9). Used to flag implausible AI estimates. */
export function kcalFromMacros(m: Pick<MacroValues, 'proteinG' | 'carbsG' | 'fatG'>): number {
  return m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9;
}

/**
 * Reconciles an item's kcal with its macros: if the stated kcal deviates more than 25 % from
 * the 4/4/9 value, the macro-derived value wins (models are better at grams than at sums).
 */
export function reconcileKcal<T extends MacroValues>(item: T): T {
  const derived = kcalFromMacros(item);
  if (derived <= 0) return item;
  const deviation = Math.abs(item.kcal - derived) / derived;
  return deviation > 0.25 ? { ...item, kcal: Math.round(derived) } : item;
}

/** Progress 0..1 toward a goal (capped), or null when no goal is set. */
export function goalProgress(value: number, goal: number | null | undefined): number | null {
  if (!goal || goal <= 0) return null;
  return Math.min(1, Math.max(0, value / goal));
}
