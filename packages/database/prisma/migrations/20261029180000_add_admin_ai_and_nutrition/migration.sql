-- CreateEnum
CREATE TYPE "AiRunStatus" AS ENUM ('SUCCESS', 'ERROR');

-- CreateEnum
CREATE TYPE "ExerciseFeedbackVerdict" AS ENUM ('NOT_WORKING', 'PAIN', 'DISLIKE');

-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'COFFEE', 'OTHER');

-- CreateEnum
CREATE TYPE "FoodItemSource" AS ENUM ('MANUAL', 'AI');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "featureGrants" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "UserPreferences" ADD COLUMN     "birthYear" INTEGER,
ADD COLUMN     "bodyWeightKg" DOUBLE PRECISION,
ADD COLUMN     "carbsGoalG" INTEGER,
ADD COLUMN     "dailyKcalGoal" INTEGER,
ADD COLUMN     "fatGoalG" INTEGER,
ADD COLUMN     "heightCm" DOUBLE PRECISION,
ADD COLUMN     "proteinGoalG" INTEGER,
ADD COLUMN     "sex" TEXT;

-- AlterTable
ALTER TABLE "WorkoutSession" ADD COLUMN     "estimatedCaloriesKcal" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "aiWorkoutBuilderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiMealPhotoEnabled" BOOLEAN NOT NULL DEFAULT true,
    "workoutBuilderModel" TEXT NOT NULL DEFAULT 'openai/gpt-6.1-terra',
    "workoutBuilderFallbacks" TEXT[] DEFAULT ARRAY['google/gemini-3.8-flash']::TEXT[],
    "mealPhotoModel" TEXT NOT NULL DEFAULT 'google/gemini-3.8-flash',
    "mealPhotoFallbacks" TEXT[] DEFAULT ARRAY['openai/gpt-6.1-terra']::TEXT[],
    "aiDailyRunLimit" INTEGER NOT NULL DEFAULT 30,
    "mealPhotoRetentionDays" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "skill" TEXT NOT NULL,
    "model" TEXT,
    "status" "AiRunStatus" NOT NULL,
    "steps" INTEGER NOT NULL DEFAULT 0,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "verdict" "ExerciseFeedbackVerdict" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealEntry" (
    "id" TEXT NOT NULL,
    "clientEntryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eatenAt" TIMESTAMP(3) NOT NULL,
    "mealType" "MealType" NOT NULL DEFAULT 'OTHER',
    "label" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealItem" (
    "id" TEXT NOT NULL,
    "mealEntryId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "grams" DOUBLE PRECISION,
    "kcal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "proteinG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carbsG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fatG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fiberG" DOUBLE PRECISION,
    "sugarG" DOUBLE PRECISION,
    "source" "FoodItemSource" NOT NULL DEFAULT 'MANUAL',
    "confidence" DOUBLE PRECISION,

    CONSTRAINT "MealItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPhoto" (
    "id" TEXT NOT NULL,
    "mealEntryId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiRun_userId_createdAt_idx" ON "AiRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiRun_skill_createdAt_idx" ON "AiRun"("skill", "createdAt");

-- CreateIndex
CREATE INDEX "AiRun_createdAt_idx" ON "AiRun"("createdAt");

-- CreateIndex
CREATE INDEX "ExerciseFeedback_userId_idx" ON "ExerciseFeedback"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseFeedback_userId_exerciseId_key" ON "ExerciseFeedback"("userId", "exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "MealEntry_clientEntryId_key" ON "MealEntry"("clientEntryId");

-- CreateIndex
CREATE INDEX "MealEntry_userId_eatenAt_idx" ON "MealEntry"("userId", "eatenAt");

-- CreateIndex
CREATE INDEX "MealItem_mealEntryId_orderIndex_idx" ON "MealItem"("mealEntryId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "MealPhoto_storageKey_key" ON "MealPhoto"("storageKey");

-- CreateIndex
CREATE INDEX "MealPhoto_mealEntryId_idx" ON "MealPhoto"("mealEntryId");

-- CreateIndex
CREATE INDEX "MealPhoto_createdAt_idx" ON "MealPhoto"("createdAt");

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseFeedback" ADD CONSTRAINT "ExerciseFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseFeedback" ADD CONSTRAINT "ExerciseFeedback_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealEntry" ADD CONSTRAINT "MealEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealItem" ADD CONSTRAINT "MealItem_mealEntryId_fkey" FOREIGN KEY ("mealEntryId") REFERENCES "MealEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPhoto" ADD CONSTRAINT "MealPhoto_mealEntryId_fkey" FOREIGN KEY ("mealEntryId") REFERENCES "MealEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

