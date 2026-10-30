import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  MyAiUsageQuerySchema,
  type MyAiUsageDto,
  type MyAiUsageQueryDto,
} from '@luki-fitti/common/schemas';
import { AuthGuard } from '@/guards/auth.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { AiUsageService } from './ai-usage.service';

/** Personal AI usage; available without a feature grant so every user sees their own numbers. */
@ApiTags('AI')
@Controller('ai/usage')
@UseGuards(AuthGuard)
export class AiUsageController {
  constructor(private readonly usage: AiUsageService) {}

  @Get('me')
  @ApiOperation({ summary: 'Own AI requests, tokens and cost (USD as reported by OpenRouter)' })
  getMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(MyAiUsageQuerySchema)) query: MyAiUsageQueryDto,
  ): Promise<MyAiUsageDto> {
    return this.usage.getUserUsage(user.id, query.days);
  }
}
