import { Module } from '@nestjs/common';
import { SocialAccessModule } from '../social/social-access.module';
import { LeagueModule } from '../league/league.module';
import { PointsController } from './points.controller';
import { PointsService } from './points.service';

@Module({
  imports: [SocialAccessModule, LeagueModule],
  controllers: [PointsController],
  providers: [PointsService],
  exports: [PointsService],
})
export class PointsModule {}
