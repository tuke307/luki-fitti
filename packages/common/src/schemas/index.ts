import { z } from 'zod';
import { DEFAULT_FOLDER_COLOR } from '../utils/folder-color.util';
import {
  AdminPermission,
  BIOLOGICAL_SEX_VALUES,
  DistanceUnit,
  FeatureGrant,
  EmailStatus,
  EmailTemplateType,
  EquipmentType,
  ExerciseCategory,
  ExerciseMechanic,
  ExerciseType,
  LANGUAGE_PREFERENCES,
  Laterality,
  MovementPattern,
  MuscleGroup,
  SessionExerciseOrigin,
  SessionExerciseStatus,
  SessionSourceDevice,
  SessionStatus,
  SessionType,
  SetType,
  TargetRegion,
  WeightUnit,
} from '../enums';

export const PASSWORD_RULES = {
  minLength: 8,
  description: 'At least 8 characters, containing at least one letter and one number.',
};

export const PasswordSchema = z
  .string()
  .min(PASSWORD_RULES.minLength, 'Password must be at least 8 characters')
  .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

// ─────────────────────────────────────────────────────────────────────────────
// Auth & Preferences Schemas
// ─────────────────────────────────────────────────────────────────────────────
export const RegisterSchema = z.object({
  email: z.email('Please enter a valid email address'),
  password: PasswordSchema,
  name: z.string().trim().min(1, 'Name is required').max(80).optional(),
  weightUnit: z.enum(WeightUnit).default(WeightUnit.KG).optional(),
});

export const LoginSchema = z.object({
  email: z.email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: PasswordSchema,
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  });

export const VerifyEmailSchema = z.object({
  token: z.string().trim().min(10, 'Verification token is required'),
});

export const ResendConfirmationSchema = z.object({
  email: z.email('Please enter a valid email address'),
});

export const ForgotPasswordSchema = z.object({
  email: z.email('Please enter a valid email address'),
});

export const ResetPasswordSchema = z.object({
  token: z.string().trim().min(10, 'Password reset token is required'),
  newPassword: PasswordSchema,
});

export const RequestAccountDeletionSchema = z.object({
  password: z.string().min(1, 'Current password is required to request account deletion'),
});

export const ConfirmAccountDeletionSchema = z.object({
  token: z.string().trim().min(10, 'Account deletion token is required'),
});

export const CreateEmailTemplateSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  htmlFile: z.string().min(1),
  type: z.enum(EmailTemplateType),
});

export const UpdateEmailTemplateSchema = CreateEmailTemplateSchema.partial();

export const CreateEmailSchema = z.object({
  recipientEmail: z.email(),
  subject: z.string().min(1),
  content: z.string().min(1),
  status: z.enum(EmailStatus).default(EmailStatus.PENDING),
  scheduledAt: z.string(),
  emailTemplateId: z.number().int(),
  userId: z.string().nullable().optional(),
});

export const UpdateEmailSchema = z.object({
  status: z.enum(EmailStatus).optional(),
  sentAt: z.string().optional(),
  attempts: z.number().int().optional(),
  lastAttemptAt: z.string().optional(),
  errorMessage: z.string().nullable().optional(),
});

export const UpdatePreferencesSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  weightUnit: z.enum(WeightUnit).optional(),
  distanceUnit: z.enum(DistanceUnit).optional(),
  defaultRestSeconds: z.number().int().min(10).max(600).optional(),
  theme: z.enum(['dark', 'light', 'system']).optional(),
  language: z.enum(LANGUAGE_PREFERENCES).optional(),
  restTimerSound: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
  exerciseSuggestionsEnabled: z.boolean().optional(),
  weeklyGoalSessions: z.number().int().min(1).max(14).optional(),
  bodyWeightKg: z.number().min(25).max(400).nullable().optional(),
  heightCm: z.number().min(100).max(250).nullable().optional(),
  birthYear: z.number().int().min(1900).max(2030).nullable().optional(),
  sex: z.enum(BIOLOGICAL_SEX_VALUES).nullable().optional(),
  dailyKcalGoal: z.number().int().min(800).max(10000).nullable().optional(),
  proteinGoalG: z.number().int().min(0).max(600).nullable().optional(),
  carbsGoalG: z.number().int().min(0).max(1500).nullable().optional(),
  fatGoalG: z.number().int().min(0).max(600).nullable().optional(),
  weighInReminderEnabled: z.boolean().optional(),
  weighInReminderWeekday: z.number().int().min(1).max(7).optional(),
  weighInReminderMinutes: z.number().int().min(0).max(1439).optional(),
});

