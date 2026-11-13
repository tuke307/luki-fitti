import { Module } from '@nestjs/common';
import { SocialAccessModule } from '../social/social-access.module';
import { LeagueModule } from '../league/league.module';
import { BattleModule } from '../battle/battle.module';
import { PointsController } from './points.controller';
import { PointsService } from './points.service';

@Module({
  imports: [SocialAccessModule, LeagueModule, BattleModule],
  controllers: [PointsController],
  providers: [PointsService],
  exports: [PointsService],
})
export class PointsModule {}
