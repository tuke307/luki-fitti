yarn run v1.22.22
$ /Users/MEISSTO/source/luki-fitti/node_modules/.bin/prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WeightUnit" AS ENUM ('KG', 'LBS');

-- CreateEnum
CREATE TYPE "DistanceUnit" AS ENUM ('KM', 'MI');

-- CreateEnum
CREATE TYPE "MuscleGroup" AS ENUM ('CHEST', 'BACK', 'SHOULDERS', 'BICEPS', 'TRICEPS', 'FOREARMS', 'QUADRICEPS', 'HAMSTRINGS', 'GLUTES', 'CALVES', 'ABS_CORE', 'HIP_FLEXORS', 'FULL_BODY');

-- CreateEnum
CREATE TYPE "ExerciseCategory" AS ENUM ('COMPOUND', 'ISOLATION', 'BODYWEIGHT', 'MACHINE', 'CABLE', 'MOBILITY', 'STRETCH', 'CARDIO');

-- CreateEnum
CREATE TYPE "ExerciseType" AS ENUM ('STRENGTH', 'STRETCHING', 'MOBILITY', 'CARDIO');

-- CreateEnum
CREATE TYPE "EquipmentType" AS ENUM ('BARBELL', 'DUMBBELL', 'MACHINE', 'CABLE', 'BODYWEIGHT', 'KETTLEBELL', 'BAND', 'EZ_BAR', 'SMITH_MACHINE', 'CARDIO_MACHINE', 'FOAM_ROLLER', 'NONE', 'OTHER');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('STRENGTH', 'STRETCHING', 'MIXED');

-- CreateEnum
CREATE TYPE "SessionExerciseOrigin" AS ENUM ('PLANNED', 'SUBSTITUTED', 'ADDED');