export const UserPreferencesSchema = z.object({
  id: z.string(),
  userId: z.string(),
  weightUnit: z.enum(WeightUnit),
  distanceUnit: z.enum(DistanceUnit),
  defaultRestSeconds: z.number(),
  theme: z.string(),
  language: z.enum(LANGUAGE_PREFERENCES).default('system').optional(),
  restTimerSound: z.boolean(),
  notificationsEnabled: z.boolean().default(true).optional(),
  exerciseSuggestionsEnabled: z.boolean().default(true).optional(),
  weeklyGoalSessions: z.number(),
  bodyWeightKg: z.number().nullable().optional(),
  heightCm: z.number().nullable().optional(),
  birthYear: z.number().nullable().optional(),
  sex: z.enum(BIOLOGICAL_SEX_VALUES).nullable().optional(),
  dailyKcalGoal: z.number().nullable().optional(),
  proteinGoalG: z.number().nullable().optional(),
  carbsGoalG: z.number().nullable().optional(),
  fatGoalG: z.number().nullable().optional(),
  weighInReminderEnabled: z.boolean().default(false).optional(),
  weighInReminderWeekday: z.number().default(2).optional(),
  weighInReminderMinutes: z.number().default(450).optional(),
});

export const UserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  emailVerified: z.boolean().optional(),
  lastLoginAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  preferences: UserPreferencesSchema.nullable().optional(),
  /** Admin portal permissions; empty for regular users. */
  permissions: z.array(z.enum(AdminPermission)).optional(),
  /** Opt-in features this user may use right now (grant AND global switch on). */
  features: z.array(z.enum(FeatureGrant)).optional(),
});

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.string(),
});

export const RefreshTokenBodySchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export const UserPayloadSchema = z.object({
  id: z.string(),
  email: z.string(),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;
export type LoginDto = z.infer<typeof LoginSchema>;
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;
export type VerifyEmailDto = z.infer<typeof VerifyEmailSchema>;
export type ResendConfirmationDto = z.infer<typeof ResendConfirmationSchema>;
export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;
export type RequestAccountDeletionDto = z.infer<typeof RequestAccountDeletionSchema>;
export type ConfirmAccountDeletionDto = z.infer<typeof ConfirmAccountDeletionSchema>;
export type CreateEmailTemplateDto = z.infer<typeof CreateEmailTemplateSchema>;
export type UpdateEmailTemplateDto = z.infer<typeof UpdateEmailTemplateSchema>;
export type CreateEmailDto = z.infer<typeof CreateEmailSchema>;
export type UpdateEmailDto = z.infer<typeof UpdateEmailSchema>;
export type UpdatePreferencesDto = z.infer<typeof UpdatePreferencesSchema>;
export type UserPreferencesDto = z.infer<typeof UserPreferencesSchema>;
export type AuthTokensDto = z.infer<typeof AuthTokensSchema>;
export type RefreshTokenBodyDto = z.infer<typeof RefreshTokenBodySchema>;
export type UserDto = z.infer<typeof UserSchema> & {
  tokens?: AuthTokensDto;
};
export type UserPayloadDto = z.infer<typeof UserPayloadSchema>;

export interface RegisterResponseDto extends UserDto {
  requiresEmailConfirmation?: boolean;
  message?: string;
}

const CoercedExerciseTypeSchema = z.preprocess(
  (val) => (val === 'MOBILITY' ? ExerciseType.STRETCHING : val),
  z.enum(ExerciseType),
);

const CoercedSetTypeSchema = z.preprocess(
  (val) => (val === 'FAILURE' ? SetType.WORKING : val),
  z.enum(SetType),
);

// ─────────────────────────────────────────────────────────────────────────────
// Exercise Library Schemas
// ─────────────────────────────────────────────────────────────────────────────
export const ExerciseQuerySchema = z.object({
  search: z.string().trim().optional(),
  muscleGroup: z.enum(MuscleGroup).optional(),
  exerciseType: CoercedExerciseTypeSchema.optional(),
  equipment: z.enum(EquipmentType).optional(),
  category: z.enum(ExerciseCategory).optional(),
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100).optional(),
});

export const CreateExerciseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(2).max(2000),
  instructions: z.array(z.string().trim().min(1)).default([]),
  category: z.enum(ExerciseCategory).default(ExerciseCategory.COMPOUND),
  exerciseType: CoercedExerciseTypeSchema.default(ExerciseType.STRENGTH),
  primaryMuscleGroup: z.enum(MuscleGroup),
  secondaryMuscleGroups: z.array(z.enum(MuscleGroup)).default([]),
  equipment: z.enum(EquipmentType).default(EquipmentType.BARBELL),
  recommendedDurationSeconds: z.number().int().min(5).max(7200).nullable().optional(),
  tags: z.array(z.string().trim()).default([]),
  alternativeExerciseIds: z.array(z.string()).default([]),
  mediaUrl: z.string().trim().optional(),
  movementPattern: z.enum(MovementPattern).nullable().optional(),
  laterality: z.enum(Laterality).nullable().optional(),
});

