import { Body, Controller, Delete, Get, Put, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SetAiKeySchema, type AiKeyStatusDto, type SetAiKeyDto } from '@luki-fitti/common/schemas';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { AiKeyService } from './ai-key.service';

/**
 * The signed-in user's own OpenRouter key. Write-only: responses carry only the status
 * (`hasKey`, `last4`, `source`, `updatedAt`), never the key. Always scoped to the session user.
 */
@ApiTags('AI')
@Controller('ai/key')
@UseGuards(AuthGuard)
export class AiKeyController {
  constructor(private readonly aiKeys: AiKeyService) {}

  @Get()
  @ApiOperation({ summary: 'Status of the own / admin-assigned OpenRouter key (never the key)' })
  getStatus(@CurrentUser() user: AuthenticatedUser): Promise<AiKeyStatusDto> {
    return this.aiKeys.status(user.id);
  }

  @Put()
  @UseGuards(CsrfGuard)
  // Each save verifies the key against OpenRouter; keep brute-force/abuse in check.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Save (or replace) the own OpenRouter key; stored encrypted' })
  setKey(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(SetAiKeySchema)) body: SetAiKeyDto,
  ): Promise<AiKeyStatusDto> {
    return this.aiKeys.setUserKey(user.id, body.apiKey);
  }

  @Delete()
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Remove the own OpenRouter key' })
  clearKey(@CurrentUser() user: AuthenticatedUser): Promise<AiKeyStatusDto> {
    return this.aiKeys.clearUserKey(user.id);
  }
}
