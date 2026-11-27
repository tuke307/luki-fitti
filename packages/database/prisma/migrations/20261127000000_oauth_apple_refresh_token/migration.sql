-- AlterTable
ALTER TABLE "OAuthAccount" ADD COLUMN "refreshTokenEnc" TEXT,
ADD COLUMN "tokenClientId" TEXT;
