-- CreateEnum
CREATE TYPE "AiKeySlot" AS ENUM ('USER', 'ADMIN');

-- AlterTable
ALTER TABLE "AiRun" ADD COLUMN     "keySource" "AiKeySlot";

-- CreateTable
CREATE TABLE "UserAiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slot" "AiKeySlot" NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "last4" TEXT NOT NULL,
    "setByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserAiKey_userId_slot_key" ON "UserAiKey"("userId", "slot");

-- AddForeignKey
ALTER TABLE "UserAiKey" ADD CONSTRAINT "UserAiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
