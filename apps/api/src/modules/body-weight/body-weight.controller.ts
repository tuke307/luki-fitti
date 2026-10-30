import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  BodyWeightRangeQuerySchema,
  ImportBodyWeightSchema,
  UpsertBodyWeightEntrySchema,
  type BodyWeightRangeQueryDto,
  type ImportBodyWeightDto,
  type UpsertBodyWeightEntryDto,
} from '@luki-fitti/common/schemas';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { BodyWeightService } from './body-weight.service';

/** Body weight history (manual weigh-ins and Apple Health imports): every signed-in user. */
@ApiTags('Body Weight')
@Controller('body-weight')
@UseGuards(AuthGuard)
export class BodyWeightController {
  constructor(private readonly bodyWeightService: BodyWeightService) {}

  @Get('entries')
  @ApiOperation({ summary: 'List weigh-ins measured in [from, to], oldest first' })
  listEntries(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(BodyWeightRangeQuerySchema)) query: BodyWeightRangeQueryDto,
  ) {
    return this.bodyWeightService.listEntries(user.id, query.from, query.to);
  }

  @Put('entries')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Create or replace a weigh-in by its client id (offline-safe)' })
  upsertEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(UpsertBodyWeightEntrySchema)) body: UpsertBodyWeightEntryDto,
  ) {
    return this.bodyWeightService.upsertEntry(user.id, body);
  }

  @Delete('entries/:id')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Delete a weigh-in' })
  deleteEntry(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.bodyWeightService.deleteEntry(user.id, id);
  }

  @Post('import')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Apply an Apple Health weight delta (new/changed and deleted samples)' })
  importHealthKit(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(ImportBodyWeightSchema)) body: ImportBodyWeightDto,
  ) {
    return this.bodyWeightService.importHealthKit(user.id, body);
  }
}
