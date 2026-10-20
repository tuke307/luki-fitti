-- AlterTable: Add notificationsEnabled and exerciseSuggestionsEnabled to UserPreferences
ALTER TABLE "UserPreferences"
ADD COLUMN "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "exerciseSuggestionsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Migrate existing ExerciseType 'MOBILITY' values to 'STRETCHING' before recreating enum
ALTER TYPE "ExerciseType" RENAME TO "ExerciseType_old";
CREATE TYPE "ExerciseType" AS ENUM ('STRENGTH', 'STRETCHING', 'CARDIO');

ALTER TABLE "Exercise" ALTER COLUMN "exerciseType" DROP DEFAULT;
ALTER TABLE "Exercise"
  ALTER COLUMN "exerciseType" TYPE "ExerciseType"
  USING (
    CASE
      WHEN "exerciseType"::text = 'MOBILITY' THEN 'STRETCHING'::"ExerciseType"
      ELSE "exerciseType"::text::"ExerciseType"
    END
  );
ALTER TABLE "Exercise" ALTER COLUMN "exerciseType" SET DEFAULT 'STRENGTH';

ALTER TABLE "SessionExercise" ALTER COLUMN "exerciseTypeSnapshot" DROP DEFAULT;
ALTER TABLE "SessionExercise"
  ALTER COLUMN "exerciseTypeSnapshot" TYPE "ExerciseType"
  USING (
    CASE
      WHEN "exerciseTypeSnapshot"::text = 'MOBILITY' THEN 'STRETCHING'::"ExerciseType"
      ELSE "exerciseTypeSnapshot"::text::"ExerciseType"
    END
  );
ALTER TABLE "SessionExercise" ALTER COLUMN "exerciseTypeSnapshot" SET DEFAULT 'STRENGTH';

DROP TYPE "ExerciseType_old";

-- Migrate existing SetType 'FAILURE' values to 'WORKING' before recreating enum
ALTER TYPE "SetType" RENAME TO "SetType_old";
CREATE TYPE "SetType" AS ENUM ('WARMUP', 'WORKING', 'DROPSET', 'STRETCH');

ALTER TABLE "SessionSet" ALTER COLUMN "setType" DROP DEFAULT;
ALTER TABLE "SessionSet"
  ALTER COLUMN "setType" TYPE "SetType"
  USING (
    CASE
      WHEN "setType"::text = 'FAILURE' THEN 'WORKING'::"SetType"
      ELSE "setType"::text::"SetType"
    END
  );
ALTER TABLE "SessionSet" ALTER COLUMN "setType" SET DEFAULT 'WORKING';

DROP TYPE "SetType_old";
