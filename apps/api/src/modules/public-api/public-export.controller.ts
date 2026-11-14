import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyScope } from '@luki-fitti/common/enums';
import { ImportFileSchema } from '@luki-fitti/common/schemas';
import type { ImportFile } from '@luki-fitti/common/schemas';
import { ApiScope } from '@/decorators/api-scope.decorator';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { RequestLocale } from '@/decorators/request-locale.decorator';
import type { SupportedLocale } from '@luki-fitti/common/enums';
import { getRedis } from '@/utils/redis.util';
import { incrementUserCounter } from '@/utils/rate-limit.util';
import { ApiPublicErrors, jsonSchemaOf } from './swagger.util';
import { ApiKeyGuard } from './api-key.guard';
import { ScopesGuard } from './scopes.guard';
import { ApiKeyRateLimitGuard } from './api-key-rate-limit.guard';
import { PublicApiExceptionFilter } from './public-api.filter';
import { PublicExportService } from './export.service';

const EXPORT_DAILY_LIMIT = 5;
const EXPORT_WINDOW_SECONDS = 86_400;

@ApiTags('Public API v1')
@ApiPublicErrors()
@ApiBearerAuth()
@Controller('v1')
@UseGuards(ApiKeyGuard, ScopesGuard, ApiKeyRateLimitGuard)
@UseFilters(PublicApiExceptionFilter)
export class PublicExportController {
  constructor(private readonly exports: PublicExportService) {}

  /** Overridable in tests (avoids a Redis connection). */
  public increment = async (key: string, windowSeconds: number): Promise<number> =>
    incrementUserCounter(key, windowSeconds);
  public ttl = async (key: string): Promise<number> => getRedis().ttl(key);

  @Get('export')
  @ApiScope(ApiKeyScope.EXPORT)
  @ApiOperation({
    summary: 'Full workout backup as a luki-fitti-import@1 file',
    description:
      'Requires the `export` scope. Limited to 5 downloads per day per user. ' +
      'The format covers workouts only (custom exercises, folders, templates, completed ' +
      'sessions); meals, body weight, check-ins and activity are available on their own ' +
      'endpoints. The file can be re-imported in the app or via POST /api/import/commit.',
  })
  @ApiOkResponse({ schema: jsonSchemaOf(ImportFileSchema) })
  async export(
    @CurrentUser() user: AuthenticatedUser,
    @RequestLocale() locale: SupportedLocale,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ImportFile> {
    const key = `apikey:export:${user.id}`;
    const count = await this.increment(key, EXPORT_WINDOW_SECONDS);
    if (count > EXPORT_DAILY_LIMIT) {
      const ttl = Math.max(1, await this.ttl(key));
      response.setHeader('Retry-After', String(ttl));
      throw new HttpException(
        { message: 'Export rate limit exceeded', code: 'rate_limited' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const file = await this.exports.buildExport(user.id, locale);
    const dateStamp = new Date().toISOString().slice(0, 10);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="luki-fitti-export-${dateStamp}.json"`,
    );
    return file;
  }
}
