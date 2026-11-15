import { z } from 'zod';
import {
  BodyWeightSource,
  EquipmentType,
  ExerciseCategory,
  ExerciseType,
  MealAmountUnit,
  MealType,
  MuscleGroup,
  ProgressPhotoKind,
  ProgressPose,
  SessionExerciseOrigin,
  SessionExerciseStatus,
  SessionType,
  SessionStatus,
  SessionSourceDevice,
  SetType,
  TrainingGoal,
  WeightUnit,
  DistanceUnit,
  BodyGoal,
} from '../enums';

// ─────────────────────────────────────────────────────────────────────────────
// Public API v1 (/api/v1) — stable contract for personal API keys.
// Rules: ISO 8601 date strings, weights in kg / distances in metres with
// unit-explicit field names, no internal fields (version, lastWriterDeviceId,
// client ids, userId), no email, no photos.
// ─────────────────────────────────────────────────────────────────────────────

/** Cursor-paginated list envelope returned by every v1 list endpoint. */
export interface PublicListDto<T> {
  data: T[];
  nextCursor: string | null;
}

const isoDateOrDateTime = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Expected an ISO date or datetime');

/** Shared list query: `limit` (1–200, default 50), `cursor`, `updatedSince`. */
export const PublicListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  updatedSince: isoDateOrDateTime.optional(),
});
export type PublicListQueryDto = z.infer<typeof PublicListQuerySchema>;

/**
 * Lists that also filter by an event date range (`from`/`to`, inclusive).
 * A date-only value is a whole UTC calendar day: `from` covers from 00:00Z
 * that day, `to` covers until 23:59:59.999Z (i.e. `to=2026-11-14` includes
 * the 14th). Full datetimes are compared exactly.
 */
export const PublicRangeQuerySchema = PublicListQuerySchema.extend({
  from: isoDateOrDateTime.optional(),
  to: isoDateOrDateTime.optional(),
});
export type PublicRangeQueryDto = z.infer<typeof PublicRangeQuerySchema>;

/**
 * `GET /v1/sessions`: `include=exercises` returns full session rows (exercises
 * and sets) instead of summary rows. It's capped at 50 rows per page because
 * a page of full sessions is much heavier — this exists so tools can fetch
 * sets without one call per session.
 */
export const PublicSessionListQuerySchema = PublicRangeQuerySchema.extend({
  include: z.enum(['exercises']).optional(),
}).refine((q) => q.include !== 'exercises' || q.limit <= 50, {
  message: 'limit must be 50 or less when include=exercises',
  path: ['limit'],
});
export type PublicSessionListQueryDto = z.infer<typeof PublicSessionListQuerySchema>;

/** `GET /v1/key`: introspection for the presented key (MCP server auth). */
export interface PublicKeyDto {
  id: string;
  scopes: string[];
  expiresAt: string | null;
}

/** `/v1/exercises`: `custom=true` lists only the user's custom exercises. */
export const PublicExerciseQuerySchema = PublicListQuerySchema.extend({
  custom: z.enum(['true', 'false']).optional(),
});
export type PublicExerciseQueryDto = z.infer<typeof PublicExerciseQuerySchema>;

// ── GET /v1/me (read:profile) ──

export const PublicMeGoalsSchema = z.object({
  weeklyGoalSessions: z.number().int(),
  dailyKcalGoal: z.number().nullable(),
  proteinGoalG: z.number().nullable(),
  carbsGoalG: z.number().nullable(),
  fatGoalG: z.number().nullable(),
  bodyWeightKg: z.number().nullable(),
  heightCm: z.number().nullable(),
  bodyGoal: z.enum(BodyGoal).nullable(),
  trainingGoal: z.enum(TrainingGoal).nullable(),
});
export type PublicMeGoalsDto = z.infer<typeof PublicMeGoalsSchema>;

/** Own profile. Never includes the email address. */
export const PublicMeSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  username: z.string().nullable(),
  weightUnit: z.enum(WeightUnit),
  distanceUnit: z.enum(DistanceUnit),
  goals: PublicMeGoalsSchema,
});
export type PublicMeDto = z.infer<typeof PublicMeSchema>;

// ── Sessions (read:sessions) ──

