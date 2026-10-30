-- CreateEnum
CREATE TYPE "BodyWeightSource" AS ENUM ('MANUAL', 'HEALTHKIT');

-- AlterTable
ALTER TABLE "UserPreferences" ADD COLUMN     "weighInReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weighInReminderMinutes" INTEGER NOT NULL DEFAULT 450,
ADD COLUMN     "weighInReminderWeekday" INTEGER NOT NULL DEFAULT 2;

-- CreateTable
CREATE TABLE "BodyWeightEntry" (
    "id" TEXT NOT NULL,
    "clientEntryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "source" "BodyWeightSource" NOT NULL DEFAULT 'MANUAL',
    "healthKitUuid" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BodyWeightEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BodyWeightEntry_clientEntryId_key" ON "BodyWeightEntry"("clientEntryId");

-- CreateIndex
CREATE INDEX "BodyWeightEntry_userId_measuredAt_idx" ON "BodyWeightEntry"("userId", "measuredAt");

-- CreateIndex
CREATE UNIQUE INDEX "BodyWeightEntry_userId_healthKitUuid_key" ON "BodyWeightEntry"("userId", "healthKitUuid");

-- AddForeignKey
ALTER TABLE "BodyWeightEntry" ADD CONSTRAINT "BodyWeightEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: seed each user's history with their existing single body weight.
INSERT INTO "BodyWeightEntry" ("id", "clientEntryId", "userId", "measuredAt", "weightKg", "source", "updatedAt")
SELECT gen_random_uuid()::text, 'weight-backfill-' || "userId", "userId", "updatedAt", "bodyWeightKg", 'MANUAL', CURRENT_TIMESTAMP
FROM "UserPreferences"
WHERE "bodyWeightKg" IS NOT NULL;
