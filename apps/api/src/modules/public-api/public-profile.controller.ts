import { Controller, Get, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyScope } from '@luki-fitti/common/enums';
import type { PublicMeDto } from '@luki-fitti/common/schemas';
import { ApiScope } from '@/decorators/api-scope.decorator';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
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
export class PublicProfileController {
  constructor(private readonly publicApi: PublicApiService) {}

  @Get('me')
  @ApiScope(ApiKeyScope.READ_PROFILE)
  @ApiOperation({ summary: 'Own profile: id, name, handle, units and goals (never email)' })
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<PublicMeDto> {
    return this.publicApi.getMe(user.id);
  }
}
