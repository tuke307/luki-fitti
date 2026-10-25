import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExerciseService } from './exercise.service';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { RequestLocale } from '@/decorators/request-locale.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import {
  ExerciseQuerySchema,
  CreateExerciseSchema,
  UpdateExerciseSchema,
  type ExerciseQueryDto,
  type CreateExerciseDto,
  type UpdateExerciseDto,
  type ExerciseDto,
} from '@luki-fitti/common/schemas';
import type { SupportedLocale } from '@luki-fitti/common/enums';

@ApiTags('Exercise Library')
@Controller('exercises')
@UseGuards(AuthGuard)
export class ExerciseController {
  constructor(private readonly exerciseService: ExerciseService) {}

  @Get()
  @ApiOperation({ summary: 'Search and filter the exercise and stretching library' })
  async getAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ExerciseQuerySchema)) query: ExerciseQueryDto,
    @RequestLocale() locale: SupportedLocale,
  ): Promise<ExerciseDto[]> {
    return this.exerciseService.findAll(user.id, query, locale);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single exercise details with muscle groups and alternatives' })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @RequestLocale() locale: SupportedLocale,
  ): Promise<ExerciseDto> {
    return this.exerciseService.findById(user.id, id, locale);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Create a custom user exercise' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateExerciseSchema)) body: CreateExerciseDto,
    @RequestLocale() locale: SupportedLocale,
  ): Promise<ExerciseDto> {
    return this.exerciseService.createCustom(user.id, body, locale);
  }

  @Put(':id')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Update a custom user exercise' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateExerciseSchema)) body: UpdateExerciseDto,
    @RequestLocale() locale: SupportedLocale,
  ): Promise<ExerciseDto> {
    return this.exerciseService.updateCustom(user.id, id, body, locale);
  }

  @Delete(':id')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Delete a custom user exercise' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.exerciseService.deleteCustom(user.id, id);
  }
}
