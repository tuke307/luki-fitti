import { Controller, Get, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyScope } from '@luki-fitti/common/enums';
import {
  PublicListQuerySchema,
  PublicRangeQuerySchema,
  type PublicBodyWeightEntryDto,
  type PublicListDto,
  type PublicListQueryDto,
  type PublicProgressCheckInDto,
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
export class PublicBodyController {
  constructor(private readonly publicApi: PublicApiService) {}

  @Get('body-weight')
  @ApiScope(ApiKeyScope.READ_BODY)
  @ApiOperation({ summary: 'Body weight entries (kg)' })
  listBodyWeight(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(PublicRangeQuerySchema)) query: PublicRangeQueryDto,
  ): Promise<PublicListDto<PublicBodyWeightEntryDto>> {
    return this.publicApi.listBodyWeight(user.id, query);
  }

  @Get('progress/check-ins')
  @ApiScope(ApiKeyScope.READ_BODY)
  @ApiOperation({ summary: 'Progress check-ins (metadata only, no photo URLs)' })
  listProgressCheckIns(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(PublicListQuerySchema)) query: PublicListQueryDto,
  ): Promise<PublicListDto<PublicProgressCheckInDto>> {
    return this.publicApi.listProgressCheckIns(user.id, query);
  }
}
