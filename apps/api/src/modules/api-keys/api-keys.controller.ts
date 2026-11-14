import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreateApiKeySchema,
  type ApiKeyListDto,
  type CreateApiKeyDto,
  type CreatedApiKeyDto,
} from '@luki-fitti/common/schemas';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { ApiKeysService } from './api-keys.service';

/**
 * Session-authenticated key management for the app UI. The public read API
 * these keys unlock lives in `modules/public-api` (`/api/v1`) and never goes
 * through `AuthGuard`.
 */
@ApiTags('API Keys')
@Controller('api-keys')
@UseGuards(AuthGuard)
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  @ApiOperation({ summary: 'List the user’s API keys (expired ones for 30 days)' })
  list(@CurrentUser() user: AuthenticatedUser): Promise<ApiKeyListDto> {
    return this.apiKeys.list(user.id);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Create an API key (password re-auth required, shown once)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateApiKeySchema)) body: CreateApiKeyDto,
  ): Promise<CreatedApiKeyDto> {
    return this.apiKeys.create(user.id, body);
  }

  @Delete(':id')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Revoke an API key (works while the feature is disabled)' })
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    return this.apiKeys.revoke(user.id, id);
  }
}
