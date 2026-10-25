import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StretchingService } from './stretching.service';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { RequestLocale } from '@/decorators/request-locale.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import {
  CreateStretchingRoutineSchema,
  UpdateStretchingRoutineSchema,
  type CreateStretchingRoutineDto,
  type UpdateStretchingRoutineDto,
} from '@luki-fitti/common/schemas';
import type { SupportedLocale } from '@luki-fitti/common/enums';

@ApiTags('Stretching & Mobility Routines')
@Controller('stretching')
@UseGuards(AuthGuard)
export class StretchingController {
  constructor(private readonly stretchingService: StretchingService) {}

  @Get('routines')
  @ApiOperation({ summary: 'List all user stretching and mobility routines' })
  async getAll(@CurrentUser() user: AuthenticatedUser, @RequestLocale() locale: SupportedLocale) {
    return this.stretchingService.findAll(user.id, locale);
  }

  @Get('routines/:id')
  @ApiOperation({ summary: 'Get stretching routine by ID' })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @RequestLocale() locale: SupportedLocale,
  ) {
    return this.stretchingService.findById(user.id, id, locale);
  }

  @Post('routines')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Create a dedicated stretching or mobility routine' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateStretchingRoutineSchema)) body: CreateStretchingRoutineDto,
    @RequestLocale() locale: SupportedLocale,
  ) {
    return this.stretchingService.create(user.id, body, locale);
  }

  @Put('routines/:id')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Update a stretching or mobility routine' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateStretchingRoutineSchema)) body: UpdateStretchingRoutineDto,
    @RequestLocale() locale: SupportedLocale,
  ) {
    return this.stretchingService.update(user.id, id, body, locale);
  }

  @Delete('routines/:id')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Delete a stretching routine without deleting historical sessions' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.stretchingService.delete(user.id, id);
  }
}
