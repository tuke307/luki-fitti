export enum WeightUnit {
  KG = 'KG',
  LBS = 'LBS',
}

export const SUPPORTED_LOCALES = ['en', 'de'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const LANGUAGE_PREFERENCES = ['system', 'en', 'de'] as const;
export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number];

export enum DistanceUnit {
  KM = 'KM',
  MI = 'MI',
}

export enum MuscleGroup {
  CHEST = 'CHEST',
  BACK = 'BACK',
  SHOULDERS = 'SHOULDERS',
  BICEPS = 'BICEPS',
  TRICEPS = 'TRICEPS',
  FOREARMS = 'FOREARMS',
  QUADRICEPS = 'QUADRICEPS',
  HAMSTRINGS = 'HAMSTRINGS',
  GLUTES = 'GLUTES',
  CALVES = 'CALVES',
  ABS_CORE = 'ABS_CORE',
  HIP_FLEXORS = 'HIP_FLEXORS',
  FULL_BODY = 'FULL_BODY',
}

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  [MuscleGroup.CHEST]: 'Chest',
  [MuscleGroup.BACK]: 'Back',
  [MuscleGroup.SHOULDERS]: 'Shoulders',
  [MuscleGroup.BICEPS]: 'Biceps',
  [MuscleGroup.TRICEPS]: 'Triceps',
  [MuscleGroup.FOREARMS]: 'Forearms',
  [MuscleGroup.QUADRICEPS]: 'Quadriceps',
  [MuscleGroup.HAMSTRINGS]: 'Hamstrings',
  [MuscleGroup.GLUTES]: 'Glutes',
  [MuscleGroup.CALVES]: 'Calves',
  [MuscleGroup.ABS_CORE]: 'Abs & Core',
  [MuscleGroup.HIP_FLEXORS]: 'Hip Flexors',
  [MuscleGroup.FULL_BODY]: 'Full Body',
};

export enum ExerciseCategory {
  COMPOUND = 'COMPOUND',
  ISOLATION = 'ISOLATION',
  BODYWEIGHT = 'BODYWEIGHT',
  MACHINE = 'MACHINE',
  CABLE = 'CABLE',
  MOBILITY = 'MOBILITY',
  STRETCH = 'STRETCH',
  CARDIO = 'CARDIO',
}

/**
 * How an exercise moves the body. Two exercises with the same pattern train the same motion and
 * are interchangeable; the coarse `MuscleGroup` is not enough for that (a row and a pullover are
 * both BACK).
 */
export enum MovementPattern {
  HORIZONTAL_PULL = 'HORIZONTAL_PULL',
  VERTICAL_PULL = 'VERTICAL_PULL',
  /** Straight-arm pulldowns and pullovers. */
  SHOULDER_EXTENSION = 'SHOULDER_EXTENSION',
  HORIZONTAL_PUSH = 'HORIZONTAL_PUSH',
  INCLINE_PUSH = 'INCLINE_PUSH',
  VERTICAL_PUSH = 'VERTICAL_PUSH',
  DIP = 'DIP',
  FLY = 'FLY',
  LATERAL_RAISE = 'LATERAL_RAISE',
  FRONT_RAISE = 'FRONT_RAISE',
  REAR_DELT = 'REAR_DELT',
  UPRIGHT_ROW = 'UPRIGHT_ROW',
  SHRUG = 'SHRUG',
  SHOULDER_ROTATION = 'SHOULDER_ROTATION',
  ELBOW_FLEXION = 'ELBOW_FLEXION',
  ELBOW_EXTENSION = 'ELBOW_EXTENSION',
  WRIST = 'WRIST',
  SQUAT = 'SQUAT',
  HINGE = 'HINGE',
  LUNGE = 'LUNGE',
  KNEE_EXTENSION = 'KNEE_EXTENSION',
  KNEE_FLEXION = 'KNEE_FLEXION',
  HIP_THRUST = 'HIP_THRUST',
  /** Kickbacks and reverse hyperextensions. */
  HIP_EXTENSION = 'HIP_EXTENSION',
  HIP_ABDUCTION = 'HIP_ABDUCTION',
  HIP_ADDUCTION = 'HIP_ADDUCTION',
  HIP_FLEXION = 'HIP_FLEXION',
  CALF_RAISE = 'CALF_RAISE',
  BACK_EXTENSION = 'BACK_EXTENSION',
  CORE_FLEXION = 'CORE_FLEXION',
  ANTI_EXTENSION = 'ANTI_EXTENSION',
  LATERAL_FLEXION = 'LATERAL_FLEXION',
  ROTATION = 'ROTATION',
  CARRY = 'CARRY',
  OLYMPIC_LIFT = 'OLYMPIC_LIFT',
}

