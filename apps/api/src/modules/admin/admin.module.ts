import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AiUsageService } from '../ai/ai-usage.service';
import { AiKeyModule } from '../ai/ai-key.module';
import { LeagueModule } from '../league/league.module';

@Module({
  imports: [AiKeyModule, LeagueModule],
  controllers: [AdminController],
  providers: [AdminService, AiUsageService],
})
export class AdminModule {}
