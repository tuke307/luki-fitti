import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SocialAccessModule } from '../social/social-access.module';
import { BattleModule } from '../battle/battle.module';
import { RaidModule } from '../raid/raid.module';
import { LeagueController } from './league.controller';
import { LeagueService } from './league.service';
import { LeaguesEnabledGuard } from './leagues-enabled.guard';

@Module({
  imports: [SocialAccessModule, NotificationsModule, BattleModule, RaidModule],
  controllers: [LeagueController],
  providers: [LeagueService, LeaguesEnabledGuard],
  exports: [LeagueService, LeaguesEnabledGuard],
})
export class LeagueModule {}
