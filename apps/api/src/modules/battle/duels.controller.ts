import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateDuelSchema, type CreateDuelDto } from '@luki-fitti/common/schemas';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { SocialEnabledGuard } from '../social/social-enabled.guard';
import { DuelsEnabledGuard } from './duels-enabled.guard';
import { DuelService } from './duel.service';

@ApiTags('duels')
@Controller('duels')
@UseGuards(AuthGuard, SocialEnabledGuard, DuelsEnabledGuard)
export class DuelsController {
  constructor(private readonly duels: DuelService) {}

  @Get()
  @ApiOperation({ summary: 'Active duels, challenges and recent results' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.duels.list(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Duel detail with per-day scores (participants only)' })
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.duels.detail(user.id, id);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Challenge a friend to a 7-day duel' })
  challenge(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateDuelSchema)) dto: CreateDuelDto,
  ) {
    return this.duels.challenge(user.id, dto.opponentId);
  }

  @Post(':id/accept')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Accept a duel challenge (starts tomorrow, 7 Berlin days)' })
  accept(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.duels.accept(user.id, id);
  }

  @Post(':id/decline')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Decline a duel challenge (silent)' })
  decline(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.duels.decline(user.id, id);
  }

  @Post(':id/cancel')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Withdraw an unanswered challenge (silent)' })
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.duels.cancel(user.id, id);
  }

  @Post(':id/seen')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Mark the duel result as seen (celebration shown once)' })
  markSeen(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.duels.markSeen(user.id, id);
  }
}
