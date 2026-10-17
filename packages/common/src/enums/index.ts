export enum WeightUnit {
  KG = 'KG',
  LBS = 'LBS',
}

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

export enum ExerciseType {
  STRENGTH = 'STRENGTH',
  STRETCHING = 'STRETCHING',
  MOBILITY = 'MOBILITY',
  CARDIO = 'CARDIO',
}

export const EXERCISE_TYPE_LABELS: Record<ExerciseType, string> = {
  [ExerciseType.STRENGTH]: 'Strength',
  [ExerciseType.STRETCHING]: 'Stretching',
  [ExerciseType.MOBILITY]: 'Mobility',
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
  FAILURE = 'FAILURE',
  STRETCH = 'STRETCH',
}
