import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { RequestLocale } from '@/decorators/request-locale.decorator';
import type { SupportedLocale } from '@luki-fitti/common/enums';
import { ImportService } from './import.service';
import { ImportRateLimitGuard, ImportRateLimited } from './import-rate-limit.guard';

/**
 * File import (`luki-fitti-import@1`). The body is the file itself (JSON, up to 10 MB; see
 * import-body-parser.ts). It is validated by ImportService and never stored or logged.
 */
@ApiTags('Data Import')
@Controller('import')
@UseGuards(AuthGuard, CsrfGuard, ImportRateLimitGuard)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ImportRateLimited({ name: 'import-preview', limit: 20 })
  @ApiOperation({ summary: 'Validate an import file and report what an import would create' })
  async preview(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @RequestLocale() locale: SupportedLocale,
  ) {
    return this.importService.preview(user.id, body, locale);
  }

  @Post('commit')
  @HttpCode(HttpStatus.OK)
  @ImportRateLimited({ name: 'import-commit', limit: 5 })
  @ApiOperation({ summary: 'Import a file; rows that already exist are skipped' })
  async commit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @RequestLocale() locale: SupportedLocale,
  ) {
    return this.importService.commit(user.id, body, locale);
  }
}
