-- CreateEnum
CREATE TYPE "Arena" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND', 'OBSIDIAN', 'TITAN');

-- CreateEnum
CREATE TYPE "LeagueStage" AS ENUM ('FRIENDS', 'GLOBAL', 'ARENAS');

-- CreateEnum
CREATE TYPE "LeagueStageMode" AS ENUM ('AUTO', 'FRIENDS', 'GLOBAL', 'ARENAS');

-- CreateEnum
CREATE TYPE "LeagueOutcome" AS ENUM ('PROMOTED', 'STAYED', 'DEMOTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'LEAGUE_PROMOTED';
ALTER TYPE "NotificationKind" ADD VALUE 'LEAGUE_DEMOTED';
ALTER TYPE "NotificationKind" ADD VALUE 'LEAGUE_ENDING';

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "epDailyCap" INTEGER NOT NULL DEFAULT 600,
ADD COLUMN     "epWeeklyGoalBonus" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "leagueCohortSize" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "leagueStage2MinUsers" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "leagueStage3MinUsers" INTEGER NOT NULL DEFAULT 150,
ADD COLUMN     "leagueStageMode" "LeagueStageMode" NOT NULL DEFAULT 'AUTO',
ADD COLUMN     "leaguesEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "arena" "Arena" NOT NULL DEFAULT 'BRONZE',
ADD COLUMN     "leagueInactiveWeeks" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "UserPreferences" ADD COLUMN     "pushLeagues" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "EffortPointEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "firstPoints" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EffortPointEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "rawPoints" INTEGER NOT NULL,
    "sessions" INTEGER NOT NULL,
    "goalBonus" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueWeek" (
    "weekKey" TEXT NOT NULL,
    "stage" "LeagueStage" NOT NULL,
    "activeUsers" INTEGER NOT NULL,
    "buckets" JSONB,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeagueWeek_pkey" PRIMARY KEY ("weekKey")
);

-- CreateTable
CREATE TABLE "LeagueCohort" (
    "id" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "bucket" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeagueCohort_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueMembership" (
    "id" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "arenaAtStart" "Arena" NOT NULL,
    "finalPoints" INTEGER,
    "finalRank" INTEGER,
    "outcome" "LeagueOutcome",
    "resultSeenAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeagueMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EffortPointEntry_sessionId_key" ON "EffortPointEntry"("sessionId");

-- CreateIndex
CREATE INDEX "EffortPointEntry_userId_weekKey_idx" ON "EffortPointEntry"("userId", "weekKey");

-- CreateIndex
CREATE INDEX "WeeklyScore_weekKey_points_idx" ON "WeeklyScore"("weekKey", "points");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyScore_userId_weekKey_key" ON "WeeklyScore"("userId", "weekKey");

-- CreateIndex
CREATE INDEX "LeagueCohort_weekKey_bucket_idx" ON "LeagueCohort"("weekKey", "bucket");

-- CreateIndex
CREATE INDEX "LeagueMembership_cohortId_idx" ON "LeagueMembership"("cohortId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueMembership_userId_weekKey_key" ON "LeagueMembership"("userId", "weekKey");

-- AddForeignKey
ALTER TABLE "EffortPointEntry" ADD CONSTRAINT "EffortPointEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EffortPointEntry" ADD CONSTRAINT "EffortPointEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyScore" ADD CONSTRAINT "WeeklyScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueMembership" ADD CONSTRAINT "LeagueMembership_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "LeagueCohort"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueMembership" ADD CONSTRAINT "LeagueMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
