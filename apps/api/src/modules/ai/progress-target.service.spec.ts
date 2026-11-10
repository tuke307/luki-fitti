import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HttpException } from '@nestjs/common';
import sharp from 'sharp';
import { AiKeySlot, AiSkillName, BodyGoal, ProgressPose } from '@luki-fitti/common/enums';
import { ProgressTargetService } from './progress-target.service';
import { AiProviderError, OpenRouterClient } from './openrouter.client';
import type { PrismaService } from '../database/prisma.service';
import type { AppSettingsService } from '../app-settings/app-settings.service';
import type { AiKeyService } from './ai-key.service';
import type { AiModelsService } from './ai-models.service';
import type { AgentRunnerService } from './harness/agent-runner.service';

function prefs(overrides: Record<string, unknown> = {}) {
  return {
    progressAiConsentAt: new Date('2026-01-01'),
    birthYear: 1995,
    heightCm: 180,
    bodyWeightKg: 80,
    bodyFatPct: 20,
    sex: 'male',
    ...overrides,
  };
}

interface MakeOptions {
  prefOverrides?: Record<string, unknown>;
  quotaError?: Error;
  imageResult?: object;
  imageError?: unknown;
}

function make(opts: MakeOptions = {}) {
  const runs: object[] = [];
  const prisma = {
    userPreferences: {
      findUnique: async () => prefs(opts.prefOverrides),
      update: async ({ data }: { data: { progressAiConsentAt: Date } }) => ({
        progressAiConsentAt: data.progressAiConsentAt,
      }),
    },
    bodyWeightEntry: { findFirst: async () => ({ weightKg: 82 }) },
    workoutSession: { count: async () => 8 },
    aiRun: {
      create: async ({ data }: { data: object }) => {
        runs.push(data);
        return { id: 'run-1' };
      },
    },
  } as unknown as PrismaService;

  const imageCalls: Array<{ model: string; fallbackModels?: string[] }> = [];
  const client = {
    generateImage: async (req: { model: string; fallbackModels?: string[] }) => {
      imageCalls.push(req);
      if (opts.imageError) throw opts.imageError;
      return (
        opts.imageResult ?? {
          model: req.model,
          imageBase64: 'aW1n',
          mimeType: 'image/jpeg',
          costUsd: 0.02,
        }
      );
    },
  } as unknown as OpenRouterClient;
  const runner = {
    assertWithinQuota: async () => {
      if (opts.quotaError) throw opts.quotaError;
      return { apiKey: 'FAKE-KEY-FOR-TESTING', source: AiKeySlot.USER };
    },
  } as unknown as AgentRunnerService;
  const service = new ProgressTargetService(
    prisma,
    {
      get: async () => ({
        progressTargetModel: 'google/test-primary',
        progressTargetFallbacks: ['bytedance/fallback-1'],
      }),
    } as unknown as AppSettingsService,
    {} as AiKeyService,
    { resolvePrimary: async () => 'google/test-primary' } as unknown as AiModelsService,
    runner,
    client,
  );
  return { service, imageCalls, runs };
}

async function jpeg(): Promise<string> {
  const buf = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#123456' } })
    .jpeg()
    .toBuffer();
  return buf.toString('base64');
}

const REQ = {
  goal: BodyGoal.BUILD_MUSCLE,
  horizonMonths: 6 as const,
  pose: ProgressPose.FRONT as ProgressPose.FRONT,
};

describe('ProgressTargetService', () => {
  it('requires consent (412 AI_CONSENT_REQUIRED)', async () => {
    const { service } = make({ prefOverrides: { progressAiConsentAt: null } });
    await assert.rejects(
      () => service.generate('u1', 'en', { ...REQ, imageBase64: '' }),
      (e: HttpException) =>
        e.getStatus() === 412 && JSON.stringify(e.getResponse()).includes('AI_CONSENT_REQUIRED'),
    );
  });

  it('rejects under-18 and a missing birthYear (403 AGE_RESTRICTED)', async () => {
    const under18 = make({ prefOverrides: { birthYear: new Date().getUTCFullYear() - 17 } });
    await assert.rejects(
      () => under18.service.generate('u1', 'en', { ...REQ, imageBase64: '' }),
      (e: HttpException) =>
        e.getStatus() === 403 && JSON.stringify(e.getResponse()).includes('AGE_RESTRICTED'),
    );
    const noYear = make({ prefOverrides: { birthYear: null } });
    await assert.rejects(
      () => noYear.service.generate('u1', 'en', { ...REQ, imageBase64: '' }),
      (e: HttpException) =>
        e.getStatus() === 403 && JSON.stringify(e.getResponse()).includes('AGE_RESTRICTED'),
    );
  });

  it('enforces the quota (user keys skip it via the runner)', async () => {
    const { service } = make({
      quotaError: new HttpException({ code: 'AI_QUOTA_EXCEEDED' }, 429),
    });
    await assert.rejects(
      () => service.generate('u1', 'en', { ...REQ, imageBase64: '' }),
      (e: HttpException) => e.getStatus() === 429,
    );
  });

  it('persists nothing but the AiRun (no image, no prompt, no storage)', async () => {
    const { service, runs } = make();
    const res = await service.generate('u1', 'en', { ...REQ, imageBase64: await jpeg() });
    assert.equal(res.imageBase64, 'aW1n');
    assert.equal(runs.length, 1);
    const run = runs[0] as Record<string, unknown>;
    assert.equal(run.skill, AiSkillName.PROGRESS_TARGET);
    assert.equal(run.steps, 1);
    assert.ok(!('prompt' in run) && !('image' in run) && !('imageBase64' in run));
    assert.equal(run.costUsd, 0.02);
    assert.equal(run.status, 'SUCCESS');
  });
});

