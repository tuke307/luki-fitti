import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PointsWeekQuerySchema, type PointsWeekQueryDto } from '@luki-fitti/common/schemas';
import { AuthGuard } from '@/guards/auth.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { LeaguesEnabledGuard } from '../league/leagues-enabled.guard';
import { PointsService } from './points.service';

@ApiTags('points')
@Controller('points')
@UseGuards(AuthGuard, LeaguesEnabledGuard)
export class PointsController {
  constructor(private readonly points: PointsService) {}

  @Get('week')
  @ApiOperation({ summary: 'Effort-points breakdown for a week (default: current)' })
  getWeek(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(PointsWeekQuerySchema)) query: PointsWeekQueryDto,
  ) {
    return this.points.getWeek(user.id, query.weekKey);
  }
}
