import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import {
  McpStrategy,
  MCP_STRATEGY,
  StreamableHttpTransport,
  McpHttpControllerFor,
} from '@rekog/mcp-nest';
import { ProfileTool } from './tools/profile.tool';
import { SessionsTool } from './tools/sessions.tool';
import { ExerciseProgressTool } from './tools/exercise-progress.tool';
import { TrainingSummaryTool } from './tools/training-summary.tool';
import { WorkoutsTool } from './tools/workouts.tool';
import { NutritionTool } from './tools/nutrition.tool';
import { BodyWeightTool } from './tools/body-weight.tool';
import { LukiFittiApiClient } from './lukifitti-api.client';
import { ToolRateLimiter } from './tools/tool-utils';
import { MCP_ALLOWED_HOSTS } from './config';
import { McpAuthGuard } from './mcp-auth.guard';

// v2 ships Streamable HTTP only — the legacy HTTP+SSE transport was removed.
// The bare constructor is stateless + JSON response, which reproduces the old
// `streamableHttp: { enableJsonResponse: true, statelessMode: true }`. Note the
// old `statelessMode: true` was stateless despite a "Enables session management"
// comment; to actually opt into sessions, pass { statefulMode: true } here.
// `security` is the transport's DNS-rebinding protection (Host/Origin
// allowlist) recommended by the MCP spec for HTTP servers.
const mcpTransport = new StreamableHttpTransport({
  security: { allowedHosts: MCP_ALLOWED_HOSTS, allowedOrigins: MCP_ALLOWED_HOSTS },
});

// v2 has no McpModule — the strategy instance is the entire configuration.
export const mcp = new McpStrategy({
  name: 'luki-fitti-mcp-server',
  version: '2.0.0',
  transports: [mcpTransport],
});

// v2 serves /mcp from a real Nest controller. Extending McpHttpControllerFor
// claims the route (and disables the transport's self-mounted one), so the
// API-key guard gates every MCP request at the HTTP layer — what APP_GUARD
// used to do. The guard MUST live here, not globally: tools are now RPC
// (@MessagePattern) handlers, and a global guard would run against their
// non-HTTP execution context and break tool calls.
@Controller('mcp')
@UseGuards(McpAuthGuard)
export class McpHttpController extends McpHttpControllerFor(mcpTransport) {}

/** Unauthenticated liveness for compose healthchecks. */
@Controller()
export class HealthController {
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}

@Module({
  controllers: [
    McpHttpController,
    HealthController,
    ProfileTool,
    SessionsTool,
    ExerciseProgressTool,
    TrainingSummaryTool,
    WorkoutsTool,
    NutritionTool,
    BodyWeightTool,
  ],
  // Exposed so providers can inject the strategy for dynamic tool registration.
  providers: [{ provide: MCP_STRATEGY, useValue: mcp }, LukiFittiApiClient, ToolRateLimiter],
})
export class AppModule {}
