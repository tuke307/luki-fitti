import { Module } from '@nestjs/common';
import { AiKeyController } from './ai-key.controller';
import { AiKeyService } from './ai-key.service';
import { OpenRouterClient } from './openrouter.client';
import { OpenRouterModelsService } from './openrouter-models.service';
import { AiModelsService } from './ai-models.service';

/** Per-user OpenRouter keys + the (stateless) OpenRouter client; shared by AI and admin modules. */
@Module({
  controllers: [AiKeyController],
  providers: [OpenRouterClient, AiKeyService, OpenRouterModelsService, AiModelsService],
  exports: [OpenRouterClient, AiKeyService, OpenRouterModelsService, AiModelsService],
})
export class AiKeyModule {}
