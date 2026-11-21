import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaService } from '../database/prisma.service';
import { AppSettingsService, type AppSettingsRecord } from './app-settings.service';

const record = (overrides: Partial<AppSettingsRecord> = {}): AppSettingsRecord =>
  ({
    id: 1,
    apiKeysEnabled: false,
    mcpEnabled: false,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }) as AppSettingsRecord;

const prismaMock = (value: AppSettingsRecord, captured: Record<string, unknown> = {}) =>
  ({
    appSettings: {
      upsert: async (args: unknown) => {
        captured['upsert'] = args;
        return value;
      },
    },
  }) as unknown as PrismaService;

describe('AppSettingsService API key settings', () => {
  it('returns both kill switches', async () => {
    const svc = new AppSettingsService(prismaMock(record({ mcpEnabled: true })));
    assert.deepEqual(await svc.getApiKeySettings(), { apiKeysEnabled: false, mcpEnabled: true });
  });

  it('applies a partial update without touching the other switch', async () => {
    const captured: Record<string, unknown> = {};
    const svc = new AppSettingsService(prismaMock(record({ mcpEnabled: true }), captured));
    const dto = await svc.updateApiKeySettings({ mcpEnabled: true });
    const args = captured['upsert'] as { update: Record<string, unknown> };
    // Only the submitted field is written — apiKeysEnabled is not part of the patch.
    assert.deepEqual(args.update, { mcpEnabled: true });
    assert.deepEqual(dto, { apiKeysEnabled: false, mcpEnabled: true });
  });
});

describe('AppSettingsService.get', () => {
  it('shares one load between concurrent callers on a cold cache', async () => {
    let upserts = 0;
    const prisma = {
      appSettings: {
        upsert: async () => {
          upserts += 1;
          await new Promise((resolve) => setTimeout(resolve, 5));
          return record();
        },
      },
    } as unknown as PrismaService;
    const svc = new AppSettingsService(prisma);
    const results = await Promise.all([svc.get(), svc.get(), svc.get()]);
    assert.equal(upserts, 1);
    assert.ok(results.every((r) => r.apiKeysEnabled === false));
  });

  it('re-reads the row when another process created it first (P2002)', async () => {
    const prisma = {
      appSettings: {
        upsert: async () => {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        },
        findUniqueOrThrow: async () => record({ mcpEnabled: true }),
      },
    } as unknown as PrismaService;
    const svc = new AppSettingsService(prisma);
    assert.equal((await svc.get()).mcpEnabled, true);
  });

  it('rethrows other errors and lets the next call retry', async () => {
    let calls = 0;
    const prisma = {
      appSettings: {
        upsert: async () => {
          calls += 1;
          if (calls === 1) throw new Error('connection lost');
          return record();
        },
      },
    } as unknown as PrismaService;
    const svc = new AppSettingsService(prisma);
    await assert.rejects(svc.get(), /connection lost/);
    assert.equal((await svc.get()).apiKeysEnabled, false);
  });
});
