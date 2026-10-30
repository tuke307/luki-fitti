import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MyAiUsageQuerySchema } from '@luki-fitti/common/schemas';
import { AiUsageService } from './ai-usage.service';
import type { PrismaService } from '../database/prisma.service';
import type { AppSettingsService } from '../app-settings/app-settings.service';

type Where = { userId?: unknown; createdAt?: { gte: Date } };
type Args = { where: Where; select?: Record<string, boolean>; take?: number };

const now = new Date();
const run = (over: Record<string, unknown>) => ({
  id: 'r1',
  skill: 'workout-builder',
  status: 'SUCCESS',
  promptTokens: 100,
  completionTokens: 20,
  costUsd: 0.0012,
  durationMs: 900,
  createdAt: now,
  ...over,
});

function setup(rows: Array<ReturnType<typeof run>>) {
  const calls: Args[] = [];
  const prisma = {
    aiRun: {
      findMany: async (args: Args) => {
        calls.push(args);
        return args.take ? rows.slice(0, args.take) : rows;
      },
      count: async (args: Args) => {
        calls.push(args);
        return rows.length;
      },
    },
  } as unknown as PrismaService;
  const settings = { get: async () => ({ aiDailyRunLimit: 30 }) } as unknown as AppSettingsService;
  return { service: new AiUsageService(prisma, settings), calls };
}

describe('AiUsageService', () => {
  it('scopes every query to the given user and never selects error internals', async () => {
    const { service, calls } = setup([]);
    await service.getUserUsage('user-1', 30);
    assert.equal(calls.length, 3);
    for (const call of calls) {
      assert.equal(call.where.userId, 'user-1');
      assert.equal(call.select?.errorCode, undefined);
      assert.equal(call.select?.model, undefined);
    }
  });

  it('sums tokens and known cost, counts unknown cost and failures', async () => {
    const { service } = setup([
      run({ id: 'a' }),
      run({ id: 'b', skill: 'meal-analyzer', costUsd: null, status: 'ERROR' }),
      run({ id: 'c', costUsd: 0.0008 }),
    ]);
    const usage = await service.getUserUsage('user-1', 7);
    assert.equal(usage.totalRuns, 3);
    assert.equal(usage.failedRuns, 1);
    assert.equal(usage.unknownCostRuns, 1);
    assert.equal(usage.promptTokens, 300);
    assert.equal(usage.completionTokens, 60);
    assert.equal(usage.costUsd, 0.002);
    assert.deepEqual(usage.bySkill, [
      { skill: 'workout-builder', runs: 2, costUsd: 0.002 },
      { skill: 'meal-analyzer', runs: 1, costUsd: 0 },
    ]);
    assert.equal(usage.byDay.length, 7);
    assert.deepEqual(usage.byDay.at(-1), {
      date: now.toISOString().slice(0, 10),
      runs: 3,
      costUsd: 0.002,
    });
    assert.equal(usage.recent[1]!.costUsd, null);
    assert.deepEqual(usage.today, { used: 3, limit: 30 });
    assert.ok(!('errorCode' in usage.recent[0]!));
  });

  it('accepts only the supported day ranges', () => {
    assert.equal(MyAiUsageQuerySchema.parse({}).days, 30);
    assert.equal(MyAiUsageQuerySchema.parse({ days: '90' }).days, 90);
    assert.equal(MyAiUsageQuerySchema.safeParse({ days: '31' }).success, false);
    assert.equal(MyAiUsageQuerySchema.safeParse({ days: 'abc' }).success, false);
  });
});
