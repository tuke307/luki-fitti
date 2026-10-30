import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './modules/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { ExerciseModule } from './modules/exercise/exercise.module';
import { WorkoutModule } from './modules/workout/workout.module';
import { SessionModule } from './modules/session/session.module';
import { StretchingModule } from './modules/stretching/stretching.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { HealthModule } from './modules/health/health.module';
import { WebAnalyticsModule } from './modules/web-analytics/web-analytics.module';
import { BullMQModule } from './modules/bullmq/bullmq.module';
import { EmailTemplateModule } from './modules/email-template/email-template.module';
import { EmailModule } from './modules/email/email.module';
import { AppSettingsModule } from './modules/app-settings/app-settings.module';
import { AdminModule } from './modules/admin/admin.module';
import { StorageModule } from './modules/storage/storage.module';
import { NutritionModule } from './modules/nutrition/nutrition.module';
import { BodyWeightModule } from './modules/body-weight/body-weight.module';
import { ActivityModule } from './modules/activity/activity.module';
import { AiModule } from './modules/ai/ai.module';
import { NODE_ENV } from './config/env.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60 * 1000,
        limit: NODE_ENV === 'production' ? 300 : 1000,
      },
    ]),
    DatabaseModule,
    AppSettingsModule,
    StorageModule,
    BullMQModule,
    EmailTemplateModule,
    EmailModule,
    AuthModule,
    ExerciseModule,
    WorkoutModule,
    SessionModule,
    StretchingModule,
    AnalyticsModule,
    WebAnalyticsModule,
    HealthModule,
    AdminModule,
    NutritionModule,
    BodyWeightModule,
    ActivityModule,
    AiModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
