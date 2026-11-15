import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { LeagueWeekQuerySchema, type LeagueWeekQueryDto } from '@luki-fitti/common/schemas';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { LeaguesEnabledGuard } from './leagues-enabled.guard';
import { LeagueService } from './league.service';

const WEEK_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

@ApiTags('league')
@Controller('league')
@UseGuards(AuthGuard, LeaguesEnabledGuard)
export class LeagueController {
  constructor(private readonly leagues: LeagueService) {}

  @Get('current')
  @ApiOperation({ summary: "The user's arena cohort for the open week" })
  current(@CurrentUser() user: AuthenticatedUser) {
    return this.leagues.current(user.id);
  }

  @Get('friends')
  @ApiOperation({ summary: 'Friends leaderboard for a week (default: current)' })
  friends(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(LeagueWeekQuerySchema)) query: LeagueWeekQueryDto,
  ) {
    return this.leagues.friendsLeaderboard(user.id, query.weekKey);
  }

  @Get('history')
  @ApiOperation({ summary: "The user's last league week outcomes" })
  history(@CurrentUser() user: AuthenticatedUser) {
    return this.leagues.history(user.id);
  }

  @Post('results/:weekKey/seen')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Mark the week result as seen (celebration shown once)' })
  markResultSeen(@CurrentUser() user: AuthenticatedUser, @Param('weekKey') weekKey: string) {
    if (!WEEK_KEY_REGEX.test(weekKey)) return { updated: 0 };
    return this.leagues.markResultSeen(user.id, weekKey);
  }
}