export enum Laterality {
  BILATERAL = 'BILATERAL',
  /** One arm or leg at a time (including alternating). */
  UNILATERAL = 'UNILATERAL',
}

export enum ExerciseMechanic {
  COMPOUND = 'COMPOUND',
  ISOLATION = 'ISOLATION',
}

/** Finer-grained than `MuscleGroup`: the regions an exercise mainly loads. */
export enum TargetRegion {
  LATS = 'LATS',
  UPPER_BACK = 'UPPER_BACK',
  TRAPS = 'TRAPS',
  LOWER_BACK = 'LOWER_BACK',
  UPPER_CHEST = 'UPPER_CHEST',
  MID_CHEST = 'MID_CHEST',
  LOWER_CHEST = 'LOWER_CHEST',
  FRONT_DELT = 'FRONT_DELT',
  SIDE_DELT = 'SIDE_DELT',
  REAR_DELT = 'REAR_DELT',
  BICEPS = 'BICEPS',
  BRACHIALIS = 'BRACHIALIS',
  TRICEPS = 'TRICEPS',
  FOREARMS = 'FOREARMS',
  QUADS = 'QUADS',
  HAMSTRINGS = 'HAMSTRINGS',
  GLUTES = 'GLUTES',
  ADDUCTORS = 'ADDUCTORS',
  ABDUCTORS = 'ABDUCTORS',
  CALVES = 'CALVES',
  ABS = 'ABS',
  OBLIQUES = 'OBLIQUES',
  HIP_FLEXORS = 'HIP_FLEXORS',
}

export enum ExerciseType {
  STRENGTH = 'STRENGTH',
  STRETCHING = 'STRETCHING',
  CARDIO = 'CARDIO',
}

export const EXERCISE_TYPE_LABELS: Record<ExerciseType, string> = {
  [ExerciseType.STRENGTH]: 'Strength',
  [ExerciseType.STRETCHING]: 'Stretching & Mobility',
  [ExerciseType.CARDIO]: 'Cardio',
};

export enum EquipmentType {
  BARBELL = 'BARBELL',
  DUMBBELL = 'DUMBBELL',
  MACHINE = 'MACHINE',
  CABLE = 'CABLE',
  BODYWEIGHT = 'BODYWEIGHT',
  KETTLEBELL = 'KETTLEBELL',
  BAND = 'BAND',
  EZ_BAR = 'EZ_BAR',
  SMITH_MACHINE = 'SMITH_MACHINE',
  CARDIO_MACHINE = 'CARDIO_MACHINE',
  FOAM_ROLLER = 'FOAM_ROLLER',
  NONE = 'NONE',
  OTHER = 'OTHER',
}

export const EQUIPMENT_LABELS: Record<EquipmentType, string> = {
  [EquipmentType.BARBELL]: 'Barbell',
  [EquipmentType.DUMBBELL]: 'Dumbbell',
  [EquipmentType.MACHINE]: 'Machine',
  [EquipmentType.CABLE]: 'Cable',
  [EquipmentType.BODYWEIGHT]: 'Bodyweight',
  [EquipmentType.KETTLEBELL]: 'Kettlebell',
  [EquipmentType.BAND]: 'Resistance Band',
  [EquipmentType.EZ_BAR]: 'EZ-Bar',
  [EquipmentType.SMITH_MACHINE]: 'Smith Machine',
  [EquipmentType.CARDIO_MACHINE]: 'Cardio Machine',
  [EquipmentType.FOAM_ROLLER]: 'Foam Roller',
  [EquipmentType.NONE]: 'No Equipment',
  [EquipmentType.OTHER]: 'Other',
};

export enum SessionStatus {
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  ABANDONED = 'ABANDONED',
}

export enum SessionType {
  STRENGTH = 'STRENGTH',
  STRETCHING = 'STRETCHING',
  MIXED = 'MIXED',
}

