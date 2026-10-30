-- CreateTable
CREATE TABLE "HealthDailyEnergy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "activeKcal" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthDailyEnergy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthWorkout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "healthKitUuid" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "isOwn" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "activeKcal" DOUBLE PRECISION,
    "distanceMeters" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthWorkout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthDailyEnergy_userId_day_key" ON "HealthDailyEnergy"("userId", "day");

-- CreateIndex
CREATE INDEX "HealthWorkout_userId_startedAt_idx" ON "HealthWorkout"("userId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HealthWorkout_userId_healthKitUuid_key" ON "HealthWorkout"("userId", "healthKitUuid");

-- AddForeignKey
ALTER TABLE "HealthDailyEnergy" ADD CONSTRAINT "HealthDailyEnergy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthWorkout" ADD CONSTRAINT "HealthWorkout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
