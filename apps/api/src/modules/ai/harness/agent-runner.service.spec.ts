import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { AiSkillName } from '@luki-fitti/common/enums';
import { AgentRunnerService } from './agent-runner.service';
import { ToolRegistry } from './tool-registry';
import type { AiSkill } from './types';
import type { ChatRequest, ChatResponse, OpenRouterClient } from '../openrouter.client';
import { AiProviderError } from '../openrouter.client';
import type { PrismaService } from '../../database/prisma.service';
import type { AppSettingsService } from '../../app-settings/app-settings.service';

const answerSchema = z.object({ total: z.number().int().min(0) });

const skill: AiSkill<typeof answerSchema> = {
  name: AiSkillName.WORKOUT_BUILDER,
  answerTool: { name: 'submit', description: 'final' },
  output: answerSchema,
  toolNames: ['count_sets'],
  systemPrompt: () => 'system',
  model: () => ({ primary: 'test/primary', fallbacks: ['test/fallback'] }),
  temperature: 0,
  maxSteps: 4,
  maxTokens: 100,
};

const toolCall = (id: string, name: string, args: unknown) => ({
  id,
  type: 'function' as const,
  function: { name, arguments: JSON.stringify(args) },
});

const reply = (calls: ReturnType<typeof toolCall>[], content: string | null = null): ChatResponse => ({
  model: 'test/primary',
  message: { content, tool_calls: calls.length ? calls : undefined },
  finishReason: calls.length ? 'tool_calls' : 'stop',
  usage: { promptTokens: 10, completionTokens: 5, costUsd: 0.001 },
});

function setup(script: Array<ChatResponse | Error>, opts: { runsToday?: number; limit?: number } = {}) {
  const requests: ChatRequest[] = [];
  const runs: Array<Record<string, unknown>> = [];
  const toolInputs: Array<{ userId: string; input: unknown }> = [];

  const prisma = {
    aiRun: {
      count: async () => opts.runsToday ?? 0,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        runs.push(data);
        return { id: `run-${runs.length}` };
      },
    },
  } as unknown as PrismaService;
  const settings = {
    get: async () => ({ aiDailyRunLimit: opts.limit ?? 30 }),
  } as unknown as AppSettingsService;
  const client = {
    chat: async (req: ChatRequest) => {
      requests.push(structuredClone(req));
      const next = script.shift();
      if (!next) throw new Error('script exhausted');
      if (next instanceof Error) throw next;
      return next;
    },
  } as unknown as OpenRouterClient;

  const registry = new ToolRegistry();
  registry.register({
    name: 'count_sets',
    description: 'count',
    input: z.object({ muscle: z.string() }),
    execute: async (ctx, input) => {
      toolInputs.push({ userId: ctx.userId, input });
      return { sets: 12 };
    },
  });

  const runner = new AgentRunnerService(prisma, settings, client, registry);
  return { runner, requests, runs, toolInputs };
}

const input = { userId: 'user-1', locale: 'en' as const, content: 'hello' };

describe('AgentRunnerService', () => {
  it('runs tools, then returns the validated answer and meters the run', async () => {
    const { runner, requests, runs, toolInputs } = setup([
      reply([toolCall('c1', 'count_sets', { muscle: 'CHEST' })]),
      reply([toolCall('c2', 'submit', { total: 12 })]),
    ]);
    const result = await runner.run(skill, input);

    assert.deepEqual(result.output, { total: 12 });
    assert.equal(result.steps, 2);
    assert.deepEqual(toolInputs, [{ userId: 'user-1', input: { muscle: 'CHEST' } }]);
    // The tool result is fed back to the model on the next step.
    const toolMsg = requests[1]!.messages.find((m) => m.role === 'tool');
    assert.deepEqual(toolMsg, { role: 'tool', tool_call_id: 'c1', content: '{"sets":12}' });
    assert.deepEqual(requests[0]!.fallbackModels, ['test/fallback']);
    assert.equal(runs.length, 1);
    assert.equal(runs[0]!.status, 'SUCCESS');
    assert.equal(runs[0]!.promptTokens, 20);
    assert.equal(runs[0]!.costUsd, 0.002);
    assert.deepEqual(result.usage, { promptTokens: 20, completionTokens: 10, costUsd: 0.002 });
  });

  it('reports unknown cost as null when the provider omits it', async () => {
    const noCost = (r: ChatResponse): ChatResponse => ({ ...r, usage: { ...r.usage, costUsd: null } });
    const { runner, runs } = setup([noCost(reply([toolCall('c1', 'submit', { total: 1 })]))]);
    const result = await runner.run(skill, input);
    assert.deepEqual(result.usage, { promptTokens: 10, completionTokens: 5, costUsd: null });
    assert.equal(runs[0]!.costUsd, null);
  });

  it('feeds schema errors back so the model can correct its answer', async () => {
    const { runner, requests } = setup([
      reply([toolCall('c1', 'submit', { total: -1 })]),
      reply([toolCall('c2', 'submit', { total: 3 })]),
    ]);
    const result = await runner.run(skill, input);
    assert.deepEqual(result.output, { total: 3 });
    const feedback = requests[1]!.messages.at(-1);
    assert.equal(feedback?.role, 'tool');
    assert.match(String((feedback as { content: string }).content), /did not match the schema/);
  });

  it('forces the answer tool on the last step', async () => {
    const { runner, requests } = setup([
      reply([], 'thinking'),
      reply([], 'still thinking'),
      reply([], 'hmm'),
      reply([toolCall('c1', 'submit', { total: 1 })]),
    ]);
    await runner.run(skill, input);
    assert.equal(requests[0]!.toolChoice, 'auto');
    assert.deepEqual(requests[3]!.toolChoice, { type: 'function', function: { name: 'submit' } });
  });

  it('rejects tools the skill is not allowed to use and reports invalid tool args', async () => {
    const { runner, requests, toolInputs } = setup([
      reply([toolCall('c1', 'delete_everything', {}), toolCall('c2', 'count_sets', { muscle: 3 })]),
      reply([toolCall('c3', 'submit', { total: 0 })]),
    ]);
    await runner.run(skill, input);
    assert.equal(toolInputs.length, 0);
    const toolMsgs = requests[1]!.messages.filter((m) => m.role === 'tool') as Array<{ content: string }>;
    assert.match(toolMsgs[0]!.content, /Unknown tool/);
    assert.match(toolMsgs[1]!.content, /Invalid arguments/);
  });

  it('maps provider failures to a generic 503 and records the error', async () => {
    const { runner, runs } = setup([new AiProviderError('boom', 429, 'secret upstream detail')]);
    await assert.rejects(runner.run(skill, input), (err: unknown) => {
      assert.ok(err instanceof ServiceUnavailableException);
      assert.doesNotMatch(JSON.stringify(err.getResponse()), /secret upstream detail/);
      return true;
    });
    assert.equal(runs[0]!.status, 'ERROR');
    assert.equal(runs[0]!.errorCode, 'PROVIDER_429');
  });

  it('enforces the daily run quota before calling the model', async () => {
    const { runner, requests } = setup([], { runsToday: 5, limit: 5 });
    await assert.rejects(runner.run(skill, input), (err: unknown) => {
      assert.ok(err instanceof HttpException);
      assert.equal(err.getStatus(), 429);
      return true;
    });
    assert.equal(requests.length, 0);
  });
});
