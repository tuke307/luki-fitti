import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  MealEntryRangeQuerySchema,
  NutritionSummaryQuerySchema,
  UpsertMealEntrySchema,
  type MealEntryRangeQueryDto,
  type NutritionSummaryQueryDto,
  type UpsertMealEntryDto,
} from '@luki-fitti/common/schemas';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { NutritionService } from './nutrition.service';

/** Manual calorie & macro tracking: available to every signed-in user. */
@ApiTags('Nutrition')
@Controller('nutrition')
@UseGuards(AuthGuard)
export class NutritionController {
  constructor(private readonly nutritionService: NutritionService) {}

  @Get('entries')
  @ApiOperation({ summary: 'List meal entries eaten in [from, to)' })
  listEntries(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(MealEntryRangeQuerySchema)) query: MealEntryRangeQueryDto,
  ) {
    return this.nutritionService.listEntries(user.id, query.from, query.to);
  }

  @Put('entries')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Create or replace a meal entry by its client id (offline-safe)' })
  upsertEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(UpsertMealEntrySchema)) body: UpsertMealEntryDto,
  ) {
    return this.nutritionService.upsertEntry(user.id, body);
  }

  @Get('entries/:id')
  @ApiOperation({ summary: 'Get one meal entry' })
  getEntry(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.nutritionService.getEntry(user.id, id);
  }

  @Delete('entries/:id')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Delete a meal entry including its photos' })
  deleteEntry(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.nutritionService.deleteEntry(user.id, id);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Daily intake vs. burned calories for local dates [from, to]' })
  getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(NutritionSummaryQuerySchema)) query: NutritionSummaryQueryDto,
  ) {
    return this.nutritionService.getSummary(user.id, query.from, query.to, query.tz);
  }

  @Get('recent-items')
  @ApiOperation({ summary: 'Recently logged foods for quick re-logging' })
  getRecentItems(@CurrentUser() user: AuthenticatedUser) {
    return this.nutritionService.getRecentItems(user.id);
  }

  @Get('photos/:id')
  @ApiOperation({ summary: "Stream one of the user's meal photos" })
  async getPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const photo = await this.nutritionService.getPhoto(user.id, id);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Stored objects are always re-encoded JPEGs; never echo an arbitrary stored content type.
    return new StreamableFile(photo.body, { type: 'image/jpeg', disposition: 'inline' });
  }

  @Delete('photos/:id')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Delete a single meal photo' })
  deletePhoto(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.nutritionService.deletePhoto(user.id, id);
  }
}
