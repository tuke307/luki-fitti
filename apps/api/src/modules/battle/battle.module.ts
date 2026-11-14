import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SocialAccessModule } from '../social/social-access.module';
import { DuelService } from './duel.service';
import { DuelsController } from './duels.controller';
import { DuelsEnabledGuard } from './duels-enabled.guard';
import { StreakService } from './streak.service';
import { StreaksController } from './streaks.controller';
import { StreaksEnabledGuard } from './streaks-enabled.guard';
import { TrophyService } from './trophy.service';
import { TrophiesController } from './trophies.controller';

@Module({
  imports: [SocialAccessModule, NotificationsModule],
  controllers: [DuelsController, StreaksController, TrophiesController],
  providers: [DuelService, StreakService, TrophyService, DuelsEnabledGuard, StreaksEnabledGuard],
  exports: [DuelService, StreakService, TrophyService],
})
export class BattleModule {}
