import { Controller, Get, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyScope } from '@luki-fitti/common/enums';
import {
  PublicRangeQuerySchema,
  type PublicActivityWorkoutDto,
  type PublicDailyEnergyDto,
  type PublicListDto,
  type PublicRangeQueryDto,
} from '@luki-fitti/common/schemas';
import { ApiScope } from '@/decorators/api-scope.decorator';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { ApiKeyGuard } from './api-key.guard';
import { ScopesGuard } from './scopes.guard';
import { ApiKeyRateLimitGuard } from './api-key-rate-limit.guard';
import { PublicApiExceptionFilter } from './public-api.filter';
import { PublicApiService } from './public-api.service';

@ApiTags('Public API v1')
@ApiBearerAuth()
@Controller('v1')
@UseGuards(ApiKeyGuard, ScopesGuard, ApiKeyRateLimitGuard)
@UseFilters(PublicApiExceptionFilter)
export class PublicActivityController {
  constructor(private readonly publicApi: PublicApiService) {}

  @Get('activity/daily-energy')
  @ApiScope(ApiKeyScope.READ_ACTIVITY)
  @ApiOperation({ summary: 'Apple Health active energy per device-local day' })
  listDailyEnergy(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(PublicRangeQuerySchema)) query: PublicRangeQueryDto,
  ): Promise<PublicListDto<PublicDailyEnergyDto>> {
    return this.publicApi.listDailyEnergy(user.id, query);
  }

  @Get('activity/workouts')
  @ApiScope(ApiKeyScope.READ_ACTIVITY)
  @ApiOperation({ summary: 'Imported Apple Health workouts' })
  listActivityWorkouts(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(PublicRangeQuerySchema)) query: PublicRangeQueryDto,
  ): Promise<PublicListDto<PublicActivityWorkoutDto>> {
    return this.publicApi.listActivityWorkouts(user.id, query);
  }
}
