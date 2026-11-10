-- CreateEnum
CREATE TYPE "BodyGoal" AS ENUM ('BUILD_MUSCLE', 'LOSE_FAT', 'RECOMP', 'MAINTAIN');

-- CreateEnum
CREATE TYPE "ProgressPose" AS ENUM ('FRONT', 'SIDE', 'BACK');

-- CreateEnum
CREATE TYPE "ProgressPhotoKind" AS ENUM ('PHOTO', 'AI_TARGET');

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "aiProgressTargetEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "progressTargetFallbacks" TEXT[] DEFAULT ARRAY['bytedance-seed/seedream-5-0-flash']::TEXT[],
ADD COLUMN     "progressTargetModel" TEXT NOT NULL DEFAULT 'google/gemini-nano-banana-2.1';

-- AlterTable
ALTER TABLE "Email" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "EmailTemplate" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "UserPreferences" ADD COLUMN     "bodyGoal" "BodyGoal",
ADD COLUMN     "goalHorizonMonths" INTEGER,
ADD COLUMN     "progressAiConsentAt" TIMESTAMP(3),
ADD COLUMN     "progressPhotoCloudBackup" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ProgressCheckIn" (
    "id" TEXT NOT NULL,
    "clientEntryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "bodyWeightClientEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressPhoto" (
    "id" TEXT NOT NULL,
    "clientPhotoId" TEXT NOT NULL,
    "checkInId" TEXT NOT NULL,
    "pose" "ProgressPose" NOT NULL,
    "kind" "ProgressPhotoKind" NOT NULL DEFAULT 'PHOTO',
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "aiModel" TEXT,
    "aiGoal" "BodyGoal",
    "aiHorizonMonths" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgressCheckIn_clientEntryId_key" ON "ProgressCheckIn"("clientEntryId");

-- CreateIndex
CREATE INDEX "ProgressCheckIn_userId_takenAt_idx" ON "ProgressCheckIn"("userId", "takenAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressPhoto_clientPhotoId_key" ON "ProgressPhoto"("clientPhotoId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressPhoto_storageKey_key" ON "ProgressPhoto"("storageKey");

-- CreateIndex
CREATE INDEX "ProgressPhoto_checkInId_idx" ON "ProgressPhoto"("checkInId");

-- AddForeignKey
ALTER TABLE "ProgressCheckIn" ADD CONSTRAINT "ProgressCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressPhoto" ADD CONSTRAINT "ProgressPhoto_checkInId_fkey" FOREIGN KEY ("checkInId") REFERENCES "ProgressCheckIn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
