import { Module } from '@nestjs/common';
import { SocialAccessModule } from '../social/social-access.module';
import { LeagueModule } from '../league/league.module';
import { BattleModule } from '../battle/battle.module';
import { RaidModule } from '../raid/raid.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PointsController } from './points.controller';
import { PointsService } from './points.service';
import { NudgeService } from './nudge.service';

@Module({
  imports: [SocialAccessModule, LeagueModule, BattleModule, RaidModule, NotificationsModule],
  controllers: [PointsController],
  providers: [PointsService, NudgeService],
  exports: [PointsService],
})
export class PointsModule {}
