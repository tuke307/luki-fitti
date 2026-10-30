import { BodyWeightSource, WeightUnit } from '@luki-fitti/common/enums';
import type { BodyWeightEntryDto, UpsertBodyWeightEntryDto } from '@luki-fitti/common/schemas';
import {
  kgToLbs,
  lbsToKg,
  movingAverageWeights,
  sortWeighIns,
} from '@luki-fitti/common/utils/client';

const DAY_MS = 24 * 60 * 60 * 1000;

export const WEIGHT_RANGES = ['1m', '3m', '6m', '1y', 'all'] as const;
export type WeightRange = (typeof WEIGHT_RANGES)[number];

const RANGE_MONTHS: Record<Exclude<WeightRange, 'all'>, number> = {
  '1m': 1,
  '3m': 3,
  '6m': 6,
  '1y': 12,
};

export function newWeightClientId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `weight-${crypto.randomUUID()}`
    : `weight-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Builds the optimistic DTO shown while an upsert is pending or offline. */
export function weightEntryFromPayload(
  payload: UpsertBodyWeightEntryDto,
  existing?: BodyWeightEntryDto | null,
): BodyWeightEntryDto {
  const now = new Date().toISOString();
  return {
    id: existing?.id ?? `local-${payload.clientEntryId}`,
    clientEntryId: payload.clientEntryId,
    measuredAt: payload.measuredAt,
    weightKg: payload.weightKg,
    source: existing?.source ?? BodyWeightSource.MANUAL,
    healthKitUuid: existing?.healthKitUuid ?? null,
    note: payload.note?.trim() ? payload.note.trim() : null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

/** Body weight in the person's unit, to one decimal (scales show 0.1 steps). */
export function toDisplayWeight(kg: number, unit: WeightUnit): number {
  const value = unit === WeightUnit.LBS ? kgToLbs(kg) : kg;
  return Math.round(value * 10) / 10;
}

/** Input in the person's unit → kg for storage (two decimals keep lb round-trips exact). */
export function fromDisplayWeight(value: number, unit: WeightUnit): number {
  const kg = unit === WeightUnit.LBS ? lbsToKg(value) : value;
  return Math.round(kg * 100) / 100;
}

/** Value for `<input type="datetime-local">` in the device time zone. */
export function toDateTimeLocalValue(date: Date | string | number): string {
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `datetime-local` value (device time zone) → ISO timestamp, or null when empty/invalid. */
export function fromDateTimeLocalValue(value: string): string | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** Start of the visible chart range, or null for "all". */
export function rangeStartMs(range: WeightRange, now: Date = new Date()): number | null {
  if (range === 'all') return null;
  const start = new Date(now);
  start.setMonth(start.getMonth() - RANGE_MONTHS[range]);
  return start.getTime();
}

export interface WeightChartPoint {
  clientEntryId: string;
  t: number;
  /** Weigh-in in the display unit. */
  weight: number;
  /** Trailing 7-day average in the display unit. */
  avg: number;
}

/**
 * Chart points for a range. The moving average is computed over the full history, so the trend
 * at the start of the range still accounts for the weigh-ins just before it.
 */
export function buildWeightChart(
  entries: readonly BodyWeightEntryDto[],
  range: WeightRange,
  unit: WeightUnit,
  now: Date = new Date(),
): WeightChartPoint[] {
  const from = rangeStartMs(range, now);
  return movingAverageWeights(entries, 7)
    .map(({ entry, averageKg }) => ({
      clientEntryId: entry.clientEntryId,
      t: Date.parse(entry.measuredAt),
      weight: toDisplayWeight(entry.weightKg, unit),
      avg: toDisplayWeight(averageKg, unit),
    }))
    .filter((p) => from === null || p.t >= from);
}

/** Recent trend for compact sparklines: the last `days` days, or the last few weigh-ins. */
export function sparklinePoints(
  entries: readonly BodyWeightEntryDto[],
  unit: WeightUnit,
  now: Date = new Date(),
  days = 30,
): WeightChartPoint[] {
  const all = buildWeightChart(entries, 'all', unit, now);
  const recent = all.filter((p) => p.t >= now.getTime() - days * DAY_MS);
  return recent.length >= 2 ? recent : all.slice(-8);
}

/** Newest first, for lists. */
export function newestFirst<T extends BodyWeightEntryDto>(entries: readonly T[]): T[] {
  return sortWeighIns(entries).reverse();
}

/** Whole days between the weigh-in and now (0 = today), using local calendar days. */
export function calendarDaysAgo(iso: string, now: Date = new Date()): number {
  const d = new Date(iso);
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(0, Math.round((b - a) / DAY_MS));
}
