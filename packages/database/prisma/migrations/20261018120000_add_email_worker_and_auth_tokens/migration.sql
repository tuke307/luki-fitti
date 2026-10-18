-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "EmailTemplateType" AS ENUM ('ACCOUNT_CONFIRMATION', 'PASSWORD_RESET');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "EmailStatus" AS ENUM ('PROCESSING', 'PENDING', 'SENT', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable User
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "emailVerificationToken" TEXT,
  ADD COLUMN IF NOT EXISTS "emailVerificationExpires" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "passwordResetToken" TEXT,
  ADD COLUMN IF NOT EXISTS "passwordResetExpires" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "User_emailVerificationToken_key" ON "User"("emailVerificationToken");
CREATE UNIQUE INDEX IF NOT EXISTS "User_passwordResetToken_key" ON "User"("passwordResetToken");

-- CreateTable EmailTemplate
CREATE TABLE IF NOT EXISTS "EmailTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "htmlFile" TEXT NOT NULL,
    "type" "EmailTemplateType" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailTemplate_htmlFile_key" ON "EmailTemplate"("htmlFile");
CREATE UNIQUE INDEX IF NOT EXISTS "EmailTemplate_type_key" ON "EmailTemplate"("type");

-- CreateTable Email
CREATE TABLE IF NOT EXISTS "Email" (
    "id" SERIAL NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailTemplateId" INTEGER NOT NULL,
    "userId" TEXT,

    CONSTRAINT "Email_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Email_emailTemplateId_idx" ON "Email"("emailTemplateId");
CREATE INDEX IF NOT EXISTS "Email_userId_idx" ON "Email"("userId");
CREATE INDEX IF NOT EXISTS "Email_status_scheduledAt_idx" ON "Email"("status", "scheduledAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Email" ADD CONSTRAINT "Email_emailTemplateId_fkey" FOREIGN KEY ("emailTemplateId") REFERENCES "EmailTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "Email" ADD CONSTRAINT "Email_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Seed Default Email Templates
INSERT INTO "EmailTemplate" ("name", "subject", "htmlFile", "type", "updatedAt")
VALUES
  ('Account Confirmation', 'LukiFitti — Confirm your account ({{ name }})', 'account-confirmation.mjml', 'ACCOUNT_CONFIRMATION'::"EmailTemplateType", NOW()),
  ('Password Reset', 'LukiFitti — Reset your password', 'password-reset.mjml', 'PASSWORD_RESET'::"EmailTemplateType", NOW())
ON CONFLICT ("type") DO UPDATE SET
  "name" = EXCLUDED."name",
  "subject" = EXCLUDED."subject",
  "htmlFile" = EXCLUDED."htmlFile",
  "updatedAt" = NOW();
