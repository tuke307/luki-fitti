import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateStreakSchema, type CreateStreakDto } from '@luki-fitti/common/schemas';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { SocialEnabledGuard } from '../social/social-enabled.guard';
import { StreaksEnabledGuard } from './streaks-enabled.guard';
import { StreakService } from './streak.service';

@ApiTags('streaks')
@Controller('streaks')
@UseGuards(AuthGuard, SocialEnabledGuard, StreaksEnabledGuard)
export class StreaksController {
  constructor(private readonly streaks: StreakService) {}

  @Get()
  @ApiOperation({ summary: 'Active streaks and pending invites' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.streaks.list(user.id);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Invite a friend to a weekly streak' })
  invite(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateStreakSchema)) dto: CreateStreakDto,
  ) {
    return this.streaks.invite(user.id, dto.friendId);
  }

  @Post(':id/accept')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Accept a streak invite (starts counting this week)' })
  accept(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.streaks.accept(user.id, id);
  }

  @Delete(':id')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'End a streak (silent)' })
  end(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.streaks.end(user.id, id);
  }
}
