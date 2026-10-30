import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';
import { createPaginator } from 'prisma-extension-pagination';
import { DATABASE_URL } from './config/env.config';

const adapter = new PrismaPg({ connectionString: DATABASE_URL });

const paginate = createPaginator({
  pages: {
    limit: 20,
    includePageCount: true,
  },
});

const prisma = new PrismaClient({ adapter }).$extends({
  model: {
    exercise: {
      paginate,
    },
    workoutSession: {
      paginate,
    },
  },
});

export default prisma;

export { Prisma } from './generated/prisma/client';

export type {
  User,
  UserPreferences,
  RefreshToken,
  Exercise,
  ExerciseMuscleGroup,
  ExerciseAlternative,
  ExerciseMedia,
  WorkoutFolder,
  WorkoutTemplate,
  WorkoutTemplateExercise,
  StretchingRoutine,
  StretchingRoutineExercise,
  WorkoutSession,
  SessionExercise,
  SessionSet,
  EmailTemplate,
  Email,
  AppSettings,
  AiRun,
  ExerciseFeedback,
  MealEntry,
  MealItem,
  MealPhoto,
} from './generated/prisma/client';

export {
  WeightUnit,
  DistanceUnit,
  MuscleGroup,
  ExerciseCategory,
  ExerciseType,
  EquipmentType,
  SessionStatus,
  SessionType,
  SessionExerciseOrigin,
  SessionExerciseStatus,
  SetType,
  EmailTemplateType,
  EmailStatus,
  AiRunStatus,
  ExerciseFeedbackVerdict,
  MealType,
  FoodItemSource,
} from './generated/prisma/client';
