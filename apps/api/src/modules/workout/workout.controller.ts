import { Controller, Get, Post, Put, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { WorkoutService } from './workout.service';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { RequestLocale } from '@/decorators/request-locale.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import {
  CreateFolderSchema,
  UpdateFolderSchema,
  CreateTemplateSchema,
  UpdateTemplateSchema,
  MoveTemplateSchema,
  type CreateFolderDto,
  type UpdateFolderDto,
  type CreateTemplateDto,
  type UpdateTemplateDto,
  type MoveTemplateDto,
} from '@luki-fitti/common/schemas';
import type { SupportedLocale } from '@luki-fitti/common/enums';

@ApiTags('Workout Folders & Templates')
@Controller('workouts')
@UseGuards(AuthGuard)
export class WorkoutController {
  constructor(private readonly workoutService: WorkoutService) {}

  @Get()
  @ApiOperation({ summary: 'Get all user folders and workout templates' })
  async getOverview(
    @CurrentUser() user: AuthenticatedUser,
    @RequestLocale() locale: SupportedLocale,
  ) {
    return this.workoutService.getOverview(user.id, locale);
  }

  @Post('folders')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Create a one-level workout folder' })
  async createFolder(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateFolderSchema)) body: CreateFolderDto,
  ) {
    return this.workoutService.createFolder(user.id, body);
  }

  @Put('folders/:id')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Rename or update a workout folder' })
  async updateFolder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateFolderSchema)) body: UpdateFolderDto,
    @RequestLocale() locale: SupportedLocale,
  ) {
    return this.workoutService.updateFolder(user.id, id, body, locale);
  }

  @Delete('folders/:id')
  @UseGuards(CsrfGuard)
  @ApiOperation({
    summary: 'Delete a workout folder (moves templates to unfiled; preserves history)',
  })
  async deleteFolder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.workoutService.deleteFolder(user.id, id);
  }

  @Get('templates/:id')
  @ApiOperation({ summary: 'Get a single workout template by ID' })
  async getTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @RequestLocale() locale: SupportedLocale,
  ) {
    return this.workoutService.getTemplateById(user.id, id, locale);
  }

  @Post('templates')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Create a workout template with ordered exercises and alternatives' })
  async createTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateTemplateSchema)) body: CreateTemplateDto,
    @RequestLocale() locale: SupportedLocale,
  ) {
    return this.workoutService.createTemplate(user.id, body, locale);
  }

  @Put('templates/:id')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Update a workout template and its ordered exercises' })
  async updateTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTemplateSchema)) body: UpdateTemplateDto,
    @RequestLocale() locale: SupportedLocale,
  ) {
    return this.workoutService.updateTemplate(user.id, id, body, locale);
  }

  @Post('templates/:id/duplicate')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Duplicate an existing workout template' })
  async duplicateTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @RequestLocale() locale: SupportedLocale,
  ) {
    return this.workoutService.duplicateTemplate(user.id, id, locale);
  }

  @Patch('templates/:id/move')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Move a workout template into a folder or unfiled' })
  async moveTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(MoveTemplateSchema)) body: MoveTemplateDto,
    @RequestLocale() locale: SupportedLocale,
  ) {
    return this.workoutService.moveTemplate(user.id, id, body.folderId, locale);
  }

  @Delete('templates/:id')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Delete a workout template without deleting historical sessions' })
  async deleteTemplate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.workoutService.deleteTemplate(user.id, id);
  }
}
