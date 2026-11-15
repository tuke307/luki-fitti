-- AlterTable
ALTER TABLE "UserPreferences" ADD COLUMN     "pushDisabledKinds" "NotificationKind"[] DEFAULT ARRAY[]::"NotificationKind"[];

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "pushDayKey" TEXT;

-- CreateIndex
CREATE INDEX "Notification_userId_pushDayKey_idx" ON "Notification"("userId", "pushDayKey");
