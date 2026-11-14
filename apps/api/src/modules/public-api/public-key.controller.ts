import { Controller, ForbiddenException, Get, Req, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiKeyScope } from '@luki-fitti/common/enums';
import type { PublicKeyDto } from '@luki-fitti/common/schemas';
import { ApiScope } from '@/decorators/api-scope.decorator';
import { AppSettingsService } from '@/modules/app-settings/app-settings.service';
import { ApiKeyGuard, type RequestApiKey } from './api-key.guard';
import { ScopesGuard } from './scopes.guard';
import { ApiKeyRateLimitGuard } from './api-key-rate-limit.guard';
import { PublicApiExceptionFilter } from './public-api.filter';

/**
 * `GET /v1/key` — introspection for the presented key. The MCP server calls
 * this to learn a key's scopes and expiry; it is also the MCP kill switch:
 * while `mcpEnabled` is off it answers 403 `mcp_disabled`.
 */
@ApiTags('Public API v1')
@ApiBearerAuth()
@Controller('v1')
@UseGuards(ApiKeyGuard, ScopesGuard, ApiKeyRateLimitGuard)
@UseFilters(PublicApiExceptionFilter)
export class PublicKeyController {
  constructor(private readonly appSettings: AppSettingsService) {}

  @Get('key')
  @ApiScope(ApiKeyScope.MCP)
  @ApiOperation({ summary: 'Introspect the presented API key (id, scopes, expiry)' })
  async getKey(@Req() request: Request & { apiKey?: RequestApiKey }): Promise<PublicKeyDto> {
    const settings = await this.appSettings.get();
    if (!settings.mcpEnabled) {
      throw new ForbiddenException({
        message: 'AI assistant access is disabled',
        code: 'mcp_disabled',
      });
    }
    const apiKey = request.apiKey!;
    return { id: apiKey.id, scopes: apiKey.scopes, expiresAt: apiKey.expiresAt };
  }
}