export const PublicSessionSetSchema = z.object({
  setNumber: z.number().int(),
  setType: z.enum(SetType),
  /** Always kg (converted when the set was logged in lbs). */
  weightKg: z.number().nullable(),
  reps: z.number().nullable(),
  durationSeconds: z.number().nullable(),
  distanceMeters: z.number().nullable(),
  rpe: z.number().nullable(),
  completed: z.boolean(),
  completedAt: z.string().nullable(),
  isPersonalRecord: z.boolean(),
  notes: z.string().nullable(),
  avgHeartRateBpm: z.number().nullable(),
  peakHeartRateBpm: z.number().nullable(),
  restEndHeartRateBpm: z.number().nullable(),
});
export type PublicSessionSetDto = z.infer<typeof PublicSessionSetSchema>;

export const PublicSessionExerciseSchema = z.object({
  id: z.string(),
  exerciseId: z.string().nullable(),
  exerciseName: z.string(),
  primaryMuscle: z.enum(MuscleGroup),
  exerciseType: z.enum(ExerciseType),
  origin: z.enum(SessionExerciseOrigin),
  status: z.enum(SessionExerciseStatus),
  orderIndex: z.number().int(),
  plannedSets: z.number().int(),
  plannedWarmupSets: z.number().int(),
  targetRepsMin: z.number().nullable(),
  targetRepsMax: z.number().nullable(),
  /** Always kg. */
  targetWeightKg: z.number().nullable(),
  targetDurationSeconds: z.number().nullable(),
  restSeconds: z.number().int(),
  notes: z.string().nullable(),
  sets: z.array(PublicSessionSetSchema),
});
export type PublicSessionExerciseDto = z.infer<typeof PublicSessionExerciseSchema>;

export const PublicSessionSchema = z.object({
  id: z.string(),
  templateId: z.string().nullable(),
  stretchingRoutineId: z.string().nullable(),
  sessionType: z.enum(SessionType),
  workoutName: z.string(),
  status: z.enum(SessionStatus),
  startedAt: z.string(),
  pausedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  activeDurationSeconds: z.number(),
  totalVolumeKg: z.number(),
  totalSetsCompleted: z.number().int(),
  totalRepsCompleted: z.number().int(),
  totalStretchSeconds: z.number().int(),
  notes: z.string().nullable(),
  sourceDevice: z.enum(SessionSourceDevice),
  activeCaloriesKcal: z.number().nullable(),
  totalCaloriesKcal: z.number().nullable(),
  estimatedCaloriesKcal: z.number().nullable(),
  avgHeartRateBpm: z.number().nullable(),
  maxHeartRateBpm: z.number().nullable(),
  minHeartRateBpm: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  exercises: z.array(PublicSessionExerciseSchema),
});
export type PublicSessionDto = z.infer<typeof PublicSessionSchema>;

/** Summary row for `GET /v1/sessions` — `GET /v1/sessions/:id` adds `exercises`. */
export const PublicSessionListItemSchema = PublicSessionSchema.omit({ exercises: true });
export type PublicSessionListItemDto = z.infer<typeof PublicSessionListItemSchema>;

export const PublicPersonalRecordSchema = z.object({
  exerciseId: z.string(),
  exerciseName: z.string(),
  primaryMuscle: z.enum(MuscleGroup),
  maxWeightKg: z.number(),
  repsAtMaxWeight: z.number().int(),
  estimatedOneRepMaxKg: z.number(),
  bestVolumeSetKg: z.number(),
  achievedAt: z.string(),
});
export type PublicPersonalRecordDto = z.infer<typeof PublicPersonalRecordSchema>;

// ── Workouts (read:workouts) ──

export const PublicWorkoutTemplateExerciseSchema = z.object({
  exerciseId: z.string(),
  exerciseName: z.string(),
  orderIndex: z.number().int(),
  plannedSets: z.number().int(),
  warmupSets: z.number().int(),
  targetRepsMin: z.number().nullable(),
  targetRepsMax: z.number().nullable(),
  /** Always kg. */
  targetWeightKg: z.number().nullable(),
  restSeconds: z.number().int(),
  targetDurationSeconds: z.number().nullable(),
  targetDistanceMeters: z.number().nullable(),
  notes: z.string().nullable(),
});
export type PublicWorkoutTemplateExerciseDto = z.infer<typeof PublicWorkoutTemplateExerciseSchema>;

