import { Module } from '@nestjs/common';
import { ExerciseModule } from '../exercise/exercise.module';
import { SessionModule } from '../session/session.module';
import { NutritionModule } from '../nutrition/nutrition.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiUsageController } from './ai-usage.controller';
import { AiUsageService } from './ai-usage.service';
import { AiKeyModule } from './ai-key.module';
import { ToolRegistry } from './harness/tool-registry';
import { AgentRunnerService } from './harness/agent-runner.service';
import { TrainingTools } from './tools/training.tools';

@Module({
  imports: [ExerciseModule, SessionModule, NutritionModule, AiKeyModule],
  controllers: [AiController, AiUsageController],
  providers: [ToolRegistry, AgentRunnerService, TrainingTools, AiService, AiUsageService],
})
export class AiModule {}
