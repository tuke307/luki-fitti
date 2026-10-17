import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ImportService } from './import.service';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import {
  ImportPreviewRequestSchema,
  ImportCommitRequestSchema,
  type ImportPreviewRequestDto,
  type ImportCommitRequestDto,
} from '@luki-fitti/common/schemas';

@ApiTags('Gymlife & Workout Data Import')
@Controller('import')
@UseGuards(AuthGuard)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('preview')
  @UseGuards(CsrfGuard)
  @ApiOperation({
    summary:
      'Validate and preview a Gymlife CSV/JSON or Apple Health workout export before importing',
  })
  async preview(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(ImportPreviewRequestSchema)) body: ImportPreviewRequestDto,
  ) {
    return this.importService.previewImport(user.id, body);
  }

  @Post('commit')
  @UseGuards(CsrfGuard)
  @ApiOperation({
    summary:
      'Commit workout import with exercise mappings, custom exercise creation, and duplicate detection',
  })
  async commit(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(ImportCommitRequestSchema)) body: ImportCommitRequestDto,
  ) {
    return this.importService.commitImport(user.id, body);
  }

  @Get('jobs')
  @ApiOperation({ summary: 'List historical import jobs for the authenticated user' })
  async listJobs(@CurrentUser() user: AuthenticatedUser) {
    return this.importService.listImportJobs(user.id);
  }
}
