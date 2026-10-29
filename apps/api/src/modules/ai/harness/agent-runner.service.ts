import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import crypto from 'crypto';
import { z } from 'zod';
import { AiRunStatus } from '@luki-fitti/common/enums';
import { PrismaService } from '../../database/prisma.service';
import { AppSettingsService } from '../../app-settings/app-settings.service';
import {
  AiProviderError,
  OpenRouterClient,
  type ChatMessage,
  type ChatToolCall,
  type ChatToolDefinition,
} from '../openrouter.client';
import { ToolRegistry } from './tool-registry';
import type { AiSkill, SkillRunInput, SkillRunResult, ToolContext } from './types';

const MAX_TOOL_RESULT_CHARS = 12_000;
const MAX_PARALLEL_TOOL_CALLS = 6;

/** Thrown inside the loop to end the run with a specific, client-safe error code. */
class RunAbort extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export const AI_UNAVAILABLE = {
  message: 'The assistant is unavailable right now. Please try again in a moment.',
  code: 'AI_UNAVAILABLE',
} as const;

function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: 'draft-7', unrepresentable: 'any' }) as Record<
    string,
    unknown
  >;
  delete json.$schema;
  return json;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…[truncated]` : text;
}

/**
 * Generic tool-calling loop:
 *   1. The model may call any of the skill's research tools (validated, user-scoped).
 *   2. It must finish by calling the skill's answer tool; the answer is schema-validated and
 *      validation errors are fed back so the model can correct itself.
 *   3. Every run is metered in `AiRun` (tokens, cost, duration) — without prompt content.
 */
@Injectable()
export class AgentRunnerService {
  private readonly logger = new Logger(AgentRunnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly appSettings: AppSettingsService,
    private readonly client: OpenRouterClient,
    private readonly tools: ToolRegistry,
  ) {}

  async assertWithinQuota(userId: string): Promise<void> {
    const { aiDailyRunLimit } = await this.appSettings.get();
    const startOfUtcDay = new Date();
    startOfUtcDay.setUTCHours(0, 0, 0, 0);
    const used = await this.prisma.aiRun.count({
      where: { userId, createdAt: { gte: startOfUtcDay } },
    });
    if (used >= aiDailyRunLimit) {
      throw new HttpException(
        { message: 'Daily AI limit reached. Try again tomorrow.', code: 'AI_QUOTA_EXCEEDED' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async run<TOutput extends z.ZodType>(
    skill: AiSkill<TOutput>,
    input: SkillRunInput,
  ): Promise<SkillRunResult<z.infer<TOutput>>> {
    await this.assertWithinQuota(input.userId);
    const settings = await this.appSettings.get();
    const { primary, fallbacks } = skill.model(settings);
    const ctx: ToolContext = { userId: input.userId, locale: input.locale };
    const started = Date.now();
    const usage = { promptTokens: 0, completionTokens: 0, costUsd: 0, costKnown: false };
    let steps = 0;
    let usedModel = primary;

    const answerTool: ChatToolDefinition = {
      type: 'function',
      function: {
        name: skill.answerTool.name,
        description: skill.answerTool.description,
        parameters: toJsonSchema(skill.output),
      },
    };
    const toolDefs = [...this.tools.definitions(skill.toolNames), answerTool];
    const messages: ChatMessage[] = [
      { role: 'system', content: skill.systemPrompt(ctx) },
      { role: 'user', content: input.content },
    ];
    const userHash = crypto.createHash('sha256').update(input.userId).digest('hex').slice(0, 32);

    const finish = async (status: AiRunStatus, errorCode?: string) => {
      const run = await this.prisma.aiRun.create({
        data: {
          userId: input.userId,
          skill: skill.name,
          model: usedModel,
          status,
          steps,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          costUsd: usage.costKnown ? usage.costUsd : null,
          durationMs: Date.now() - started,
          errorCode: errorCode ?? null,
        },
        select: { id: true },
      });
      return run.id;
    };

    try {
      while (steps < skill.maxSteps) {
        steps += 1;
        const isLastStep = steps === skill.maxSteps || skill.toolNames.length === 0;
        const response = await this.client.chat({
          model: primary,
          fallbackModels: fallbacks,
          messages,
          tools: toolDefs,
          // Force the answer on the last step so the loop always terminates with a result.
          toolChoice: isLastStep
            ? { type: 'function', function: { name: skill.answerTool.name } }
            : 'auto',
          temperature: skill.temperature,
          maxTokens: skill.maxTokens,
          user: userHash,
        });
        usedModel = response.model;
        usage.promptTokens += response.usage.promptTokens;
        usage.completionTokens += response.usage.completionTokens;
        if (response.usage.costUsd !== null) {
          usage.costUsd += response.usage.costUsd;
          usage.costKnown = true;
        }

        const calls = response.message.tool_calls ?? [];
        messages.push({ role: 'assistant', content: response.message.content, tool_calls: calls.length ? calls : undefined });

        if (calls.length === 0) {
          messages.push({
            role: 'user',
            content: `Call ${skill.answerTool.name} with your final answer now.`,
          });
          continue;
        }

        const answerCall = calls.find((c) => c.function.name === skill.answerTool.name);
        if (answerCall) {
          const parsed = this.parseAnswer(skill, answerCall);
          if (parsed.success) {
            const runId = await finish(AiRunStatus.SUCCESS);
            return { runId, output: parsed.data, model: usedModel, steps };
          }
          messages.push(
            ...calls.map((c) => ({
              role: 'tool' as const,
              tool_call_id: c.id,
              content:
                c.id === answerCall.id
                  ? JSON.stringify({ error: 'Answer did not match the schema', issues: parsed.issues })
                  : JSON.stringify({ skipped: true }),
            })),
          );
          continue;
        }

        const results = await this.executeCalls(ctx, skill, calls.slice(0, MAX_PARALLEL_TOOL_CALLS));
        messages.push(...results);
        for (const extra of calls.slice(MAX_PARALLEL_TOOL_CALLS)) {
          messages.push({
            role: 'tool',
            tool_call_id: extra.id,
            content: JSON.stringify({ error: 'Too many parallel calls; repeat if still needed' }),
          });
        }
      }
      throw new RunAbort('AI_NO_ANSWER');
    } catch (err) {
      const code =
        err instanceof RunAbort
          ? err.code
          : err instanceof AiProviderError
            ? `PROVIDER_${err.status ?? 'ERROR'}`
            : 'INTERNAL';
      if (err instanceof AiProviderError) {
        this.logger.warn(`AI provider error (${err.status ?? '-'}): ${err.upstreamMessage ?? err.message}`);
      } else if (!(err instanceof RunAbort)) {
        this.logger.error(`AI run failed: ${String(err)}`);
      }
      await finish(AiRunStatus.ERROR, code).catch(() => undefined);
      throw new ServiceUnavailableException(AI_UNAVAILABLE);
    }
  }

  private parseAnswer<TOutput extends z.ZodType>(
    skill: AiSkill<TOutput>,
    call: ChatToolCall,
  ): { success: true; data: z.infer<TOutput> } | { success: false; issues: unknown } {
    let raw: unknown;
    try {
      raw = JSON.parse(call.function.arguments || '{}');
    } catch {
      return { success: false, issues: 'Arguments were not valid JSON' };
    }
    const result = skill.output.safeParse(raw);
    return result.success
      ? { success: true, data: result.data }
      : {
          success: false,
          issues: result.error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message })),
        };
  }

  private async executeCalls(
    ctx: ToolContext,
    skill: AiSkill,
    calls: ChatToolCall[],
  ): Promise<ChatMessage[]> {
    return Promise.all(
      calls.map(async (call): Promise<ChatMessage> => {
        let content: string;
        if (!skill.toolNames.includes(call.function.name)) {
          content = JSON.stringify({ error: `Unknown tool ${call.function.name}` });
        } else {
          try {
            const output = await this.tools.execute(ctx, call.function.name, call.function.arguments);
            content = truncate(JSON.stringify(output ?? null), MAX_TOOL_RESULT_CHARS);
          } catch (err) {
            // Only validation/known messages go back to the model; never stack traces.
            content = JSON.stringify({
              error: err instanceof z.ZodError ? 'Invalid arguments' : 'Tool failed',
              ...(err instanceof z.ZodError
                ? { issues: err.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`) }
                : {}),
            });
            if (!(err instanceof z.ZodError)) this.logger.warn(`Tool ${call.function.name} failed: ${String(err)}`);
          }
        }
        return { role: 'tool', tool_call_id: call.id, content };
      }),
    );
  }
}
