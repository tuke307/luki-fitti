import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import prisma from '@luki-fitti/database';
import { logger } from '@luki-fitti/logger';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  get client(): typeof prisma {
    return prisma;
  }

  async onModuleInit() {
    try {
      await prisma.$connect();
      logger.info('Prisma client connected successfully');
    } catch (error) {
      logger.warn('Database not reachable at startup (continuing in resilient mode):', error);
    }
  }

  async onModuleDestroy() {
    try {
      await prisma.$disconnect();
      logger.info('Prisma client disconnected successfully');
    } catch (error) {
      logger.error('Error disconnecting from database:', error);
    }
  }

  get $transaction(): typeof prisma.$transaction {
    return prisma.$transaction.bind(prisma);
  }

  get $queryRaw(): typeof prisma.$queryRaw {
    return prisma.$queryRaw.bind(prisma);
  }

  get $executeRaw(): typeof prisma.$executeRaw {
    return prisma.$executeRaw.bind(prisma);
  }

  get user(): typeof prisma.user {
    return prisma.user;
  }

  get userPreferences(): typeof prisma.userPreferences {
    return prisma.userPreferences;
  }

  get refreshToken(): typeof prisma.refreshToken {
    return prisma.refreshToken;
  }

  get exercise(): typeof prisma.exercise {
    return prisma.exercise;
  }

  get exerciseMuscleGroup(): typeof prisma.exerciseMuscleGroup {
    return prisma.exerciseMuscleGroup;
  }

  get exerciseAlternative(): typeof prisma.exerciseAlternative {
    return prisma.exerciseAlternative;
  }

  get exerciseMedia(): typeof prisma.exerciseMedia {
    return prisma.exerciseMedia;
  }

  get workoutFolder(): typeof prisma.workoutFolder {
    return prisma.workoutFolder;
  }

  get workoutTemplate(): typeof prisma.workoutTemplate {
    return prisma.workoutTemplate;
  }

  get workoutTemplateExercise(): typeof prisma.workoutTemplateExercise {
    return prisma.workoutTemplateExercise;
  }

  get stretchingRoutine(): typeof prisma.stretchingRoutine {
    return prisma.stretchingRoutine;
  }

  get stretchingRoutineExercise(): typeof prisma.stretchingRoutineExercise {
    return prisma.stretchingRoutineExercise;
  }

  get workoutSession(): typeof prisma.workoutSession {
    return prisma.workoutSession;
  }

  get sessionExercise(): typeof prisma.sessionExercise {
    return prisma.sessionExercise;
  }

  get sessionSet(): typeof prisma.sessionSet {
    return prisma.sessionSet;
  }

  get emailTemplate(): typeof prisma.emailTemplate {
    return prisma.emailTemplate;
  }

  get email(): typeof prisma.email {
    return prisma.email;
  }

  get appSettings(): typeof prisma.appSettings {
    return prisma.appSettings;
  }

  get aiRun(): typeof prisma.aiRun {
    return prisma.aiRun;
  }

  /** Encrypted per-user OpenRouter keys — only AiKeyService may select ciphertext columns. */
  get userAiKey(): typeof prisma.userAiKey {
    return prisma.userAiKey;
  }

  get exerciseFeedback(): typeof prisma.exerciseFeedback {
    return prisma.exerciseFeedback;
  }

  get mealEntry(): typeof prisma.mealEntry {
    return prisma.mealEntry;
  }

  get mealItem(): typeof prisma.mealItem {
    return prisma.mealItem;
  }

  get mealPhoto(): typeof prisma.mealPhoto {
    return prisma.mealPhoto;
  }

  get bodyWeightEntry(): typeof prisma.bodyWeightEntry {
    return prisma.bodyWeightEntry;
  }

  get progressCheckIn(): typeof prisma.progressCheckIn {
    return prisma.progressCheckIn;
  }

  get progressPhoto(): typeof prisma.progressPhoto {
    return prisma.progressPhoto;
  }

  get healthDailyEnergy(): typeof prisma.healthDailyEnergy {
    return prisma.healthDailyEnergy;
  }

  get healthWorkout(): typeof prisma.healthWorkout {
    return prisma.healthWorkout;
  }

  get importJob(): typeof prisma.importJob {
    return prisma.importJob;
  }

  get friendship(): typeof prisma.friendship {
    return prisma.friendship;
  }

  get friendInvite(): typeof prisma.friendInvite {
    return prisma.friendInvite;
  }

  get userBlock(): typeof prisma.userBlock {
    return prisma.userBlock;
  }

  get userReport(): typeof prisma.userReport {
    return prisma.userReport;
  }

  get pushDevice(): typeof prisma.pushDevice {
    return prisma.pushDevice;
  }

  get notification(): typeof prisma.notification {
    return prisma.notification;
  }

  get effortPointEntry(): typeof prisma.effortPointEntry {
    return prisma.effortPointEntry;
  }

  get weeklyScore(): typeof prisma.weeklyScore {
    return prisma.weeklyScore;
  }

  get leagueWeek(): typeof prisma.leagueWeek {
    return prisma.leagueWeek;
  }

  get leagueCohort(): typeof prisma.leagueCohort {
    return prisma.leagueCohort;
  }

  get leagueMembership(): typeof prisma.leagueMembership {
    return prisma.leagueMembership;
  }
}