export enum SessionExerciseOrigin {
  PLANNED = 'PLANNED',
  SUBSTITUTED = 'SUBSTITUTED',
  ADDED = 'ADDED',
}

export enum SessionExerciseStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  SKIPPED = 'SKIPPED',
}

export enum SetType {
  WARMUP = 'WARMUP',
  WORKING = 'WORKING',
  DROPSET = 'DROPSET',
  STRETCH = 'STRETCH',
}

export enum SessionSourceDevice {
  WEB = 'WEB',
  IPHONE = 'IPHONE',
  APPLE_WATCH = 'APPLE_WATCH',
}

export enum EmailTemplateType {
  ACCOUNT_CONFIRMATION = 'ACCOUNT_CONFIRMATION',
  PASSWORD_RESET = 'PASSWORD_RESET',
  ACCOUNT_DELETION = 'ACCOUNT_DELETION',
}

export enum EmailStatus {
  PROCESSING = 'PROCESSING',
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin portal & opt-in features
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Granular admin-portal permissions stored in `User.permissions` (`String[]`).
 * Checks are any-of: a route/menu item is granted if the user holds at least one
 * of the permissions it requires. Adding one needs no migration.
 */
export enum AdminPermission {
  DASHBOARD_VIEW = 'DASHBOARD_VIEW',
  USERS_MANAGE = 'USERS_MANAGE',
  AI_SETTINGS_MANAGE = 'AI_SETTINGS_MANAGE',
}

export const ADMIN_PERMISSIONS: AdminPermission[] = Object.values(AdminPermission);

export const ADMIN_PERMISSION_LABELS: Record<AdminPermission, { en: string; de: string }> = {
  [AdminPermission.DASHBOARD_VIEW]: { en: 'Dashboard', de: 'Dashboard' },
  [AdminPermission.USERS_MANAGE]: { en: 'Manage users', de: 'Nutzer verwalten' },
  [AdminPermission.AI_SETTINGS_MANAGE]: { en: 'AI settings', de: 'KI-Einstellungen' },
};

/** Opt-in features an admin grants per user (stored in `User.featureGrants`). */
export enum FeatureGrant {
  AI_WORKOUT_BUILDER = 'AI_WORKOUT_BUILDER',
  AI_MEAL_PHOTO = 'AI_MEAL_PHOTO',
}

export const FEATURE_GRANTS: FeatureGrant[] = Object.values(FeatureGrant);

export const FEATURE_GRANT_LABELS: Record<FeatureGrant, { en: string; de: string }> = {
  [FeatureGrant.AI_WORKOUT_BUILDER]: { en: 'AI workout builder', de: 'KI-Workout-Planer' },
  [FeatureGrant.AI_MEAL_PHOTO]: { en: 'AI meal photos', de: 'KI-Mahlzeitenfotos' },
};

export const isAdminPermission = (value: string): value is AdminPermission =>
  (ADMIN_PERMISSIONS as string[]).includes(value);

export const isFeatureGrant = (value: string): value is FeatureGrant =>
  (FEATURE_GRANTS as string[]).includes(value);

export enum AiSkillName {
  WORKOUT_BUILDER = 'workout-builder',
  MEAL_ANALYZER = 'meal-analyzer',
}

export enum AiRunStatus {
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export enum ExerciseFeedbackVerdict {
  NOT_WORKING = 'NOT_WORKING',
  PAIN = 'PAIN',
  DISLIKE = 'DISLIKE',
}

// ─────────────────────────────────────────────────────────────────────────────
// Nutrition
// ─────────────────────────────────────────────────────────────────────────────

export enum MealType {
  BREAKFAST = 'BREAKFAST',
  LUNCH = 'LUNCH',
  DINNER = 'DINNER',
  SNACK = 'SNACK',
  COFFEE = 'COFFEE',
  OTHER = 'OTHER',
}

export const MEAL_TYPES: MealType[] = Object.values(MealType);

export enum FoodItemSource {
  MANUAL = 'MANUAL',
  AI = 'AI',
}

export enum BodyWeightSource {
  MANUAL = 'MANUAL',
  HEALTHKIT = 'HEALTHKIT',
}

export const BIOLOGICAL_SEX_VALUES = ['female', 'male'] as const;
export type BiologicalSex = (typeof BIOLOGICAL_SEX_VALUES)[number];
