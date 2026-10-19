-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SessionSourceDevice" AS ENUM ('WEB', 'IPHONE', 'APPLE_WATCH');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable WorkoutSession: add HealthKit and Heart Rate telemetry columns
ALTER TABLE "WorkoutSession"
  ADD COLUMN IF NOT EXISTS "sourceDevice" "SessionSourceDevice" NOT NULL DEFAULT 'WEB',
  ADD COLUMN IF NOT EXISTS "healthKitWorkoutUuid" TEXT,
  ADD COLUMN IF NOT EXISTS "activeCaloriesKcal" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "totalCaloriesKcal" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "avgHeartRateBpm" INTEGER,
  ADD COLUMN IF NOT EXISTS "maxHeartRateBpm" INTEGER,
  ADD COLUMN IF NOT EXISTS "minHeartRateBpm" INTEGER,
  ADD COLUMN IF NOT EXISTS "heartRateSamplesJson" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WorkoutSession_healthKitWorkoutUuid_key" ON "WorkoutSession"("healthKitWorkoutUuid");

-- AlterTable SessionSet: add per-set Heart Rate telemetry columns
ALTER TABLE "SessionSet"
  ADD COLUMN IF NOT EXISTS "avgHeartRateBpm" INTEGER,
  ADD COLUMN IF NOT EXISTS "peakHeartRateBpm" INTEGER,
  ADD COLUMN IF NOT EXISTS "restEndHeartRateBpm" INTEGER;