describe('progress attach metadata', () => {
  it('rejects ai fields on kind=PHOTO uploads', async () => {
    const { AttachProgressPhotoSchema } = await import('@luki-fitti/common/schemas');
    assert.ok(
      !AttachProgressPhotoSchema.safeParse({
        clientPhotoId: 'abcdef123',
        pose: 'FRONT',
        kind: 'PHOTO',
        aiModel: 'm',
      }).success,
    );
    assert.ok(
      AttachProgressPhotoSchema.safeParse({
        clientPhotoId: 'abcdef123',
        pose: 'FRONT',
        kind: 'AI_TARGET',
        aiModel: 'm',
        aiGoal: 'RECOMP',
        aiHorizonMonths: 6,
      }).success,
    );
    // horizon must be 3/6/12
    assert.ok(
      !AttachProgressPhotoSchema.safeParse({
        clientPhotoId: 'abcdef123',
        pose: 'FRONT',
        kind: 'AI_TARGET',
        aiHorizonMonths: 9,
      }).success,
    );
  });
});

describe('image-model eligibility', () => {
  it('keeps models with input_references.max >= 1 or image input modality', async () => {
    const mod = await import('./openrouter-models.service');
    const models = mod.parseOpenRouterImageModels({
      data: [
        {
          id: 'a/img-refs',
          pricing: { prompt: '0.1', completion: '0.2' },
          supported_parameters: { input_references: { max: 3 } },
        },
        {
          id: 'b/img-modality',
          pricing: { prompt: '0.1', completion: '0.2' },
          architecture: { input_modalities: ['image'] },
        },
        {
          id: 'c/text-only',
          pricing: { prompt: '0.1', completion: '0.2' },
          supported_parameters: { input_references: { max: 0 } },
        },
      ],
    });
    assert.deepEqual(
      models.map((m) => m.id),
      ['a/img-refs', 'b/img-modality'],
    );
    // Image-skill pricing: token prices zeroed, image price null (estimate comes from runs).
    assert.equal(models[0]?.pricing.imageUsd, null);
    assert.equal(models[0]?.pricing.promptPerMTokUsd, 0);
  });
});

describe('OpenRouterClient.generateImage fallbacks', () => {
  function fakeFetch(statuses: Array<{ status: number; body?: object }>) {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const idx = calls.length;
      calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) });
      const next = statuses[Math.min(idx, statuses.length - 1)]!;
      return new Response(JSON.stringify(next.body ?? {}), { status: next.status });
    };
    return {
      calls,
      restore: () => {
        globalThis.fetch = orig;
      },
    };
  }

  const imgOk = {
    model: 'm2',
    data: [{ b64_json: 'eGk=', media_type: 'image/jpeg' }],
    usage: { cost: 0.03 },
  };

  it('sends the input_references payload shape', async () => {
    const { calls, restore } = fakeFetch([{ status: 200, body: imgOk }]);
    const client = new OpenRouterClient();
    const res = await client.generateImage(
      { model: 'm1', prompt: 'p', referenceImageDataUrl: 'data:image/jpeg;base64,AA==', user: 'h' },
      'FAKE-KEY-FOR-TESTING',
    );
    restore();
    assert.equal(res.imageBase64, 'eGk=');
    assert.equal(res.costUsd, 0.03);
    assert.deepEqual(calls[0]?.body.input_references, [
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AA==' } },
    ]);
    assert.equal(calls[0]?.body.aspect_ratio, '2:3');
    assert.equal(calls[0]?.body.user, 'h');
  });

  it('tries the fallback on 5xx and on model-unavailable 4xx', async () => {
    const { calls, restore } = fakeFetch([
      { status: 502, body: { error: { message: 'upstream' } } },
      { status: 200, body: imgOk },
    ]);
    const client = new OpenRouterClient();
    const res = await client.generateImage(
      { model: 'm1', fallbackModels: ['m2'], prompt: 'p', referenceImageDataUrl: 'x' },
      'FAKE-KEY-FOR-TESTING',
    );
    restore();
    assert.equal(calls.length, 2);
    assert.equal(calls[1]?.body.model, 'm2');
    assert.equal(res.model, 'm2');
  });

  it('never falls back on 401, 402 or 429', async () => {
    for (const status of [401, 402, 429]) {
      const { calls, restore } = fakeFetch([
        { status, body: { error: { message: 'nope', code: status } } },
        { status: 200, body: imgOk },
      ]);
      const client = new OpenRouterClient();
      await assert.rejects(
        client.generateImage(
          { model: 'm1', fallbackModels: ['m2'], prompt: 'p', referenceImageDataUrl: 'x' },
          'FAKE-KEY-FOR-TESTING',
        ),
        AiProviderError,
      );
      restore();
      assert.equal(calls.length, 1);
    }
  });
});
