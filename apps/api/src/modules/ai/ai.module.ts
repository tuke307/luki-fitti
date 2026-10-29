import { Module } from '@nestjs/common';
import { ExerciseModule } from '../exercise/exercise.module';
import { SessionModule } from '../session/session.module';
import { NutritionModule } from '../nutrition/nutrition.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { OpenRouterClient } from './openrouter.client';
import { ToolRegistry } from './harness/tool-registry';
import { AgentRunnerService } from './harness/agent-runner.service';
import { TrainingTools } from './tools/training.tools';

@Module({
  imports: [ExerciseModule, SessionModule, NutritionModule],
  controllers: [AiController],
  providers: [OpenRouterClient, ToolRegistry, AgentRunnerService, TrainingTools, AiService],
})
export class AiModule {}
