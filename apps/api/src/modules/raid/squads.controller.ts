import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreateSquadInviteSchema,
  CreateSquadSchema,
  RenameSquadSchema,
  StartSquadRaidSchema,
  type CreateSquadDto,
  type CreateSquadInviteDto,
  type RenameSquadDto,
  type StartSquadRaidDto,
} from '@luki-fitti/common/schemas';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { SocialEnabledGuard } from '../social/social-enabled.guard';
import { RaidsEnabledGuard } from './raids-enabled.guard';
import { SquadService } from './squad.service';

@ApiTags('squads')
@Controller('squads')
@UseGuards(AuthGuard, SocialEnabledGuard, RaidsEnabledGuard)
export class SquadsController {
  constructor(private readonly squads: SquadService) {}

  @Get()
  @ApiOperation({ summary: 'My squads and pending invites' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.squads.list(user.id);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Create a squad (max 3 per user)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateSquadSchema)) dto: CreateSquadDto,
  ) {
    return this.squads.create(user.id, dto.name);
  }

  @Post(':id/invites')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Invite a friend (owner only)' })
  invite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateSquadInviteSchema)) dto: CreateSquadInviteDto,
  ) {
    return this.squads.invite(user.id, id, dto.userId);
  }

  @Post(':id/invites/accept')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Accept a squad invite' })
  acceptInvite(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.squads.acceptInvite(user.id, id);
  }

  @Post(':id/invites/decline')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Decline a squad invite (silent)' })
  declineInvite(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.squads.declineInvite(user.id, id);
  }

  @Post(':id/leave')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Leave a squad (owner hands over or the squad ends)' })
  leave(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.squads.leave(user.id, id);
  }

  @Delete(':id/members/:userId')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Kick a member (owner only)' })
  kick(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('userId') targetId: string,
  ) {
    return this.squads.kick(user.id, id, targetId);
  }

  @Patch(':id')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Rename a squad (owner only)' })
  rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RenameSquadSchema)) dto: RenameSquadDto,
  ) {
    return this.squads.rename(user.id, id, dto.name);
  }

  @Delete(':id')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Delete a squad (owner only)' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.squads.remove(user.id, id);
  }

  @Post(':id/raids')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Start this week’s squad raid (owner, ≥ 2 members)' })
  startRaid(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(StartSquadRaidSchema)) dto: StartSquadRaidDto,
  ) {
    return this.squads.startRaid(user.id, id, dto.bossSlug, dto.difficulty);
  }
}
