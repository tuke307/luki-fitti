import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AiKeySlot, AiSkillName } from '@luki-fitti/common/enums';
import type { AiModelInfoDto } from '@luki-fitti/common/schemas';
import {
  AiModelsService,
  averageTokens,
  eligibleModels,
  estimateCostPerRun,
  parseChoices,
  resolvePrimaryModel,
  sortOptions,
} from './ai-models.service';
import type { PrismaService } from '../database/prisma.service';
import type { AppSettingsService } from '../app-settings/app-settings.service';
import type { OpenRouterModelsService } from './openrouter-models.service';

const model = (id: string, opts: Partial<AiModelInfoDto> = {}): AiModelInfoDto => ({
  id,
  name: id,
  contextLength: 100000,
  pricing: { promptPerMTokUsd: 1, completionPerMTokUsd: 4, imageUsd: null },
  supportsTools: true,
  supportsImages: false,
  ...opts,
});

const catalog = [
  model('a/tools-text'),
  model('b/tools-vision', {
    supportsImages: true,
    pricing: { promptPerMTokUsd: 1, completionPerMTokUsd: 4, imageUsd: 0.005 },
  }),
  model('c/no-tools', { supportsTools: false, supportsImages: true }),
];

describe('eligibleModels', () => {
  it('own key: every capable model', () => {
    const ids = (skill: AiSkillName) =>
      eligibleModels(catalog, skill, AiKeySlot.USER, []).map((m) => m.id);
    assert.deepEqual(ids(AiSkillName.WORKOUT_BUILDER), ['a/tools-text', 'b/tools-vision']);
    assert.deepEqual(ids(AiSkillName.MEAL_TEXT_ANALYZER), ['a/tools-text', 'b/tools-vision']);
    assert.deepEqual(ids(AiSkillName.MEAL_ANALYZER), ['b/tools-vision']);
  });

  it('admin key: capable models on the allowlist only', () => {
    const allow = ['a/tools-text', 'c/no-tools', 'z/not-in-catalog'];
    assert.deepEqual(
      eligibleModels(catalog, AiSkillName.WORKOUT_BUILDER, AiKeySlot.ADMIN, allow).map((m) => m.id),
      ['a/tools-text'],
    );
    assert.deepEqual(
      eligibleModels(catalog, AiSkillName.MEAL_ANALYZER, AiKeySlot.ADMIN, allow),
      [],
    );
  });

  it('no key: treated like the restricted allowlist', () => {
    assert.deepEqual(eligibleModels(catalog, AiSkillName.WORKOUT_BUILDER, null, []), []);
  });
});

describe('resolvePrimaryModel', () => {
  const eligible = [model('a/tools-text')];
  it('uses an eligible choice', () => {
    assert.equal(resolvePrimaryModel('a/tools-text', 'x/default', eligible), 'a/tools-text');
  });
  it('falls back to the default for stale, ineligible or missing choices', () => {
    assert.equal(resolvePrimaryModel('c/no-tools', 'x/default', eligible), 'x/default');
    assert.equal(resolvePrimaryModel(null, 'x/default', eligible), 'x/default');
    assert.equal(resolvePrimaryModel(undefined, 'x/default', []), 'x/default');
  });
});

describe('cost estimate', () => {
  it('averages tokens and multiplies by per-1M prices', () => {
    const avg = averageTokens([
      { promptTokens: 3000, completionTokens: 500 },
      { promptTokens: 5000, completionTokens: 1500 },
    ]);
    assert.deepEqual(avg, { promptTokens: 4000, completionTokens: 1000 });
    // 4000 × $1/1M + 1000 × $4/1M = $0.008
    const cost = estimateCostPerRun(avg, {
      promptPerMTokUsd: 1,
      completionPerMTokUsd: 4,
      imageUsd: null,
    });
    assert.ok(Math.abs(cost! - 0.008) < 1e-12);
  });

  it('adds the per-image price per image sent', () => {
    const pricing = { promptPerMTokUsd: 1, completionPerMTokUsd: 4, imageUsd: 0.003 };
    const avg = { promptTokens: 4000, completionTokens: 1000 };
    assert.ok(Math.abs(estimateCostPerRun(avg, pricing, 1)! - 0.011) < 1e-12);
    assert.ok(Math.abs(estimateCostPerRun(avg, pricing)! - 0.008) < 1e-12);
    assert.ok(
      Math.abs(estimateCostPerRun(avg, { ...pricing, imageUsd: null }, 1)! - 0.008) < 1e-12,
    );
  });

  it('is null without history', () => {
    assert.equal(averageTokens([]), null);
    assert.equal(
      estimateCostPerRun(null, { promptPerMTokUsd: 1, completionPerMTokUsd: 1, imageUsd: null }),
      null,
    );
  });

  it('sorts by estimated cost (unknown last), then name', () => {
    const opt = (id: string, cost: number | null) => ({
      ...model(id),
      estimatedCostPerRunUsd: cost,
    });
    assert.deepEqual(
      sortOptions([
        opt('b/x', null),
        opt('c/x', 0.02),
        opt('b/y', 0.01),
        opt('a/x', 0.01),
        opt('a/y', null),
      ]).map((m) => m.id),
      ['a/x', 'b/y', 'c/x', 'a/y', 'b/x'],
    );
  });
});

describe('parseChoices', () => {
  it('drops stored values that are not valid choices', () => {
    assert.deepEqual(parseChoices({ 'workout-builder': 'a/tools-text' }), {
      'workout-builder': 'a/tools-text',
    });
    assert.deepEqual(parseChoices({ 'workout-builder': 'not valid' }), {});
    assert.deepEqual(parseChoices('garbage'), {});
    assert.deepEqual(parseChoices(null), {});
  });
});

