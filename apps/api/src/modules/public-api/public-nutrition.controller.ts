import { Controller, Get, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyScope } from '@luki-fitti/common/enums';
import {
  PublicRangeQuerySchema,
  type PublicListDto,
  type PublicMealEntryDto,
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
export class PublicNutritionController {
  constructor(private readonly publicApi: PublicApiService) {}

  @Get('meals')
  @ApiScope(ApiKeyScope.READ_NUTRITION)
  @ApiOperation({ summary: 'Meal entries with items (no photos)' })
  listMeals(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(PublicRangeQuerySchema)) query: PublicRangeQueryDto,
  ): Promise<PublicListDto<PublicMealEntryDto>> {
    return this.publicApi.listMeals(user.id, query);
  }
}
