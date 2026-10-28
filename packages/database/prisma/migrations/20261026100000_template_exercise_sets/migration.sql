-- AlterTable WorkoutTemplateExercise: per-set plan (type, weight, reps per set). Existing rows keep
-- NULL and are expanded from plannedSets / warmupSets / targetWeight when read.
ALTER TABLE "WorkoutTemplateExercise" ADD COLUMN "sets" JSONB;
