import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { AuthGuard } from '@/guards/auth.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import {
  AnalyticsQuerySchema,
  type AnalyticsQueryDto,
  type AnalyticsSummaryDto,
} from '@luki-fitti/common/schemas';

@ApiTags('Training Diary & Progress Analytics')
@Controller('analytics')
@UseGuards(AuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  @ApiOperation({
    summary:
      'Get training frequency, strength volume, stretching duration, muscle distribution, and PRs',
  })
  async getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(AnalyticsQuerySchema)) query: AnalyticsQueryDto,
  ): Promise<AnalyticsSummaryDto> {
    return this.analyticsService.getSummary(user.id, query);
  }
}
