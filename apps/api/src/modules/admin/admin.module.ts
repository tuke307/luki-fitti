import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AiUsageService } from '../ai/ai-usage.service';
import { AiKeyModule } from '../ai/ai-key.module';

@Module({
  imports: [AiKeyModule],
  controllers: [AdminController],
  providers: [AdminService, AiUsageService],
})
export class AdminModule {}
