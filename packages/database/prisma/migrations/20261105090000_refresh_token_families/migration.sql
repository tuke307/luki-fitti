-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "familyId" TEXT,
ADD COLUMN     "deviceLabel" TEXT,
ADD COLUMN     "rotatedAt" TIMESTAMP(3),
ADD COLUMN     "lastUsedAt" TIMESTAMP(3);

-- Backfill: every existing token becomes its own family so current logins keep working
UPDATE "RefreshToken" SET "familyId" = "id" WHERE "familyId" IS NULL;

ALTER TABLE "RefreshToken" ALTER COLUMN "familyId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");
