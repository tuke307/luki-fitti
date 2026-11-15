import { Inject } from '@nestjs/common';
import { McpController, Tool, ToolScopes } from '@rekog/mcp-nest';
import { McpRawRequest } from '@rekog/mcp-nest';
import { Payload } from '@nestjs/microservices';
import { z } from 'zod';
import type { PublicMeDto } from '@luki-fitti/common/schemas';
import { LukiFittiApiClient } from '../lukifitti-api.client';
import { okResult, runTool, ToolRateLimiter, type ToolResult } from './tool-utils';

const GetProfileSchema = z.object({});

@McpController()
export class ProfileTool {
  constructor(
    @Inject(LukiFittiApiClient)
    private readonly api: LukiFittiApiClient,
    @Inject(ToolRateLimiter)
    private readonly limiter: ToolRateLimiter,
  ) {}

  @Tool({
    name: 'get-profile',
    description:
      'Get the user profile: units (weight/distance), weekly session goal, training goal and nutrition goals.',
    parameters: GetProfileSchema,
  })
  @ToolScopes(['read:profile'])
  async getProfile(
    @Payload() _input: z.infer<typeof GetProfileSchema>,
    @McpRawRequest() req: unknown,
  ): Promise<ToolResult> {
    return runTool(this.limiter, req, async () => {
      const me = await this.api.get<PublicMeDto>('/v1/me', {}, req);
      return okResult(
        `Profile for ${me.name ?? 'user'} — ${me.weightUnit}, goal ${me.goals.weeklyGoalSessions} sessions/week.`,
        { profile: me },
      );
    });
  }
}
