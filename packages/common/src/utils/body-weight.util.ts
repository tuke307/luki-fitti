/** Minimal shape shared by DTOs, Prisma rows and optimistic client entries. */
export interface WeighIn {
  measuredAt: string | Date;
  weightKg: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const KG_PER_LB = 0.45359237;

const time = (value: string | Date | number) =>
  typeof value === 'number' ? value : new Date(value).getTime();

/** Entries sorted by `measuredAt`, oldest first. Does not mutate the input. */
export function sortWeighIns<T extends WeighIn>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => time(a.measuredAt) - time(b.measuredAt));
}

/**
 * Body weight that applies at `date`: the latest weigh-in on or before it. Dates before the first
 * weigh-in use the earliest one (closer to reality than a population default). `null` = no history.
 */
export function weightAt(
  entries: readonly WeighIn[],
  date: string | Date | number,
): number | null {
  if (entries.length === 0) return null;
  const at = time(date);
  let best: WeighIn | null = null;
  let earliest: WeighIn | null = null;
  for (const entry of entries) {
    const t = time(entry.measuredAt);
    if (!earliest || t < time(earliest.measuredAt)) earliest = entry;
    if (t <= at && (!best || t >= time(best.measuredAt))) best = entry;
  }
  return (best ?? earliest)?.weightKg ?? null;
}

/** Most recent weigh-in, or `null` when there is no history. */
export function latestWeighIn<T extends WeighIn>(entries: readonly T[]): T | null {
  let latest: T | null = null;
  for (const entry of entries) {
    if (!latest || time(entry.measuredAt) >= time(latest.measuredAt)) latest = entry;
  }
  return latest;
}

/** Whether there is a weigh-in at or after `since` (e.g. start of the current week). */
export function hasWeighInSince(
  entries: readonly WeighIn[],
  since: string | Date | number,
): boolean {
  const from = time(since);
  return entries.some((e) => time(e.measuredAt) >= from);
}

/**
 * Trailing moving average over `windowDays` for each entry (oldest first). Smooths day-to-day
 * water fluctuations for the trend line in the graph.
 */
export function movingAverageWeights<T extends WeighIn>(
  entries: readonly T[],
  windowDays = 7,
): Array<{ entry: T; averageKg: number }> {
  const sorted = sortWeighIns(entries);
  const windowMs = windowDays * DAY_MS;
  let start = 0;
  let sum = 0;
  return sorted.map((entry, i) => {
    sum += entry.weightKg;
    const t = time(entry.measuredAt);
    while (time(sorted[start]!.measuredAt) <= t - windowMs) {
      sum -= sorted[start]!.weightKg;
      start++;
    }
    return { entry, averageKg: Math.round((sum / (i - start + 1)) * 100) / 100 };
  });
}

export interface WeightTrend {
  latestKg: number | null;
  /** Change vs. the weight that applied 7 / 30 days before the latest weigh-in. */
  change7dKg: number | null;
  change30dKg: number | null;
  daysSinceLast: number | null;
}

export function weightTrend(entries: readonly WeighIn[], now: Date = new Date()): WeightTrend {
  const latest = latestWeighIn(entries);
  if (!latest) return { latestKg: null, change7dKg: null, change30dKg: null, daysSinceLast: null };
  const last = time(latest.measuredAt);
  const first = Math.min(...entries.map((e) => time(e.measuredAt)));
  const change = (days: number) => {
    const ref = last - days * DAY_MS;
    if (ref < first) return null;
    const before = weightAt(entries, ref);
    return before == null ? null : Math.round((latest.weightKg - before) * 10) / 10;
  };
  return {
    latestKg: latest.weightKg,
    change7dKg: change(7),
    change30dKg: change(30),
    daysSinceLast: Math.max(0, Math.floor((now.getTime() - last) / DAY_MS)),
  };
}

export const kgToLbs = (kg: number) => kg / KG_PER_LB;
export const lbsToKg = (lbs: number) => lbs * KG_PER_LB;
