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
