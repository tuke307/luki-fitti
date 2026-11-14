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
import { ProgressModule } from './modules/progress/progress.module';
import { ActivityModule } from './modules/activity/activity.module';
import { AiModule } from './modules/ai/ai.module';
import { ImportModule } from './modules/import/import.module';
import { SocialModule } from './modules/social/social.module';
import { SocialAccessModule } from './modules/social/social-access.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PushModule } from './modules/push/push.module';
import { LeagueModule } from './modules/league/league.module';
import { BattleModule } from './modules/battle/battle.module';
import { RaidModule } from './modules/raid/raid.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { PublicApiModule } from './modules/public-api/public-api.module';
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
    ProgressModule,
    ActivityModule,
    AiModule,
    ImportModule,
    SocialAccessModule,
    SocialModule,
    NotificationsModule,
    PushModule,
    LeagueModule,
    BattleModule,
    RaidModule,
    ApiKeysModule,
    PublicApiModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
