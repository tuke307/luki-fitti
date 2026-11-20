-- AlterTable: Add effortTrackingEnabled to UserPreferences
ALTER TABLE "UserPreferences"
ADD COLUMN "effortTrackingEnabled" BOOLEAN NOT NULL DEFAULT true;
