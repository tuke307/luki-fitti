-- AlterTable WorkoutSession: remember which app install wrote the latest version so the server
-- can recognise retried syncs from the same device instead of reporting a false conflict.
ALTER TABLE "WorkoutSession" ADD COLUMN "lastWriterDeviceId" TEXT;
