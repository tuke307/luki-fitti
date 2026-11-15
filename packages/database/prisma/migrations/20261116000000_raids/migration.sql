-- CreateEnum
CREATE TYPE "RaidKind" AS ENUM ('COMMUNITY', 'SQUAD');

-- CreateEnum
CREATE TYPE "RaidStatus" AS ENUM ('ACTIVE', 'DEFEATED', 'ESCAPED');

-- CreateEnum
CREATE TYPE "RaidDifficulty" AS ENUM ('NORMAL', 'HARD', 'HEROIC');

-- CreateEnum
CREATE TYPE "SquadRole" AS ENUM ('OWNER', 'MEMBER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'RAID_SPAWNED';
ALTER TYPE "NotificationKind" ADD VALUE 'RAID_PHASE';
ALTER TYPE "NotificationKind" ADD VALUE 'RAID_DEFEATED';
ALTER TYPE "NotificationKind" ADD VALUE 'RAID_ESCAPED';
ALTER TYPE "NotificationKind" ADD VALUE 'SQUAD_INVITE';
ALTER TYPE "NotificationKind" ADD VALUE 'SQUAD_RAID_STARTED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TrophyKind" ADD VALUE 'RAID_DEFEATED';
ALTER TYPE "TrophyKind" ADD VALUE 'RAID_CROWN';
ALTER TYPE "TrophyKind" ADD VALUE 'RAID_FINAL_BLOW';

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "raidHpPerActiveUser" INTEGER NOT NULL DEFAULT 400,
ADD COLUMN     "raidMinHp" INTEGER NOT NULL DEFAULT 2000,
ADD COLUMN     "raidsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "UserPreferences" ADD COLUMN     "pushRaids" BOOLEAN NOT NULL DEFAULT true;


-- CreateTable
CREATE TABLE "Raid" (
    "id" TEXT NOT NULL,
    "kind" "RaidKind" NOT NULL,
    "squadId" TEXT,
    "bossSlug" TEXT NOT NULL,
    "difficulty" "RaidDifficulty",
    "weekKey" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "maxHp" INTEGER NOT NULL,
    "damage" INTEGER NOT NULL DEFAULT 0,
    "phase" INTEGER NOT NULL DEFAULT 0,
    "status" "RaidStatus" NOT NULL DEFAULT 'ACTIVE',
    "defeatedAt" TIMESTAMP(3),
    "finalBlowUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Raid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaidHit" (
    "id" TEXT NOT NULL,
    "raidId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "damage" INTEGER NOT NULL,
    "firstDamage" INTEGER NOT NULL,
    "weakSpotDamage" INTEGER NOT NULL DEFAULT 0,
    "topExercise" TEXT,
    "dayKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaidHit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaidParticipantSeen" (
    "raidId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaidParticipantSeen_pkey" PRIMARY KEY ("raidId","userId")
);

-- CreateTable
CREATE TABLE "Squad" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Squad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SquadMember" (
    "squadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "SquadRole" NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SquadMember_pkey" PRIMARY KEY ("squadId","userId")
);

-- CreateTable
CREATE TABLE "SquadInvite" (
    "id" TEXT NOT NULL,
    "squadId" TEXT NOT NULL,
    "invitedId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SquadInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex

-- CreateIndex
CREATE INDEX "Raid_status_endsAt_idx" ON "Raid"("status", "endsAt");

-- CreateIndex
CREATE INDEX "Raid_squadId_weekKey_idx" ON "Raid"("squadId", "weekKey");

-- CreateIndex
CREATE UNIQUE INDEX "Raid_kind_weekKey_squadId_key" ON "Raid"("kind", "weekKey", "squadId");

-- CreateIndex
CREATE INDEX "RaidHit_raidId_createdAt_idx" ON "RaidHit"("raidId", "createdAt");

-- CreateIndex
CREATE INDEX "RaidHit_raidId_userId_idx" ON "RaidHit"("raidId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RaidHit_raidId_sessionId_key" ON "RaidHit"("raidId", "sessionId");

-- CreateIndex
CREATE INDEX "SquadMember_userId_idx" ON "SquadMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SquadInvite_squadId_invitedId_key" ON "SquadInvite"("squadId", "invitedId");

-- AddForeignKey
ALTER TABLE "Raid" ADD CONSTRAINT "Raid_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "Squad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Raid" ADD CONSTRAINT "Raid_finalBlowUserId_fkey" FOREIGN KEY ("finalBlowUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaidHit" ADD CONSTRAINT "RaidHit_raidId_fkey" FOREIGN KEY ("raidId") REFERENCES "Raid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaidHit" ADD CONSTRAINT "RaidHit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaidParticipantSeen" ADD CONSTRAINT "RaidParticipantSeen_raidId_fkey" FOREIGN KEY ("raidId") REFERENCES "Raid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaidParticipantSeen" ADD CONSTRAINT "RaidParticipantSeen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Squad" ADD CONSTRAINT "Squad_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SquadMember" ADD CONSTRAINT "SquadMember_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "Squad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SquadMember" ADD CONSTRAINT "SquadMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SquadInvite" ADD CONSTRAINT "SquadInvite_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "Squad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SquadInvite" ADD CONSTRAINT "SquadInvite_invitedId_fkey" FOREIGN KEY ("invitedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SquadInvite" ADD CONSTRAINT "SquadInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Partial unique index: one COMMUNITY raid per week (squadId NULL does not
-- participate in the @@unique above because Postgres treats NULLs as distinct).
CREATE UNIQUE INDEX "Raid_community_week" ON "Raid"("weekKey") WHERE "kind" = 'COMMUNITY';
