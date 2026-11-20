-- AlterTable: Add focused exercise tracking to WorkoutSession
ALTER TABLE "WorkoutSession"
ADD COLUMN "focusedClientExerciseId" TEXT,
ADD COLUMN "focusedAt" TIMESTAMP(3);
