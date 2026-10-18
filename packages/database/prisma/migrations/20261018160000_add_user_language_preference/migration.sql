-- AlterTable UserPreferences: add language preference column
ALTER TABLE "UserPreferences"
  ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'system';
