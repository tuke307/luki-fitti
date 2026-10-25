-- AlterTable UserPreferences: follow the device appearance by default
ALTER TABLE "UserPreferences" ALTER COLUMN "theme" SET DEFAULT 'system';
