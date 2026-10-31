import { z } from 'zod';
import { FoodItemSource, MealAmountUnit, MealType } from '../enums';

// ─────────────────────────────────────────────────────────────────────────────
// Nutrition: meal entries, items, summaries
// ─────────────────────────────────────────────────────────────────────────────

const isoDateTime = z.iso.datetime({ offset: true });
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

/** IANA time zone used to bucket entries into the user's local days. */
export const TimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Unknown time zone');

export const MealItemInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  /** Amount in `amountUnit` (g or ml). */
  grams: z.number().min(0).max(5000).nullable().optional(),
  amountUnit: z.enum(MealAmountUnit).default(MealAmountUnit.G),
  kcal: z.number().min(0).max(10000).default(0),
  proteinG: z.number().min(0).max(1000).default(0),
  carbsG: z.number().min(0).max(1000).default(0),
  fatG: z.number().min(0).max(1000).default(0),
  fiberG: z.number().min(0).max(500).nullable().optional(),
  sugarG: z.number().min(0).max(1000).nullable().optional(),
  source: z.enum(FoodItemSource).default(FoodItemSource.MANUAL),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

export const UpsertMealEntrySchema = z.object({
  clientEntryId: z.string().min(8).max(64),
  eatenAt: isoDateTime,
  mealType: z.enum(MealType).default(MealType.OTHER),
  label: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  items: z.array(MealItemInputSchema).max(50).default([]),
});

export const MealEntryRangeQuerySchema = z.object({
  from: isoDateTime,
  to: isoDateTime,
});

export const NutritionSummaryQuerySchema = z.object({
  from: localDate,
  to: localDate,
  tz: TimeZoneSchema.default('UTC'),
});

export const NUTRITION_HISTORY_QUERY_MAX_LENGTH = 80;

export const NutritionHistoryQuerySchema = z.object({
  q: z.string().trim().max(NUTRITION_HISTORY_QUERY_MAX_LENGTH).optional(),
});

export type MealItemInputDto = z.infer<typeof MealItemInputSchema>;
export type NutritionHistoryQueryDto = z.infer<typeof NutritionHistoryQuerySchema>;
export type UpsertMealEntryDto = z.infer<typeof UpsertMealEntrySchema>;
export type MealEntryRangeQueryDto = z.infer<typeof MealEntryRangeQuerySchema>;
export type NutritionSummaryQueryDto = z.infer<typeof NutritionSummaryQuerySchema>;

export interface MealItemDto {
  id: string;
  orderIndex: number;
  name: string;
  /** Amount in `amountUnit` (g or ml). */
  grams: number | null;
  amountUnit: MealAmountUnit;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
  sugarG: number | null;
  source: FoodItemSource;
  confidence: number | null;
}

export interface MealPhotoDto {
  id: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  createdAt: string;
  /** Same-origin, authenticated path (`/api/nutrition/photos/:id`); only the owner can load it. */
  url: string | null;
}

export interface MealEntryDto {
  id: string;
  clientEntryId: string;
  eatenAt: string;
  mealType: MealType;
  label: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: MealItemDto[];
  photos: MealPhotoDto[];
  totals: NutritionTotalsDto;
}

export interface NutritionTotalsDto {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface NutritionGoalsDto {
  dailyKcalGoal: number | null;
  proteinGoalG: number | null;
  carbsGoalG: number | null;
  fatGoalG: number | null;
}

export interface NutritionDaySummaryDto extends NutritionTotalsDto {
  /** Local date (YYYY-MM-DD) in the requested time zone. */
  date: string;
  entries: number;
  burnedKcal: number;
  workouts: number;
}

export interface NutritionSummaryDto {
  from: string;
  to: string;
  tz: string;
  goals: NutritionGoalsDto;
  days: NutritionDaySummaryDto[];
  averages: NutritionTotalsDto & { burnedKcal: number };
  /** Days in the range with at least one entry (averages are over these days). */
  loggedDays: number;
  byMealType: Array<{ mealType: MealType; kcal: number; entries: number }>;
}

/** A food from the user's history; `item` is the most recently logged version. */
export interface HistoryItemPickDto {
  item: MealItemDto;
  timesLogged: number;
  lastLoggedAt: string;
}

/** A combination of foods logged together before; `items` are from the latest time. */
export interface HistoryEntryPickDto {
  /** Stable key of the food combination (normalized, sorted item names). */
  key: string;
  label: string | null;
  mealType: MealType;
  items: MealItemDto[];
  totals: NutritionTotalsDto;
  timesLogged: number;
  lastLoggedAt: string;
}

/** `GET /nutrition/history-picks`: ranked by frequency weighted to recent weeks. */
export interface NutritionHistoryPicksDto {
  entries: HistoryEntryPickDto[];
  items: HistoryItemPickDto[];
}
