import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthActivityRangeQuerySchema,
  ImportHealthActivitySchema,
  type HealthActivityRangeQueryDto,
  type ImportHealthActivityDto,
} from '@luki-fitti/common/schemas';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { ActivityService } from './activity.service';

/** Apple Health activity (daily active energy and workouts) imported by the iOS app. */
@ApiTags('Activity')
@Controller('activity')
@UseGuards(AuthGuard)
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get()
  @ApiOperation({ summary: 'Daily active energy and workouts started in [from, to], oldest first' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(HealthActivityRangeQuerySchema))
    query: HealthActivityRangeQueryDto,
  ) {
    return this.activityService.listActivity(user.id, query.from, query.to);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Apply an Apple Health activity delta (days, workouts, deletions)' })
  importHealthKit(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(ImportHealthActivitySchema)) body: ImportHealthActivityDto,
  ) {
    return this.activityService.importHealthKit(user.id, body);
  }
}
