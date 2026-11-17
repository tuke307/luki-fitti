import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SocialAccessModule } from './social-access.module';
import { PointsModule } from '../points/points.module';
import { BattleModule } from '../battle/battle.module';
import { RaidModule } from '../raid/raid.module';
import { LeagueModule } from '../league/league.module';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';

@Module({
  imports: [
    SocialAccessModule,
    NotificationsModule,
    PointsModule,
    BattleModule,
    RaidModule,
    LeagueModule,
  ],
  controllers: [SocialController],
  providers: [SocialService],
})
export class SocialModule {}
