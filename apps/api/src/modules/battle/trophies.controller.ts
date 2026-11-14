import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@/guards/auth.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { SocialEnabledGuard } from '../social/social-enabled.guard';
import { TrophyService } from './trophy.service';

@ApiTags('trophies')
@Controller('trophies')
@UseGuards(AuthGuard, SocialEnabledGuard)
export class TrophiesController {
  constructor(private readonly trophies: TrophyService) {}

  @Get(':userId')
  @ApiOperation({ summary: 'Trophy shelf of the user or a friend' })
  list(@CurrentUser() user: AuthenticatedUser, @Param('userId') userId: string) {
    return this.trophies.list(user.id, userId);
  }
}
