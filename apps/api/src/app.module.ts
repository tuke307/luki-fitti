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
import { ImportModule } from './modules/import/import.module';
import { HealthModule } from './modules/health/health.module';
import { BullMQModule } from './modules/bullmq/bullmq.module';
import { EmailTemplateModule } from './modules/email-template/email-template.module';
import { EmailModule } from './modules/email/email.module';
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
    BullMQModule,
    EmailTemplateModule,
    EmailModule,
    AuthModule,
    ExerciseModule,
    WorkoutModule,
    SessionModule,
    StretchingModule,
    AnalyticsModule,
    ImportModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
