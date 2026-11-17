import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SocialAccessModule } from '../social/social-access.module';
import { RaidService } from './raid.service';
import { RaidsController } from './raids.controller';
import { RaidsEnabledGuard } from './raids-enabled.guard';
import { SquadService } from './squad.service';
import { SquadsController } from './squads.controller';

@Module({
  imports: [SocialAccessModule, NotificationsModule],
  controllers: [RaidsController, SquadsController],
  providers: [RaidService, SquadService, RaidsEnabledGuard],
  exports: [RaidService, SquadService, RaidsEnabledGuard],
})
export class RaidModule {}
