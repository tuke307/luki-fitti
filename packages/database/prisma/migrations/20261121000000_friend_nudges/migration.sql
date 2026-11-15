-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'FRIEND_PULLED_AHEAD';

-- AlterTable
ALTER TABLE "UserPreferences" ADD COLUMN     "pushNudges" BOOLEAN NOT NULL DEFAULT true;
