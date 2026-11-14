import { Controller, Get, Param, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyScope } from '@luki-fitti/common/enums';
import {
  PublicSessionListQuerySchema,
  type PublicListDto,
  type PublicPersonalRecordDto,
  type PublicSessionDto,
  type PublicSessionListItemDto,
  type PublicSessionListQueryDto,
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
export class PublicSessionsController {
  constructor(private readonly publicApi: PublicApiService) {}

  @Get('sessions')
  @ApiScope(ApiKeyScope.READ_SESSIONS)
  @ApiOperation({
    summary: 'Workout sessions, cursor-paginated',
    description:
      'Summary rows by default. `include=exercises` returns full sessions with ' +
      'exercises and sets (limit capped at 50) for tools that need sets without ' +
      'one request per session.',
  })
  listSessions(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(PublicSessionListQuerySchema)) query: PublicSessionListQueryDto,
  ): Promise<PublicListDto<PublicSessionListItemDto | PublicSessionDto>> {
    return this.publicApi.listSessions(user.id, query);
  }

  @Get('sessions/:id')
  @ApiScope(ApiKeyScope.READ_SESSIONS)
  @ApiOperation({ summary: 'One workout session with exercises and sets' })
  getSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<PublicSessionDto> {
    return this.publicApi.getSession(user.id, id);
  }

  @Get('personal-records')
  @ApiScope(ApiKeyScope.READ_SESSIONS)
  @ApiOperation({ summary: 'Personal records computed from completed sessions' })
  async listPersonalRecords(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PublicListDto<PublicPersonalRecordDto>> {
    // Computed on the fly from sets — bounded by exercise count, not paginated.
    return { data: await this.publicApi.listPersonalRecords(user.id), nextCursor: null };
  }
}
