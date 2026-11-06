-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN "userModelAllowlist" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "UserPreferences" ADD COLUMN "aiModels" JSONB;
