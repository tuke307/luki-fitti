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
