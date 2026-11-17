-- CreateEnum
CREATE TYPE "DuelStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "FriendStreakStatus" AS ENUM ('PENDING', 'ACTIVE');

-- CreateEnum
CREATE TYPE "TrophyKind" AS ENUM ('DUEL_WIN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'DUEL_INVITE';
ALTER TYPE "NotificationKind" ADD VALUE 'DUEL_ACCEPTED';
ALTER TYPE "NotificationKind" ADD VALUE 'DUEL_STANDINGS';
ALTER TYPE "NotificationKind" ADD VALUE 'DUEL_RESULT';
ALTER TYPE "NotificationKind" ADD VALUE 'STREAK_INVITE';
ALTER TYPE "NotificationKind" ADD VALUE 'STREAK_STARTED';
ALTER TYPE "NotificationKind" ADD VALUE 'STREAK_REMINDER';
ALTER TYPE "NotificationKind" ADD VALUE 'STREAK_FROZEN';
ALTER TYPE "NotificationKind" ADD VALUE 'STREAK_BROKEN';

-- AlterTable
ALTER TABLE "UserPreferences" ADD COLUMN     "pushDuels" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pushStreaks" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "duelsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "streaksEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "WeeklyScore" ADD COLUMN     "goalReached" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Duel" (
    "id" TEXT NOT NULL,
    "challengerId" TEXT NOT NULL,
    "opponentId" TEXT NOT NULL,
    "status" "DuelStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "startDayKey" TEXT,
    "endDayKey" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "challengerPoints" INTEGER NOT NULL DEFAULT 0,
    "opponentPoints" INTEGER NOT NULL DEFAULT 0,
    "winnerId" TEXT,
    "isTie" BOOLEAN NOT NULL DEFAULT false,
    "challengerSeenAt" TIMESTAMP(3),
    "opponentSeenAt" TIMESTAMP(3),
    "lastStandingsDayKey" TEXT,

    CONSTRAINT "Duel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FriendStreak" (
    "id" TEXT NOT NULL,
    "friendshipId" TEXT NOT NULL,
    "status" "FriendStreakStatus" NOT NULL,
    "requestedById" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "longest" INTEGER NOT NULL DEFAULT 0,
    "startedWeekKey" TEXT,
    "lastEvaluatedWeekKey" TEXT,
    "freezes" INTEGER NOT NULL DEFAULT 0,
    "weeksSinceFreeze" INTEGER NOT NULL DEFAULT 0,
    "lastReminderWeekKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FriendStreak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trophy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "TrophyKind" NOT NULL,
    "refId" TEXT NOT NULL,
    "tier" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trophy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Duel_challengerId_status_idx" ON "Duel"("challengerId", "status");

-- CreateIndex
CREATE INDEX "Duel_opponentId_status_idx" ON "Duel"("opponentId", "status");

-- CreateIndex
CREATE INDEX "Duel_status_endsAt_idx" ON "Duel"("status", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "FriendStreak_friendshipId_key" ON "FriendStreak"("friendshipId");

-- CreateIndex
CREATE INDEX "Trophy_userId_createdAt_idx" ON "Trophy"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Trophy_userId_kind_refId_key" ON "Trophy"("userId", "kind", "refId");

-- AddForeignKey
ALTER TABLE "Duel" ADD CONSTRAINT "Duel_challengerId_fkey" FOREIGN KEY ("challengerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Duel" ADD CONSTRAINT "Duel_opponentId_fkey" FOREIGN KEY ("opponentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Duel" ADD CONSTRAINT "Duel_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendStreak" ADD CONSTRAINT "FriendStreak_friendshipId_fkey" FOREIGN KEY ("friendshipId") REFERENCES "Friendship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendStreak" ADD CONSTRAINT "FriendStreak_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trophy" ADD CONSTRAINT "Trophy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: rows that already earned the goal bonus had reached the weekly goal.
UPDATE "WeeklyScore" SET "goalReached" = "goalBonus" > 0;