-- CreateEnum
CREATE TYPE "SessionExerciseStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "SetType" AS ENUM ('WARMUP', 'WORKING', 'DROPSET', 'FAILURE', 'STRETCH');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weightUnit" "WeightUnit" NOT NULL DEFAULT 'KG',
    "distanceUnit" "DistanceUnit" NOT NULL DEFAULT 'KM',
    "defaultRestSeconds" INTEGER NOT NULL DEFAULT 90,
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "restTimerSound" BOOLEAN NOT NULL DEFAULT true,
    "weeklyGoalSessions" INTEGER NOT NULL DEFAULT 4,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "instructions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" "ExerciseCategory" NOT NULL DEFAULT 'COMPOUND',
    "exerciseType" "ExerciseType" NOT NULL DEFAULT 'STRENGTH',
    "primaryMuscleGroup" "MuscleGroup" NOT NULL,
    "equipment" "EquipmentType" NOT NULL DEFAULT 'BARBELL',
    "recommendedDurationSeconds" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseMuscleGroup" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "muscleGroup" "MuscleGroup" NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ExerciseMuscleGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseAlternative" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "alternativeExerciseId" TEXT NOT NULL,
    "reason" TEXT,

    CONSTRAINT "ExerciseAlternative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseMedia" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL DEFAULT 'SVG',
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "attribution" TEXT,
    "license" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ExerciseMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutFolder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#CCFF00',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "folderId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "estimatedDurationMinutes" INTEGER DEFAULT 60,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutTemplateExercise" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "plannedSets" INTEGER NOT NULL DEFAULT 3,
    "warmupSets" INTEGER NOT NULL DEFAULT 0,
    "targetRepsMin" INTEGER DEFAULT 8,
    "targetRepsMax" INTEGER DEFAULT 12,
    "targetWeight" DOUBLE PRECISION,
    "weightUnit" "WeightUnit" NOT NULL DEFAULT 'KG',
    "restSeconds" INTEGER NOT NULL DEFAULT 90,
    "targetDurationSeconds" INTEGER,
    "targetDistanceMeters" DOUBLE PRECISION,
    "notes" TEXT,
    "alternativeExerciseIds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "WorkoutTemplateExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StretchingRoutine" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetArea" TEXT NOT NULL DEFAULT 'Full Body',
    "estimatedDurationSeconds" INTEGER NOT NULL DEFAULT 600,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StretchingRoutine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StretchingRoutineExercise" (
    "id" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "sets" INTEGER NOT NULL DEFAULT 1,
    "durationSeconds" INTEGER DEFAULT 45,
    "reps" INTEGER,
    "transitionSeconds" INTEGER NOT NULL DEFAULT 15,
    "notes" TEXT,

    CONSTRAINT "StretchingRoutineExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutSession" (
    "id" TEXT NOT NULL,
    "clientSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT,
    "stretchingRoutineId" TEXT,
    "sessionType" "SessionType" NOT NULL DEFAULT 'STRENGTH',
    "workoutNameSnapshot" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pausedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "activeDurationSeconds" INTEGER NOT NULL DEFAULT 0,
    "weightUnit" "WeightUnit" NOT NULL DEFAULT 'KG',
    "totalVolumeKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalSetsCompleted" INTEGER NOT NULL DEFAULT 0,
    "totalRepsCompleted" INTEGER NOT NULL DEFAULT 0,
    "totalStretchSeconds" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "restTimerEndsAt" TIMESTAMP(3),
    "restTimerDurationSec" INTEGER,
    "restTimerPausedRemSec" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionExercise" (
    "id" TEXT NOT NULL,
    "clientExerciseId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "exerciseId" TEXT,
    "replacedExerciseId" TEXT,
    "replacedExerciseName" TEXT,
    "exerciseNameSnapshot" TEXT NOT NULL,
    "primaryMuscleSnapshot" "MuscleGroup" NOT NULL,
    "exerciseTypeSnapshot" "ExerciseType" NOT NULL DEFAULT 'STRENGTH',
    "origin" "SessionExerciseOrigin" NOT NULL DEFAULT 'PLANNED',
    "status" "SessionExerciseStatus" NOT NULL DEFAULT 'PENDING',
    "orderIndex" INTEGER NOT NULL,
    "plannedSets" INTEGER NOT NULL DEFAULT 3,
    "plannedWarmupSets" INTEGER NOT NULL DEFAULT 0,
    "targetRepsMin" INTEGER,
    "targetRepsMax" INTEGER,
    "targetWeight" DOUBLE PRECISION,
    "targetDurationSeconds" INTEGER,
    "restSeconds" INTEGER NOT NULL DEFAULT 90,
    "alternativeExerciseIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionSet" (
    "id" TEXT NOT NULL,
    "clientSetId" TEXT NOT NULL,
    "sessionExerciseId" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "setType" "SetType" NOT NULL DEFAULT 'WORKING',
    "weight" DOUBLE PRECISION,
    "weightUnit" "WeightUnit" NOT NULL DEFAULT 'KG',
    "reps" INTEGER,
    "durationSeconds" INTEGER,
    "distanceMeters" DOUBLE PRECISION,
    "rpe" DOUBLE PRECISION,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "isPersonalRecord" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceFormat" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "totalRecords" INTEGER NOT NULL DEFAULT 0,
    "importedSessions" INTEGER NOT NULL DEFAULT 0,
    "importedTemplates" INTEGER NOT NULL DEFAULT 0,
    "skippedDuplicates" INTEGER NOT NULL DEFAULT 0,
    "errorsCount" INTEGER NOT NULL DEFAULT 0,
    "summaryJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreferences_userId_key" ON "UserPreferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_slug_key" ON "Exercise"("slug");

-- CreateIndex
CREATE INDEX "Exercise_userId_idx" ON "Exercise"("userId");

-- CreateIndex
CREATE INDEX "Exercise_primaryMuscleGroup_idx" ON "Exercise"("primaryMuscleGroup");

-- CreateIndex
CREATE INDEX "Exercise_exerciseType_idx" ON "Exercise"("exerciseType");

-- CreateIndex
CREATE INDEX "Exercise_equipment_idx" ON "Exercise"("equipment");

-- CreateIndex
CREATE INDEX "ExerciseMuscleGroup_muscleGroup_idx" ON "ExerciseMuscleGroup"("muscleGroup");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseMuscleGroup_exerciseId_muscleGroup_key" ON "ExerciseMuscleGroup"("exerciseId", "muscleGroup");

-- CreateIndex
CREATE INDEX "ExerciseAlternative_exerciseId_idx" ON "ExerciseAlternative"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseAlternative_exerciseId_alternativeExerciseId_key" ON "ExerciseAlternative"("exerciseId", "alternativeExerciseId");

-- CreateIndex
CREATE INDEX "ExerciseMedia_exerciseId_idx" ON "ExerciseMedia"("exerciseId");

-- CreateIndex
CREATE INDEX "WorkoutFolder_userId_idx" ON "WorkoutFolder"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutFolder_userId_name_key" ON "WorkoutFolder"("userId", "name");

-- CreateIndex
CREATE INDEX "WorkoutTemplate_userId_idx" ON "WorkoutTemplate"("userId");

-- CreateIndex
CREATE INDEX "WorkoutTemplate_folderId_idx" ON "WorkoutTemplate"("folderId");

-- CreateIndex
CREATE INDEX "WorkoutTemplateExercise_templateId_orderIndex_idx" ON "WorkoutTemplateExercise"("templateId", "orderIndex");

-- CreateIndex
CREATE INDEX "WorkoutTemplateExercise_exerciseId_idx" ON "WorkoutTemplateExercise"("exerciseId");

-- CreateIndex
CREATE INDEX "StretchingRoutine_userId_idx" ON "StretchingRoutine"("userId");

-- CreateIndex
CREATE INDEX "StretchingRoutineExercise_routineId_orderIndex_idx" ON "StretchingRoutineExercise"("routineId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutSession_clientSessionId_key" ON "WorkoutSession"("clientSessionId");

-- CreateIndex
CREATE INDEX "WorkoutSession_userId_startedAt_idx" ON "WorkoutSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "WorkoutSession_userId_status_idx" ON "WorkoutSession"("userId", "status");

-- CreateIndex
CREATE INDEX "WorkoutSession_templateId_idx" ON "WorkoutSession"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionExercise_clientExerciseId_key" ON "SessionExercise"("clientExerciseId");

-- CreateIndex
CREATE INDEX "SessionExercise_sessionId_orderIndex_idx" ON "SessionExercise"("sessionId", "orderIndex");

-- CreateIndex
CREATE INDEX "SessionExercise_exerciseId_idx" ON "SessionExercise"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionSet_clientSetId_key" ON "SessionSet"("clientSetId");

-- CreateIndex
CREATE INDEX "SessionSet_sessionExerciseId_setNumber_idx" ON "SessionSet"("sessionExerciseId", "setNumber");

-- CreateIndex
CREATE INDEX "ImportJob_userId_createdAt_idx" ON "ImportJob"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserPreferences" ADD CONSTRAINT "UserPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseMuscleGroup" ADD CONSTRAINT "ExerciseMuscleGroup_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseAlternative" ADD CONSTRAINT "ExerciseAlternative_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseAlternative" ADD CONSTRAINT "ExerciseAlternative_alternativeExerciseId_fkey" FOREIGN KEY ("alternativeExerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseMedia" ADD CONSTRAINT "ExerciseMedia_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutFolder" ADD CONSTRAINT "WorkoutFolder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutTemplate" ADD CONSTRAINT "WorkoutTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutTemplate" ADD CONSTRAINT "WorkoutTemplate_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "WorkoutFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutTemplateExercise" ADD CONSTRAINT "WorkoutTemplateExercise_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutTemplateExercise" ADD CONSTRAINT "WorkoutTemplateExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StretchingRoutine" ADD CONSTRAINT "StretchingRoutine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StretchingRoutineExercise" ADD CONSTRAINT "StretchingRoutineExercise_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "StretchingRoutine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StretchingRoutineExercise" ADD CONSTRAINT "StretchingRoutineExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_stretchingRoutineId_fkey" FOREIGN KEY ("stretchingRoutineId") REFERENCES "StretchingRoutine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionExercise" ADD CONSTRAINT "SessionExercise_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionExercise" ADD CONSTRAINT "SessionExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSet" ADD CONSTRAINT "SessionSet_sessionExerciseId_fkey" FOREIGN KEY ("sessionExerciseId") REFERENCES "SessionExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

Done in 1.28s.
