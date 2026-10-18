-- AlterEnum
ALTER TYPE "EmailTemplateType" ADD VALUE IF NOT EXISTS 'ACCOUNT_DELETION';

-- AlterTable User: add account deletion confirmation token & expiry
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "accountDeletionToken" TEXT,
  ADD COLUMN IF NOT EXISTS "accountDeletionExpires" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "User_accountDeletionToken_key" ON "User"("accountDeletionToken");

-- Update Email.userId foreign key to ON DELETE SET NULL so deletion emails persist after user removal
ALTER TABLE "Email" DROP CONSTRAINT IF EXISTS "Email_userId_fkey";
ALTER TABLE "Email" ADD CONSTRAINT "Email_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed Account Deletion Email Template
INSERT INTO "EmailTemplate" ("name", "subject", "htmlFile", "type", "updatedAt")
VALUES
  ('Account Deletion', 'LukiFitti — Confirm account deletion', 'account-deletion.mjml', 'ACCOUNT_DELETION'::"EmailTemplateType", NOW())
ON CONFLICT ("type") DO UPDATE SET
  "name" = EXCLUDED."name",
  "subject" = EXCLUDED."subject",
  "htmlFile" = EXCLUDED."htmlFile",
  "updatedAt" = NOW();
