-- Rename the social identifier "handle" to "username" (User + Report snapshot).
ALTER TABLE "User" RENAME COLUMN "handle" TO "username";
ALTER TABLE "User" RENAME COLUMN "handleChangedAt" TO "usernameChangedAt";
ALTER INDEX "User_handle_key" RENAME TO "User_username_key";
ALTER TABLE "UserReport" RENAME COLUMN "handleSnapshot" TO "usernameSnapshot";
