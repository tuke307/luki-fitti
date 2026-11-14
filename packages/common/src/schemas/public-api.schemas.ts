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

export interface PublicMeGoalsDto {
  weeklyGoalSessions: number;
  dailyKcalGoal: number | null;
  proteinGoalG: number | null;
  carbsGoalG: number | null;
  fatGoalG: number | null;
  bodyWeightKg: number | null;
  heightCm: number | null;
  bodyGoal: BodyGoal | null;
  trainingGoal: TrainingGoal | null;
}

/** Own profile. Never includes the email address. */
export interface PublicMeDto {
  id: string;
  name: string | null;
  handle: string | null;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  goals: PublicMeGoalsDto;
}

// ── Sessions (read:sessions) ──

export interface PublicSessionSetDto {
  setNumber: number;
  setType: SetType;
  /** Always kg (converted when the set was logged in lbs). */
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  rpe: number | null;
  completed: boolean;
  completedAt: string | null;
  isPersonalRecord: boolean;
  notes: string | null;
  avgHeartRateBpm: number | null;
  peakHeartRateBpm: number | null;
  restEndHeartRateBpm: number | null;
}

export interface PublicSessionExerciseDto {
  id: string;
  exerciseId: string | null;
  exerciseName: string;
  primaryMuscle: MuscleGroup;
  exerciseType: ExerciseType;
  origin: SessionExerciseOrigin;
  status: SessionExerciseStatus;
  orderIndex: number;
  plannedSets: number;
  plannedWarmupSets: number;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  /** Always kg. */
  targetWeightKg: number | null;
  targetDurationSeconds: number | null;
  restSeconds: number;
  notes: string | null;
  sets: PublicSessionSetDto[];
}

export interface PublicSessionDto {
  id: string;
  templateId: string | null;
  stretchingRoutineId: string | null;
  sessionType: SessionType;
  workoutName: string;
  status: SessionStatus;
  startedAt: string;
  pausedAt: string | null;
  completedAt: string | null;
  activeDurationSeconds: number;
  totalVolumeKg: number;
  totalSetsCompleted: number;
  totalRepsCompleted: number;
  totalStretchSeconds: number;
  notes: string | null;
  sourceDevice: SessionSourceDevice;
  activeCaloriesKcal: number | null;
  totalCaloriesKcal: number | null;
  estimatedCaloriesKcal: number | null;
  avgHeartRateBpm: number | null;
  maxHeartRateBpm: number | null;
  minHeartRateBpm: number | null;
  createdAt: string;
  updatedAt: string;
  exercises: PublicSessionExerciseDto[];
}

/** Summary row for `GET /v1/sessions` — `GET /v1/sessions/:id` adds `exercises`. */
export type PublicSessionListItemDto = Omit<PublicSessionDto, 'exercises'>;

export interface PublicPersonalRecordDto {
  exerciseId: string;
  exerciseName: string;
  primaryMuscle: MuscleGroup;
  maxWeightKg: number;
  repsAtMaxWeight: number;
  estimatedOneRepMaxKg: number;
  bestVolumeSetKg: number;
  achievedAt: string;
}

// ── Workouts (read:workouts) ──

export interface PublicWorkoutTemplateExerciseDto {
  exerciseId: string;
  exerciseName: string;
  orderIndex: number;
  plannedSets: number;
  warmupSets: number;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  /** Always kg. */
  targetWeightKg: number | null;
  restSeconds: number;
  targetDurationSeconds: number | null;
  targetDistanceMeters: number | null;
  notes: string | null;
}

export interface PublicWorkoutTemplateDto {
  id: string;
  folderId: string | null;
  name: string;
  description: string | null;
  estimatedDurationMinutes: number | null;
  sortOrder: number;
  trainingGoal: TrainingGoal | null;
  exercises: PublicWorkoutTemplateExerciseDto[];
  createdAt: string;
  updatedAt: string;
}

export interface PublicWorkoutFolderDto {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicStretchingRoutineExerciseDto {
  exerciseId: string;
  exerciseName: string;
  orderIndex: number;
  sets: number;
  durationSeconds: number | null;
  reps: number | null;
  transitionSeconds: number;
  notes: string | null;
}

export interface PublicStretchingRoutineDto {
  id: string;
  name: string;
  description: string | null;
  targetArea: string;
  estimatedDurationSeconds: number;
  exercises: PublicStretchingRoutineExerciseDto[];
  createdAt: string;
  updatedAt: string;
}

export interface PublicExerciseDto {
  id: string;
  name: string;
  description: string;
  instructions: string[];
  category: ExerciseCategory;
  exerciseType: ExerciseType;
  primaryMuscleGroup: MuscleGroup;
  muscleGroups: MuscleGroup[];
  equipment: EquipmentType;
  tags: string[];
  /** true for user-created exercises, false for the system catalog. */
  custom: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Nutrition (read:nutrition) — photos are excluded in v1 ──

export interface PublicMealItemDto {
  name: string;
  grams: number | null;
  amountUnit: MealAmountUnit;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
  sugarG: number | null;
}

export interface PublicMealEntryDto {
  id: string;
  eatenAt: string;
  mealType: MealType;
  label: string | null;
  notes: string | null;
  items: PublicMealItemDto[];
  createdAt: string;
  updatedAt: string;
}

// ── Body (read:body) — progress photos are excluded in v1 ──

export interface PublicBodyWeightEntryDto {
  id: string;
  measuredAt: string;
  weightKg: number;
  source: BodyWeightSource;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicProgressCheckInDto {
  id: string;
  takenAt: string;
  note: string | null;
  /** Photo metadata only — never storage keys or URLs. */
  photos: Array<{
    pose: ProgressPose;
    kind: ProgressPhotoKind;
    width: number | null;
    height: number | null;
  }>;
  createdAt: string;
  updatedAt: string;
}

// ── Activity (read:activity) ──

export interface PublicDailyEnergyDto {
  /** Device-local calendar day, `YYYY-MM-DD`. */
  day: string;
  activeKcal: number;
}

export interface PublicActivityWorkoutDto {
  id: string;
  activityType: string;
  sourceName: string;
  /** True when LukiFitti itself wrote the workout to Apple Health. */
  isOwn: boolean;
  startedAt: string;
  endedAt: string;
  activeKcal: number | null;
  distanceMeters: number | null;
}