function service(opts: {
  aiModels?: unknown;
  allowlist?: string[];
  keySource?: AiKeySlot | null;
  ownRuns?: Array<{ promptTokens: number; completionTokens: number }>;
  globalRuns?: Array<{ promptTokens: number; completionTokens: number }>;
  catalogAvailable?: boolean;
}) {
  const runQueries: Array<{ where: Record<string, unknown>; take: number }> = [];
  const prisma = {
    userPreferences: { findUnique: async () => ({ aiModels: opts.aiModels ?? null }) },
    aiRun: {
      findMany: async (q: { where: Record<string, unknown>; take: number }) => {
        runQueries.push(q);
        return q.where.userId ? (opts.ownRuns ?? []) : (opts.globalRuns ?? []);
      },
    },
  } as unknown as PrismaService;
  const settings = {
    get: async () => ({
      workoutBuilderModel: 'x/default-workout',
      mealPhotoModel: 'x/default-meal',
      userModelAllowlist: opts.allowlist ?? [],
    }),
    keySource: async () => (opts.keySource === undefined ? AiKeySlot.USER : opts.keySource),
  } as unknown as AppSettingsService;
  const models = {
    catalog: async () => ({
      available: opts.catalogAvailable ?? true,
      models: opts.catalogAvailable === false ? [] : catalog,
    }),
  } as unknown as OpenRouterModelsService;
  return { svc: new AiModelsService(prisma, settings, models), runQueries };
}

describe('AiModelsService', () => {
  it('resolvePrimary uses a valid choice and ignores ineligible ones', async () => {
    const choice = { 'workout-builder': 'a/tools-text', 'meal-analyzer': 'a/tools-text' };
    const { svc } = service({ aiModels: choice });
    assert.equal(
      await svc.resolvePrimary(
        'u',
        AiSkillName.WORKOUT_BUILDER,
        AiKeySlot.USER,
        'x/default-workout',
      ),
      'a/tools-text',
    );
    // a/tools-text cannot read photos.
    assert.equal(
      await svc.resolvePrimary('u', AiSkillName.MEAL_ANALYZER, AiKeySlot.USER, 'x/default-meal'),
      'x/default-meal',
    );
    // Admin key and not on the allowlist.
    assert.equal(
      await svc.resolvePrimary(
        'u',
        AiSkillName.WORKOUT_BUILDER,
        AiKeySlot.ADMIN,
        'x/default-workout',
      ),
      'x/default-workout',
    );
  });

  it('resolvePrimary falls back to the default when the catalog is unavailable', async () => {
    const { svc } = service({
      aiModels: { 'workout-builder': 'a/tools-text' },
      catalogAvailable: false,
    });
    assert.equal(
      await svc.resolvePrimary(
        'u',
        AiSkillName.WORKOUT_BUILDER,
        AiKeySlot.USER,
        'x/default-workout',
      ),
      'x/default-workout',
    );
  });

  it('forUser lists eligible models with estimates from the user history', async () => {
    const { svc, runQueries } = service({
      aiModels: { 'workout-builder': 'b/tools-vision' },
      keySource: AiKeySlot.ADMIN,
      allowlist: ['b/tools-vision', 'c/no-tools'],
      ownRuns: [{ promptTokens: 1000, completionTokens: 250 }],
    });
    const dto = await svc.forUser('u');
    const workout = dto.skills.find((s) => s.skill === AiSkillName.WORKOUT_BUILDER)!;
    assert.equal(dto.catalogAvailable, true);
    assert.equal(workout.restricted, true);
    assert.equal(workout.defaultModel, 'x/default-workout');
    assert.equal(workout.selectedModel, 'b/tools-vision');
    assert.equal(workout.effectiveModel, 'b/tools-vision');
    assert.deepEqual(
      workout.models.map((m) => m.id),
      ['b/tools-vision'],
    );
    assert.ok(Math.abs(workout.models[0]!.estimatedCostPerRunUsd! - 0.002) < 1e-12);
    const mealText = dto.skills.find((s) => s.skill === AiSkillName.MEAL_TEXT_ANALYZER)!;
    assert.equal(mealText.defaultModel, 'x/default-meal');
    assert.equal(mealText.effectiveModel, 'x/default-meal');
    assert.equal(mealText.effectiveModelInfo, null);
    // Photo skill: the same tokens plus one image at $0.005.
    const meal = dto.skills.find((s) => s.skill === AiSkillName.MEAL_ANALYZER)!;
    assert.ok(Math.abs(meal.models[0]!.estimatedCostPerRunUsd! - 0.007) < 1e-12);
    const ownQuery = runQueries.find((q) => q.where.userId === 'u')!;
    assert.equal(ownQuery.take, 20);
    assert.equal(ownQuery.where.status, 'SUCCESS');
  });

  it('forUser falls back to all users, then to no estimate', async () => {
    const withGlobal = await service({
      globalRuns: [{ promptTokens: 2000, completionTokens: 0 }],
    }).svc.forUser('u');
    assert.ok(Math.abs(withGlobal.skills[0]!.models[0]!.estimatedCostPerRunUsd! - 0.002) < 1e-12);
    const none = await service({}).svc.forUser('u');
    assert.equal(none.skills[0]!.models[0]!.estimatedCostPerRunUsd, null);
    assert.equal(none.skills[0]!.restricted, false);
  });
});