export const UpdateExerciseSchema = CreateExerciseSchema.partial();

export type ExerciseQueryDto = z.infer<typeof ExerciseQuerySchema>;
export type CreateExerciseDto = z.infer<typeof CreateExerciseSchema>;
export type UpdateExerciseDto = z.infer<typeof UpdateExerciseSchema>;

export interface ExerciseDto {
  id: string;
  slug: string;
  userId: string | null;
  name: string;
  description: string;
  instructions: string[];
  category: ExerciseCategory;
  exerciseType: ExerciseType;
  primaryMuscleGroup: MuscleGroup;
  secondaryMuscleGroups: MuscleGroup[];
  equipment: EquipmentType;
  recommendedDurationSeconds: number | null;
  tags: string[];
  isSystem: boolean;
  alternativeExerciseIds: string[];
  /** How the exercise moves; `null`/missing when unknown (then it is only found by search). */
  movementPattern?: MovementPattern | null;
  laterality?: Laterality | null;
  mechanic?: ExerciseMechanic | null;
  targetRegions?: TargetRegion[];
  alternatives?: Array<{
    id: string;
    name: string;
    equipment: EquipmentType;
    primaryMuscleGroup: MuscleGroup;
    reason?: string | null;
  }>;
  media?: Array<{
    id: string;
    mediaType: string;
    url: string;
    caption?: string | null;
    attribution?: string | null;
    license?: string | null;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Workout Folders & Workout Templates Schemas
// ─────────────────────────────────────────────────────────────────────────────
export const CreateFolderSchema = z.object({
  name: z.string().trim().min(1, 'Folder name is required').max(80),
  color: z.string().trim().default(DEFAULT_FOLDER_COLOR),
  sortOrder: z.number().int().min(0).default(0).optional(),
});

export const UpdateFolderSchema = CreateFolderSchema.partial();

/** One planned set of a template exercise (type + target values). */
export const TemplateSetSchema = z.object({
  setType: z.enum(SetType).default(SetType.WORKING),
  weight: z.number().min(0).max(1500).nullable().default(null),
  reps: z.number().int().min(0).max(200).nullable().default(null),
  durationSeconds: z.number().int().min(0).max(14400).nullable().default(null),
});

export const TemplateExerciseInputSchema = z.object({
  id: z.string().optional(),
  exerciseId: z.string().min(1, 'Exercise is required'),
  /**
   * Explicit per-set plan. When present it is the source of truth and the summary fields
   * (`plannedSets`, `warmupSets`, `targetWeight`) are derived from it.
   */
  sets: z.array(TemplateSetSchema).max(40).nullable().optional(),
  orderIndex: z.number().int().min(0),
  plannedSets: z.number().int().min(1).max(30).default(3),
  warmupSets: z.number().int().min(0).max(10).default(0),
  targetRepsMin: z.number().int().min(1).max(200).nullable().optional(),
  targetRepsMax: z.number().int().min(1).max(200).nullable().optional(),
  targetWeight: z.number().min(0).max(1500).nullable().optional(),
  weightUnit: z.enum(WeightUnit).default(WeightUnit.KG),
  restSeconds: z.number().int().min(0).max(900).default(90),
  targetDurationSeconds: z.number().int().min(0).max(14400).nullable().optional(),
  targetDistanceMeters: z.number().min(0).max(100000).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  alternativeExerciseIds: z.array(z.string()).default([]),
});

export const CreateTemplateSchema = z.object({
  name: z.string().trim().min(1, 'Workout name is required').max(100),
  description: z.string().trim().max(500).nullable().optional(),
  folderId: z.string().nullable().optional(),
  estimatedDurationMinutes: z.number().int().min(5).max(360).default(60).optional(),
  sortOrder: z.number().int().min(0).default(0).optional(),
  exercises: z.array(TemplateExerciseInputSchema).default([]),
});

export const UpdateTemplateSchema = CreateTemplateSchema.partial();

export const MoveTemplateSchema = z.object({
  folderId: z.string().nullable(),
});

export type CreateFolderDto = z.infer<typeof CreateFolderSchema>;
export type UpdateFolderDto = z.infer<typeof UpdateFolderSchema>;
export type TemplateSetDto = z.infer<typeof TemplateSetSchema>;
export type TemplateExerciseInputDto = z.infer<typeof TemplateExerciseInputSchema>;
export type CreateTemplateDto = z.infer<typeof CreateTemplateSchema>;
export type UpdateTemplateDto = z.infer<typeof UpdateTemplateSchema>;
export type MoveTemplateDto = z.infer<typeof MoveTemplateSchema>;

export interface WorkoutTemplateExerciseDto {
  id: string;
  templateId: string;
  exerciseId: string;
  /** Explicit per-set plan; `null` for templates that only have summary values. */
  sets?: TemplateSetDto[] | null;
  orderIndex: number;
  plannedSets: number;
  warmupSets: number;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetWeight: number | null;
  weightUnit: WeightUnit;
  restSeconds: number;
  targetDurationSeconds: number | null;
  targetDistanceMeters: number | null;
  notes: string | null;
  alternativeExerciseIds: string[];
  exercise?: ExerciseDto;
}

/**
 * `systemKey` links a user's copy of starter content to its catalog definition. While set, the
 * text is resolved from the catalog in the requested locale; editing the copy clears it.
 */
export interface WorkoutTemplateDto {
  id: string;
  systemKey?: string | null;
  userId: string;
  folderId: string | null;
  name: string;
  description: string | null;
  estimatedDurationMinutes: number | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  exercises: WorkoutTemplateExerciseDto[];
}

export interface WorkoutFolderDto {
  id: string;
  systemKey?: string | null;
  userId: string;
  name: string;
  color: string;
  sortOrder: number;
  templates: WorkoutTemplateDto[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Stretching Routine Schemas
// ─────────────────────────────────────────────────────────────────────────────
export const StretchingRoutineExerciseInputSchema = z.object({
  exerciseId: z.string().min(1),
  orderIndex: z.number().int().min(0),
  sets: z.number().int().min(1).max(10).default(1),
  durationSeconds: z.number().int().min(5).max(1800).nullable().optional(),
  reps: z.number().int().min(1).max(100).nullable().optional(),
  transitionSeconds: z.number().int().min(0).max(120).default(15),
  notes: z.string().max(500).nullable().optional(),
});

export const CreateStretchingRoutineSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  targetArea: z.string().trim().min(1).max(80).default('Full Body'),
  estimatedDurationSeconds: z.number().int().min(30).max(7200).default(600),
  exercises: z.array(StretchingRoutineExerciseInputSchema).default([]),
});

export const UpdateStretchingRoutineSchema = CreateStretchingRoutineSchema.partial();

export type StretchingRoutineExerciseInputDto = z.infer<
  typeof StretchingRoutineExerciseInputSchema
>;
export type CreateStretchingRoutineDto = z.infer<typeof CreateStretchingRoutineSchema>;
export type UpdateStretchingRoutineDto = z.infer<typeof UpdateStretchingRoutineSchema>;

export interface StretchingRoutineExerciseDto {
  id: string;
  routineId: string;
  exerciseId: string;
  orderIndex: number;
  sets: number;
  durationSeconds: number | null;
  reps: number | null;
  transitionSeconds: number;
  notes: string | null;
  exercise?: ExerciseDto;
}

export interface StretchingRoutineDto {
  id: string;
  systemKey?: string | null;
  userId: string;
  name: string;
  description: string | null;
  targetArea: string;
  estimatedDurationSeconds: number;
  createdAt: string;
  updatedAt: string;
  exercises: StretchingRoutineExerciseDto[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Active Workout Session & Offline Synchronization Schemas
// ─────────────────────────────────────────────────────────────────────────────
export const HeartRateSampleSchema = z.object({
  offsetSec: z.number().int().min(0),
  bpm: z.number().int().min(20).max(260),
});

export type HeartRateSampleDto = z.infer<typeof HeartRateSampleSchema>;

export const SessionSetSyncSchema = z.object({
  id: z.string().optional(),
  clientSetId: z.string().min(1),
  setNumber: z.number().int().min(1).max(100),
  setType: CoercedSetTypeSchema.default(SetType.WORKING),
  weight: z.number().min(0).max(2000).nullable().optional(),
  weightUnit: z.enum(WeightUnit).default(WeightUnit.KG),
  reps: z.number().int().min(0).max(1000).nullable().optional(),
  durationSeconds: z.number().int().min(0).max(36000).nullable().optional(),
  distanceMeters: z.number().min(0).max(200000).nullable().optional(),
  rpe: z.number().min(1).max(10).nullable().optional(),
  completed: z.boolean().default(false),
  completedAt: z.string().nullable().optional(),
  isPersonalRecord: z.boolean().default(false).optional(),
  notes: z.string().max(500).nullable().optional(),
  avgHeartRateBpm: z.number().int().min(20).max(260).nullable().optional(),
  peakHeartRateBpm: z.number().int().min(20).max(260).nullable().optional(),
  restEndHeartRateBpm: z.number().int().min(20).max(260).nullable().optional(),
});

export const SessionExerciseSyncSchema = z.object({
  id: z.string().optional(),
  clientExerciseId: z.string().min(1),
  exerciseId: z.string().nullable().optional(),
  replacedExerciseId: z.string().nullable().optional(),
  replacedExerciseName: z.string().nullable().optional(),
  exerciseNameSnapshot: z.string().min(1).max(160),
  primaryMuscleSnapshot: z.enum(MuscleGroup),
  exerciseTypeSnapshot: CoercedExerciseTypeSchema.default(ExerciseType.STRENGTH),
  origin: z.enum(SessionExerciseOrigin).default(SessionExerciseOrigin.PLANNED),
  status: z.enum(SessionExerciseStatus).default(SessionExerciseStatus.PENDING),
  orderIndex: z.number().int().min(0),
  plannedSets: z.number().int().min(1).max(30).default(3),
  plannedWarmupSets: z.number().int().min(0).max(10).default(0),
  targetRepsMin: z.number().int().nullable().optional(),
  targetRepsMax: z.number().int().nullable().optional(),
  targetWeight: z.number().nullable().optional(),
  targetDurationSeconds: z.number().int().nullable().optional(),
  restSeconds: z.number().int().min(0).max(1800).default(90),
  alternativeExerciseIds: z.array(z.string()).default([]),
  notes: z.string().max(500).nullable().optional(),
  sets: z.array(SessionSetSyncSchema).default([]),
});

export const SyncSessionPayloadSchema = z.object({
  id: z.string().optional(),
  clientSessionId: z.string().min(1),
  templateId: z.string().nullable().optional(),
  stretchingRoutineId: z.string().nullable().optional(),
  sessionType: z.enum(SessionType).default(SessionType.STRENGTH),
  workoutNameSnapshot: z.string().min(1).max(160),
  status: z.enum(SessionStatus).default(SessionStatus.IN_PROGRESS),
  startedAt: z.string(),
  pausedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  activeDurationSeconds: z.number().int().min(0).default(0),
  weightUnit: z.enum(WeightUnit).default(WeightUnit.KG),
  notes: z.string().max(2000).nullable().optional(),
  restTimerEndsAt: z.string().nullable().optional(),
  restTimerDurationSec: z.number().int().nullable().optional(),
  restTimerPausedRemSec: z.number().int().nullable().optional(),
  sourceDevice: z.enum(SessionSourceDevice).default(SessionSourceDevice.WEB).optional(),
  healthKitWorkoutUuid: z.uuid().nullable().optional(),
  activeCaloriesKcal: z.number().min(0).max(10000).nullable().optional(),
  totalCaloriesKcal: z.number().min(0).max(15000).nullable().optional(),
  avgHeartRateBpm: z.number().int().min(20).max(260).nullable().optional(),
  maxHeartRateBpm: z.number().int().min(20).max(260).nullable().optional(),
  minHeartRateBpm: z.number().int().min(20).max(260).nullable().optional(),
  heartRateSamples: z.array(HeartRateSampleSchema).max(3600).nullable().optional(),
  version: z.number().int().min(1).default(1),
  /** Stable random id of the sending app install; lets the server recognise its own retries. */
  deviceId: z.string().min(8).max(64).optional(),
  /** Last server version this device has acknowledged; used for optimistic concurrency. */
  baseVersion: z.number().int().min(1).optional(),
  forceOverwrite: z.boolean().default(false).optional(),
  exercises: z.array(SessionExerciseSyncSchema).default([]),
});

export const StartSessionSchema = z.object({
  clientSessionId: z.string().min(1),
  templateId: z.string().nullable().optional(),
  stretchingRoutineId: z.string().nullable().optional(),
  workoutName: z.string().min(1).max(160).optional(),
  sessionType: z.enum(SessionType).default(SessionType.STRENGTH).optional(),
  weightUnit: z.enum(WeightUnit).default(WeightUnit.KG).optional(),
  sourceDevice: z.enum(SessionSourceDevice).default(SessionSourceDevice.WEB).optional(),
});

export type SessionSetSyncDto = z.infer<typeof SessionSetSyncSchema>;
export type SessionExerciseSyncDto = z.infer<typeof SessionExerciseSyncSchema>;
export type SyncSessionPayloadDto = z.infer<typeof SyncSessionPayloadSchema>;
export type StartSessionDto = z.infer<typeof StartSessionSchema>;

export interface SessionSetDto {
  id: string;
  clientSetId: string;
  sessionExerciseId: string;
  setNumber: number;
  setType: SetType;
  weight: number | null;
  weightUnit: WeightUnit;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  rpe: number | null;
  completed: boolean;
  completedAt: string | null;
  isPersonalRecord: boolean;
  notes: string | null;
  avgHeartRateBpm?: number | null;
  peakHeartRateBpm?: number | null;
  restEndHeartRateBpm?: number | null;
}

export interface SessionExerciseDto {
  id: string;
  clientExerciseId: string;
  sessionId: string;
  exerciseId: string | null;
  replacedExerciseId: string | null;
  replacedExerciseName: string | null;
  exerciseNameSnapshot: string;
  primaryMuscleSnapshot: MuscleGroup;
  exerciseTypeSnapshot: ExerciseType;
  origin: SessionExerciseOrigin;
  status: SessionExerciseStatus;
  orderIndex: number;
  plannedSets: number;
  plannedWarmupSets: number;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetWeight: number | null;
  targetDurationSeconds: number | null;
  restSeconds: number;
  alternativeExerciseIds: string[];
  notes: string | null;
  sets: SessionSetDto[];
}

export interface WorkoutSessionDto {
  id: string;
  clientSessionId: string;
  userId: string;
  templateId: string | null;
  stretchingRoutineId: string | null;
  sessionType: SessionType;
  workoutNameSnapshot: string;
  status: SessionStatus;
  startedAt: string;
  pausedAt: string | null;
  completedAt: string | null;
  activeDurationSeconds: number;
  weightUnit: WeightUnit;
  totalVolumeKg: number;
  totalSetsCompleted: number;
  totalRepsCompleted: number;
  totalStretchSeconds: number;
  notes: string | null;
  restTimerEndsAt: string | null;
  restTimerDurationSec: number | null;
  restTimerPausedRemSec: number | null;
  sourceDevice?: SessionSourceDevice;
  healthKitWorkoutUuid?: string | null;
  activeCaloriesKcal?: number | null;
  totalCaloriesKcal?: number | null;
  /** Burn estimate: HealthKit active kcal when present, otherwise MET-based. */
  estimatedCaloriesKcal?: number | null;
  avgHeartRateBpm?: number | null;
  maxHeartRateBpm?: number | null;
  minHeartRateBpm?: number | null;
  heartRateSamples?: HeartRateSampleDto[] | null;
  version: number;
  lastSyncedAt: string;
  exercises: SessionExerciseDto[];
}

export interface SyncSessionResponseDto {
  session: WorkoutSessionDto;
  conflictDetected: boolean;
  serverVersion: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Diary & Analytics Schemas
// ─────────────────────────────────────────────────────────────────────────────
export const AnalyticsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  exerciseId: z.string().optional(),
  templateId: z.string().optional(),
  muscleGroup: z.enum(MuscleGroup).optional(),
  period: z.enum(['week', 'month', 'year', 'all']).default('month').optional(),
});

export type AnalyticsQueryDto = z.infer<typeof AnalyticsQuerySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Web Analytics (first-party Umami pageview collector)
// ─────────────────────────────────────────────────────────────────────────────
export const ANALYTICS_MAX_URL_LENGTH = 500;

/** Drops query string and fragment so tokens/PII in URLs can never be forwarded. */
export const stripUrlQuery = (value: string): string => value.split(/[?#]/, 1)[0] ?? '';

/**
 * Allow-list of custom event names. Event data must stay low-cardinality and anonymous:
 * no names, e-mail addresses, free text, weights, heart rate or other health/body data.
 */
export const ANALYTICS_EVENT_NAMES = [
  'signup',
  'login',
  'password_reset_request',
  'account_delete_request',
  'workout_start',
  'workout_complete',
  'workout_abandon',
  'exercise_swap',
  'suggestion_accept',
  'suggestion_dismiss',
  'offline_sync',
  'data_export',
  'pwa_installed',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

const analyticsUrlSchema = z
  .string()
  .max(ANALYTICS_MAX_URL_LENGTH)
  .regex(/^\/(?!\/)/, 'url must be an absolute path')
  .transform(stripUrlQuery);

const analyticsEventDataSchema = z
  .record(
    z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
    z.union([z.string().max(100), z.number().finite(), z.boolean()]),
  )
  .refine((data) => Object.keys(data).length <= 10, 'at most 10 data keys');

export const AnalyticsCollectSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('pageview'),
    url: analyticsUrlSchema,
    referrer: z.string().max(ANALYTICS_MAX_URL_LENGTH).transform(stripUrlQuery).optional(),
  }),
  z.strictObject({
    type: z.literal('event'),
    name: z.enum(ANALYTICS_EVENT_NAMES),
    url: analyticsUrlSchema,
    data: analyticsEventDataSchema.optional(),
  }),
]);

export type AnalyticsCollectDto = z.infer<typeof AnalyticsCollectSchema>;

export interface PersonalRecordDto {
  exerciseId: string;
  exerciseName: string;
  primaryMuscle: MuscleGroup;
  maxWeightKg: number;
  repsAtMaxWeight: number;
  estimatedOneRepMaxKg: number;
  bestVolumeSetKg: number;
  achievedAt: string;
}

export interface AnalyticsSummaryDto {
  totalSessionsCompleted: number;
  totalStrengthSessions: number;
  totalStretchingSessions: number;
  totalSetsCompleted: number;
  totalRepsCompleted: number;
  totalVolumeKg: number;
  totalDurationSeconds: number;
  totalStretchSeconds: number;
  totalActiveCaloriesKcal: number;
  avgWorkoutHeartRateBpm: number | null;
  currentStreakWeeks: number;
  sessionsThisWeek: number;
  weeklyGoalSessions: number;
  frequencyByWeek: Array<{
    weekStart: string;
    label: string;
    strengthSessions: number;
    stretchingSessions: number;
    totalVolumeKg: number;
    totalSets: number;
  }>;
  muscleDistribution: Array<{
    muscleGroup: MuscleGroup;
    label: string;
    completedSets: number;
    totalVolumeKg: number;
    percentage: number;
  }>;
  personalRecords: PersonalRecordDto[];
  exerciseProgression: Array<{
    date: string;
    workoutName: string;
    maxWeightKg: number;
    totalVolumeKg: number;
    bestSetReps: number;
    estimated1RM: number;
  }>;
}

export * from './admin.schemas';
export * from './nutrition.schemas';
export * from './body-weight.schemas';
export * from './activity.schemas';
export * from './ai.schemas';
