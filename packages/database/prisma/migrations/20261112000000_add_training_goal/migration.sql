-- CreateEnum
CREATE TYPE "TrainingGoal" AS ENUM ('STRENGTH', 'HYPERTROPHY', 'ENDURANCE');

-- AlterTable
ALTER TABLE "UserPreferences" ADD COLUMN     "trainingGoal" "TrainingGoal";

-- AlterTable
ALTER TABLE "WorkoutTemplate" ADD COLUMN     "trainingGoal" "TrainingGoal";

-- AlterTable
ALTER TABLE "WorkoutSession" ADD COLUMN     "trainingGoalSnapshot" "TrainingGoal";
