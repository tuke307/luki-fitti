import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AiModelsDto } from '@luki-fitti/common/schemas';
import { AuthGuard } from '@/guards/auth.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { AiModelsService } from './ai-models.service';

/** Model choice per AI skill: eligible models with prices for the signed-in user. */
@ApiTags('AI')
@Controller('ai/models')
@UseGuards(AuthGuard)
export class AiModelsController {
  constructor(private readonly models: AiModelsService) {}

  @Get()
  @ApiOperation({ summary: 'Eligible OpenRouter models per AI skill, with prices and cost estimates' })
  list(@CurrentUser() user: AuthenticatedUser): Promise<AiModelsDto> {
    return this.models.forUser(user.id);
  }
}
