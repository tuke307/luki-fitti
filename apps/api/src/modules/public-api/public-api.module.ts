import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { WorkoutModule } from '../workout/workout.module';
import { SessionModule } from '../session/session.module';
import { ExerciseModule } from '../exercise/exercise.module';
import { ApiKeyGuard } from './api-key.guard';
import { ScopesGuard } from './scopes.guard';
import { ApiKeyRateLimitGuard } from './api-key-rate-limit.guard';
import { PublicApiService } from './public-api.service';
import { PublicExportService } from './export.service';
import { PublicProfileController } from './public-profile.controller';
import { PublicSessionsController } from './public-sessions.controller';
import { PublicWorkoutsController } from './public-workouts.controller';
import { PublicNutritionController } from './public-nutrition.controller';
import { PublicBodyController } from './public-body.controller';
import { PublicActivityController } from './public-activity.controller';
import { PublicExportController } from './public-export.controller';

@Module({
  imports: [AnalyticsModule, WorkoutModule, SessionModule, ExerciseModule],
  controllers: [
    PublicProfileController,
    PublicSessionsController,
    PublicWorkoutsController,
    PublicNutritionController,
    PublicBodyController,
    PublicActivityController,
    PublicExportController,
  ],
  providers: [
    ApiKeyGuard,
    ScopesGuard,
    ApiKeyRateLimitGuard,
    PublicApiService,
    PublicExportService,
  ],
})
export class PublicApiModule {}
