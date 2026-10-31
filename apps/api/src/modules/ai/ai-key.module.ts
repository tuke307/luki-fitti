import { Module } from '@nestjs/common';
import { AiKeyController } from './ai-key.controller';
import { AiKeyService } from './ai-key.service';
import { OpenRouterClient } from './openrouter.client';

/** Per-user OpenRouter keys + the (stateless) OpenRouter client; shared by AI and admin modules. */
@Module({
  controllers: [AiKeyController],
  providers: [OpenRouterClient, AiKeyService],
  exports: [OpenRouterClient, AiKeyService],
})
export class AiKeyModule {}
