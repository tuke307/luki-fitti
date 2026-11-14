import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ApiKeyGuard } from './api-key.guard';
import { ScopesGuard } from './scopes.guard';
import { ApiKeyRateLimitGuard } from './api-key-rate-limit.guard';
import { PublicApiService } from './public-api.service';
import { PublicProfileController } from './public-profile.controller';
import { PublicSessionsController } from './public-sessions.controller';
import { PublicWorkoutsController } from './public-workouts.controller';
import { PublicNutritionController } from './public-nutrition.controller';
import { PublicBodyController } from './public-body.controller';
import { PublicActivityController } from './public-activity.controller';

@Module({
  imports: [AnalyticsModule],
  controllers: [
    PublicProfileController,
    PublicSessionsController,
    PublicWorkoutsController,
    PublicNutritionController,
    PublicBodyController,
    PublicActivityController,
  ],
  providers: [ApiKeyGuard, ScopesGuard, ApiKeyRateLimitGuard, PublicApiService],
})
export class PublicApiModule {}
