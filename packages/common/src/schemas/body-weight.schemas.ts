import { z } from 'zod';
import { BodyWeightSource } from '../enums';

// ─────────────────────────────────────────────────────────────────────────────
// Body weight: weigh-in history
// ─────────────────────────────────────────────────────────────────────────────

/** Allowed clock skew for "now" entries coming from devices. */
export const BODY_WEIGHT_FUTURE_SKEW_MS = 5 * 60 * 1000;
export const BODY_WEIGHT_MIN_KG = 25;
export const BODY_WEIGHT_MAX_KG = 400;
export const BODY_WEIGHT_IMPORT_MAX = 500;

const isoDateTime = z.iso.datetime({ offset: true });

const measuredAt = isoDateTime.refine(
  (value) => Date.parse(value) <= Date.now() + BODY_WEIGHT_FUTURE_SKEW_MS,
  'Weigh-in cannot be in the future',
);

const weightKg = z.number().min(BODY_WEIGHT_MIN_KG).max(BODY_WEIGHT_MAX_KG);

export const UpsertBodyWeightEntrySchema = z.object({
  clientEntryId: z.string().min(8).max(64),
  measuredAt,
  weightKg,
  note: z.string().trim().max(280).nullable().optional(),
});

export const BodyWeightRangeQuerySchema = z.object({
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
});

export const BodyWeightHealthKitSampleSchema = z.object({
  healthKitUuid: z.string().min(8).max(64),
  measuredAt,
  weightKg,
});

export const ImportBodyWeightSchema = z.object({
  samples: z.array(BodyWeightHealthKitSampleSchema).max(BODY_WEIGHT_IMPORT_MAX).default([]),
  /** HealthKit sample UUIDs deleted in Apple Health since the last sync. */
  deletedHealthKitUuids: z.array(z.string().min(8).max(64)).max(BODY_WEIGHT_IMPORT_MAX).default([]),
});

export type UpsertBodyWeightEntryDto = z.infer<typeof UpsertBodyWeightEntrySchema>;
export type BodyWeightRangeQueryDto = z.infer<typeof BodyWeightRangeQuerySchema>;
export type BodyWeightHealthKitSampleDto = z.infer<typeof BodyWeightHealthKitSampleSchema>;
export type ImportBodyWeightDto = z.infer<typeof ImportBodyWeightSchema>;

export interface BodyWeightEntryDto {
  id: string;
  clientEntryId: string;
  measuredAt: string;
  weightKg: number;
  source: BodyWeightSource;
  healthKitUuid: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImportBodyWeightResultDto {
  imported: number;
  deleted: number;
  entries: BodyWeightEntryDto[];
}
