import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { SocialEnabledGuard } from '../social/social-enabled.guard';
import { RaidsEnabledGuard } from './raids-enabled.guard';
import { RaidService } from './raid.service';

@ApiTags('raids')
@Controller('raids')
@UseGuards(AuthGuard, SocialEnabledGuard, RaidsEnabledGuard)
export class RaidsController {
  constructor(private readonly raids: RaidService) {}

  @Get('current')
  @ApiOperation({ summary: 'Community + squad raids and unseen results' })
  current(@CurrentUser() user: AuthenticatedUser) {
    return this.raids.current(user.id);
  }

  @Get('bosses')
  @ApiOperation({ summary: 'The boss roster for the squad boss picker' })
  bosses() {
    return this.raids.bosses();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Raid detail with top dealers and own standing' })
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.raids.detail(user.id, id);
  }

  @Get(':id/feed')
  @ApiOperation({ summary: 'Latest hits; workout content is friends/self only' })
  feed(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.raids.feed(user.id, id, cursor);
  }

  @Post(':id/seen')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Mark the raid result celebration as seen' })
  seen(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.raids.markSeen(user.id, id);
  }
}