export const PublicWorkoutTemplateSchema = z.object({
  id: z.string(),
  folderId: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  estimatedDurationMinutes: z.number().nullable(),
  sortOrder: z.number().int(),
  trainingGoal: z.enum(TrainingGoal).nullable(),
  exercises: z.array(PublicWorkoutTemplateExerciseSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublicWorkoutTemplateDto = z.infer<typeof PublicWorkoutTemplateSchema>;

export const PublicWorkoutFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublicWorkoutFolderDto = z.infer<typeof PublicWorkoutFolderSchema>;

export const PublicStretchingRoutineExerciseSchema = z.object({
  exerciseId: z.string(),
  exerciseName: z.string(),
  orderIndex: z.number().int(),
  sets: z.number().int(),
  durationSeconds: z.number().nullable(),
  reps: z.number().nullable(),
  transitionSeconds: z.number().int(),
  notes: z.string().nullable(),
});
export type PublicStretchingRoutineExerciseDto = z.infer<
  typeof PublicStretchingRoutineExerciseSchema
>;

export const PublicStretchingRoutineSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  targetArea: z.string(),
  estimatedDurationSeconds: z.number().int(),
  exercises: z.array(PublicStretchingRoutineExerciseSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublicStretchingRoutineDto = z.infer<typeof PublicStretchingRoutineSchema>;

export const PublicExerciseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  instructions: z.array(z.string()),
  category: z.enum(ExerciseCategory),
  exerciseType: z.enum(ExerciseType),
  primaryMuscleGroup: z.enum(MuscleGroup),
  muscleGroups: z.array(z.enum(MuscleGroup)),
  equipment: z.enum(EquipmentType),
  tags: z.array(z.string()),
  /** true for user-created exercises, false for the system catalog. */
  custom: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublicExerciseDto = z.infer<typeof PublicExerciseSchema>;

// ── Nutrition (read:nutrition) — photos are excluded in v1 ──

export const PublicMealItemSchema = z.object({
  name: z.string(),
  grams: z.number().nullable(),
  amountUnit: z.enum(MealAmountUnit),
  kcal: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  fiberG: z.number().nullable(),
  sugarG: z.number().nullable(),
});
export type PublicMealItemDto = z.infer<typeof PublicMealItemSchema>;

export const PublicMealEntrySchema = z.object({
  id: z.string(),
  eatenAt: z.string(),
  mealType: z.enum(MealType),
  label: z.string().nullable(),
  notes: z.string().nullable(),
  items: z.array(PublicMealItemSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublicMealEntryDto = z.infer<typeof PublicMealEntrySchema>;

// ── Body (read:body) — progress photos are excluded in v1 ──

export const PublicBodyWeightEntrySchema = z.object({
  id: z.string(),
  measuredAt: z.string(),
  weightKg: z.number(),
  source: z.enum(BodyWeightSource),
  note: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublicBodyWeightEntryDto = z.infer<typeof PublicBodyWeightEntrySchema>;

export const PublicProgressCheckInSchema = z.object({
  id: z.string(),
  takenAt: z.string(),
  note: z.string().nullable(),
  /** Photo metadata only — never storage keys or URLs. */
  photos: z.array(
    z.object({
      pose: z.enum(ProgressPose),
      kind: z.enum(ProgressPhotoKind),
      width: z.number().nullable(),
      height: z.number().nullable(),
    }),
  ),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublicProgressCheckInDto = z.infer<typeof PublicProgressCheckInSchema>;

// ── Activity (read:activity) ──

export const PublicDailyEnergySchema = z.object({
  /** Device-local calendar day, `YYYY-MM-DD`. */
  day: z.string(),
  activeKcal: z.number(),
});
export type PublicDailyEnergyDto = z.infer<typeof PublicDailyEnergySchema>;

export const PublicActivityWorkoutSchema = z.object({
  id: z.string(),
  activityType: z.string(),
  sourceName: z.string(),
  /** True when LukiFitti itself wrote the workout to Apple Health. */
  isOwn: z.boolean(),
  startedAt: z.string(),
  endedAt: z.string(),
  activeKcal: z.number().nullable(),
  distanceMeters: z.number().nullable(),
});
export type PublicActivityWorkoutDto = z.infer<typeof PublicActivityWorkoutSchema>;

/** Builds the `{ data, nextCursor }` list envelope schema for an item schema. */
export const publicListSchema = <S extends z.ZodType>(item: S) =>
  z.object({ data: z.array(item), nextCursor: z.string().nullable() });

/** Shared v1 error body (`{ error, message, required?, retryAfterSeconds? }`). */
export const PublicApiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  required: z.string().optional(),
  retryAfterSeconds: z.number().optional(),
});
export type PublicApiErrorDto = z.infer<typeof PublicApiErrorSchema>;
