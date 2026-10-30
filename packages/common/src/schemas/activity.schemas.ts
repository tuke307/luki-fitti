import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Activity: Apple Health daily active energy and workouts (imported from iOS)
// ─────────────────────────────────────────────────────────────────────────────

export const HEALTH_ACTIVITY_DAYS_MAX = 400;
export const HEALTH_ACTIVITY_WORKOUTS_MAX = 2000;
export const HEALTH_ACTIVITY_MAX_KCAL = 20000;
export const HEALTH_ACTIVITY_MAX_DISTANCE_M = 1_000_000;
export const HEALTH_WORKOUT_MAX_DURATION_MS = 48 * 60 * 60 * 1000;
/** Longest `GET /activity` window. */
export const HEALTH_ACTIVITY_RANGE_MAX_DAYS = 400;

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDateTime = z.iso.datetime({ offset: true });

/** True when `value` (YYYY-MM-DD) is a real calendar date (rejects e.g. 2026-02-30). */
const isCalendarDay = (value: string): boolean => {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

/** Device-local calendar day, "YYYY-MM-DD". */
export const HealthDayKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine(isCalendarDay, 'Invalid calendar date');

/** HealthKit UUID, normalised to lowercase so dedupe is case-insensitive. */
const healthKitUuid = z.uuid().transform((value) => value.toLowerCase());

const kcal = z.number().finite().min(0).max(HEALTH_ACTIVITY_MAX_KCAL);

export const HealthDailyEnergyInputSchema = z.object({
  day: HealthDayKeySchema,
  activeKcal: kcal,
});

export const HealthWorkoutInputSchema = z
  .object({
    healthKitUuid,
    activityType: z.string().trim().min(1).max(64),
    sourceName: z.string().trim().min(1).max(120),
    isOwn: z.boolean(),
    startedAt: isoDateTime,
    endedAt: isoDateTime,
    // Missing is treated as null: Swift's synthesized Codable omits nil optionals.
    activeKcal: kcal.nullable().default(null),
    distanceMeters: z
      .number()
      .finite()
      .min(0)
      .max(HEALTH_ACTIVITY_MAX_DISTANCE_M)
      .nullable()
      .default(null),
  })
  .refine((w) => Date.parse(w.endedAt) >= Date.parse(w.startedAt), {
    message: 'endedAt must not be before startedAt',
    path: ['endedAt'],
  })
  .refine(
    (w) => Date.parse(w.endedAt) - Date.parse(w.startedAt) <= HEALTH_WORKOUT_MAX_DURATION_MS,
    { message: 'Workout cannot be longer than 48 hours', path: ['endedAt'] },
  );

export const ImportHealthActivitySchema = z.object({
  days: z.array(HealthDailyEnergyInputSchema).max(HEALTH_ACTIVITY_DAYS_MAX),
  workouts: z.array(HealthWorkoutInputSchema).max(HEALTH_ACTIVITY_WORKOUTS_MAX),
  /** HealthKit workout UUIDs deleted in Apple Health since the last sync. */
  deletedWorkoutUuids: z.array(healthKitUuid).max(HEALTH_ACTIVITY_WORKOUTS_MAX),
});

export const HealthActivityRangeQuerySchema = z
  .object({
    from: isoDateTime,
    to: isoDateTime,
  })
  .refine((q) => Date.parse(q.from) <= Date.parse(q.to), {
    message: 'from must not be after to',
    path: ['to'],
  })
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= HEALTH_ACTIVITY_RANGE_MAX_DAYS * DAY_MS, {
    message: `Range cannot exceed ${HEALTH_ACTIVITY_RANGE_MAX_DAYS} days`,
    path: ['to'],
  });

export type HealthDailyEnergyInputDto = z.infer<typeof HealthDailyEnergyInputSchema>;
export type HealthWorkoutInputDto = z.infer<typeof HealthWorkoutInputSchema>;
export type ImportHealthActivityDto = z.infer<typeof ImportHealthActivitySchema>;
export type HealthActivityRangeQueryDto = z.infer<typeof HealthActivityRangeQuerySchema>;

export interface HealthDailyEnergyDto {
  /** Device-local calendar day, "YYYY-MM-DD". */
  day: string;
  activeKcal: number;
  updatedAt: string;
}

export interface HealthWorkoutDto {
  id: string;
  healthKitUuid: string;
  /** camelCase HKWorkoutActivityType name, e.g. "running". */
  activityType: string;
  sourceName: string;
  /** Written to Apple Health by LukiFitti itself (mirrors a LukiFitti session). */
  isOwn: boolean;
  startedAt: string;
  endedAt: string;
  activeKcal: number | null;
  distanceMeters: number | null;
}

export interface HealthActivityDto {
  days: HealthDailyEnergyDto[];
  workouts: HealthWorkoutDto[];
}

export interface ImportHealthActivityResultDto {
  daysUpserted: number;
  workoutsUpserted: number;
  workoutsDeleted: number;
}
