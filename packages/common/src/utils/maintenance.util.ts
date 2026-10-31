import type { WeighIn } from './body-weight.util';

/**
 * Learned maintenance ("adaptive TDEE"): what the user actually burns, derived from logged intake
 * and the weight trend instead of a population formula.
 *
 *   energy out = average intake − weight change × 7700 kcal/kg
 *
 * Mirrored 1:1 in Swift (`MaintenanceMath`) — keep both in sync.
 */
export const MAINTENANCE_RULES = {
  /** Days looked back (ending yesterday; today is still being logged). */
  windowDays: 28,
  /** Fully logged days required inside the window. */
  minLoggedDays: 14,
  minWeighIns: 4,
  /** Days between the first and last weigh-in in the window. */
  minWeighInSpanDays: 10,
  /** Energy per kg of body weight change (mixed fat / lean tissue). */
  kcalPerKg: 7700,
  /** Days below this share of the median logged intake count as partly logged and are skipped. */
  partialDayRatio: 0.5,
  /** Results outside this range point to incomplete logging and are discarded. */
  plausibleKcal: { min: 1200, max: 6000 },
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface MaintenanceDayInput {
  /** Local calendar day, "YYYY-MM-DD". */
  day: string;
  intakeKcal: number;
  /** Workouts and activity burned that day (as shown in the food ring). */
  burnedKcal: number;
}

export interface MaintenanceEstimate {
  /** Average total energy burned per day, activity included. */
  totalKcal: number;
  /**
   * Total minus the average burned calories: the base goal that matches how the food ring adds
   * burned calories on top.
   */
  baseKcal: number;
  avgIntakeKcal: number;
  avgBurnedKcal: number;
  weightChangeKgPerWeek: number;
  loggedDays: number;
  weighIns: number;
}

const localDayStart = (key: string) => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getTime();
};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/** Least-squares slope of weight over time, in kg per day. */
export function weightSlopeKgPerDay(points: ReadonlyArray<{ t: number; kg: number }>): number {
  const n = points.length;
  if (n < 2) return 0;
  const xs = points.map((p) => (p.t - points[0]!.t) / DAY_MS);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = points.reduce((a, p) => a + p.kg, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - meanX) * (points[i]!.kg - meanY);
    den += (xs[i]! - meanX) ** 2;
  }
  return den > 0 ? num / den : 0;
}

/**
 * Estimates maintenance from the given days (the caller passes the window, e.g. the 28 days ending
 * yesterday) and all weigh-ins; weigh-ins outside the days' range are ignored. `null` until there
 * is enough data or when the result is implausible.
 */
export function estimateMaintenance(
  days: readonly MaintenanceDayInput[],
  weighIns: readonly WeighIn[],
): MaintenanceEstimate | null {
  const R = MAINTENANCE_RULES;
  if (days.length === 0) return null;

  const logged = days.filter((d) => d.intakeKcal > 0);
  if (logged.length < R.minLoggedDays) return null;
  const threshold = median(logged.map((d) => d.intakeKcal)) * R.partialDayRatio;
  const complete = logged.filter((d) => d.intakeKcal >= threshold);
  if (complete.length < R.minLoggedDays) return null;

  const starts = days.map((d) => localDayStart(d.day));
  const from = Math.min(...starts);
  const to = Math.max(...starts) + DAY_MS;
  const points = weighIns
    .map((w) => ({ t: new Date(w.measuredAt).getTime(), kg: w.weightKg }))
    .filter((p) => p.t >= from && p.t < to && p.kg > 0)
    .sort((a, b) => a.t - b.t);
  if (points.length < R.minWeighIns) return null;
  if ((points[points.length - 1]!.t - points[0]!.t) / DAY_MS < R.minWeighInSpanDays) return null;

  const avgIntake = complete.reduce((a, d) => a + d.intakeKcal, 0) / complete.length;
  const avgBurned = complete.reduce((a, d) => a + Math.max(0, d.burnedKcal), 0) / complete.length;
  const slope = weightSlopeKgPerDay(points);
  const total = avgIntake - slope * R.kcalPerKg;
  if (total < R.plausibleKcal.min || total > R.plausibleKcal.max) return null;

  const round10 = (v: number) => Math.round(v / 10) * 10;
  return {
    totalKcal: round10(total),
    baseKcal: round10(total - avgBurned),
    avgIntakeKcal: Math.round(avgIntake),
    avgBurnedKcal: Math.round(avgBurned),
    weightChangeKgPerWeek: Math.round(slope * 7 * 100) / 100,
    loggedDays: complete.length,
    weighIns: points.length,
  };
}
