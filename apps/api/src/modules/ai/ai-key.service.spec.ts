import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiKeySlot } from '@luki-fitti/common/enums';
import type { AiKeyEncryptionConfig } from '@/config/env.config';
import { AiKeyService } from './ai-key.service';
import type { KeyVerification, OpenRouterClient } from './openrouter.client';
import type { PrismaService } from '../database/prisma.service';

// Clearly fake keys (match the OpenRouter format, never real).
const OWN_KEY = 'sk-or-v1-FAKE-OWN-KEY-FOR-TESTING-000000001111';
const ADMIN_KEY = 'sk-or-v1-FAKE-ADMIN-KEY-FOR-TESTING-0000002222';

interface Row {
  id: string;
  userId: string;
  slot: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
  last4: string;
  setByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const pick = (row: Row, select?: Record<string, boolean>) =>
  select ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k as keyof Row]])) : row;

function setup(opts: { config?: AiKeyEncryptionConfig; verify?: KeyVerification } = {}) {
  const rows: Row[] = [];
  const selects: Array<Record<string, boolean> | undefined> = [];
  const matches = (row: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) =>
      v && typeof v === 'object' && 'in' in v
        ? (v as { in: string[] }).in.includes(row[k as keyof Row] as string)
        : row[k as keyof Row] === v,
    );
  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id.startsWith('user-') ? { id: where.id } : null,
    },
    userAiKey: {
      findMany: async ({
        where,
        select,
      }: {
        where: Record<string, unknown>;
        select?: Record<string, boolean>;
      }) => {
        selects.push(select);
        return rows.filter((r) => matches(r, where)).map((r) => pick(r, select));
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        const keep = rows.filter((r) => !matches(r, where));
        const count = rows.length - keep.length;
        rows.splice(0, rows.length, ...keep);
        return { count };
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { userId_slot: { userId: string; slot: string } };
        create: Omit<Row, 'id' | 'createdAt' | 'updatedAt'>;
        update: Partial<Row>;
      }) => {
        const existing = rows.find((r) => matches(r, where.userId_slot));
        if (existing) Object.assign(existing, update, { updatedAt: new Date() });
        else
          rows.push({
            ...create,
            id: `k${rows.length + 1}`,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        return { id: 'x' };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = rows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
  } as unknown as PrismaService;
  const verified: string[] = [];
  const openRouter = {
    verifyKey: async (key: string) => {
      verified.push(key);
      return opts.verify ?? 'valid';
    },
  } as unknown as OpenRouterClient;

  const config: AiKeyEncryptionConfig = opts.config ?? {
    current: { version: 1, key: crypto.randomBytes(32) },
    previous: null,
  };
  class TestAiKeyService extends AiKeyService {
    cfg = config;
    protected override encryption() {
      return this.cfg;
    }
  }
  const service = new TestAiKeyService(prisma, openRouter);
  return { service, rows, selects, verified };
}

describe('AiKeyService', () => {
  it('stores the own key encrypted and only returns status', async () => {
    const { service, rows, verified } = setup();
    const status = await service.setUserKey('user-1', `  ${OWN_KEY}  `);

    assert.deepEqual(verified, [OWN_KEY]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.slot, AiKeySlot.USER);
    assert.ok(!JSON.stringify(rows).includes(OWN_KEY), 'plaintext must not be stored');
    assert.equal(rows[0]!.last4, '1111');
    assert.equal(status.hasKey, true);
    assert.equal(status.source, AiKeySlot.USER);
    assert.equal(status.own?.last4, '1111');
    assert.ok(!JSON.stringify(status).includes(OWN_KEY), 'plaintext must not be returned');
  });

  it('status queries never select ciphertext', async () => {
    const { service, selects } = setup();
    await service.setUserKey('user-1', OWN_KEY);
    await service.status('user-1');
    await service.adminStatusMany(['user-1']);
    for (const select of selects) {
      assert.ok(select && !('ciphertext' in select) && !('iv' in select) && !('authTag' in select));
    }
  });

  it('prefers the own key over the admin-assigned key', async () => {
    const { service } = setup();
    await service.setAdminKey('admin-1', 'user-1', ADMIN_KEY);
    assert.deepEqual(await service.resolveForRun('user-1'), {
      apiKey: ADMIN_KEY,
      source: AiKeySlot.ADMIN,
    });

    await service.setUserKey('user-1', OWN_KEY);
    assert.deepEqual(await service.resolveForRun('user-1'), {
      apiKey: OWN_KEY,
      source: AiKeySlot.USER,
    });

    await service.clearUserKey('user-1');
    assert.deepEqual(await service.resolveForRun('user-1'), {
      apiKey: ADMIN_KEY,
      source: AiKeySlot.ADMIN,
    });

    await service.clearAdminKey('admin-1', 'user-1');
    assert.equal(await service.resolveForRun('user-1'), null);
  });

  it('shows admins whether an own key exists but never its hint', async () => {
    const { service } = setup();
    await service.setUserKey('user-1', OWN_KEY);
    const adminView = await service.setAdminKey('admin-1', 'user-1', ADMIN_KEY);
    assert.equal(adminView.hasOwnKey, true);
    assert.equal(adminView.admin?.last4, '2222');
    assert.ok(!JSON.stringify(adminView).includes('1111'));

    const userView = await service.status('user-1');
    assert.equal(userView.adminAssigned, true);
    assert.ok(!JSON.stringify(userView).includes('2222'), 'users must not see the admin key hint');
  });

  it('keeps keys isolated per user', async () => {
    const { service, rows } = setup();
    await service.setUserKey('user-1', OWN_KEY);
    // Copy user-1's ciphertext onto user-2: AAD binding must make it unusable.
    rows.push({ ...rows[0]!, id: 'k-copy', userId: 'user-2' });
    assert.equal(await service.resolveForRun('user-2'), null);
  });

  it('rejects malformed keys and keys OpenRouter refuses', async () => {
    const { service, rows } = setup({ verify: 'invalid' });
    await assert.rejects(service.setUserKey('user-1', 'not-a-key'), BadRequestException);
    await assert.rejects(service.setUserKey('user-1', OWN_KEY), BadRequestException);
    assert.equal(rows.length, 0);
  });

  it('accepts the key when OpenRouter cannot be reached for verification', async () => {
    const { service, rows } = setup({ verify: 'unknown' });
    await service.setUserKey('user-1', OWN_KEY);
    assert.equal(rows.length, 1);
  });

  it('refuses to store keys without a master key and reports no key', async () => {
    const { service } = setup({ config: { current: null, previous: null } });
    await assert.rejects(service.setUserKey('user-1', OWN_KEY), ServiceUnavailableException);
    const status = await service.status('user-1');
    assert.equal(status.available, false);
    assert.equal(status.hasKey, false);
  });

  it('returns 404 when an admin targets an unknown user', async () => {
    const { service } = setup();
    await assert.rejects(service.setAdminKey('admin-1', 'nobody', ADMIN_KEY), NotFoundException);
  });

  it('re-encrypts lazily after a master key rotation', async () => {
    const v1 = { version: 1, key: crypto.randomBytes(32) };
    const v2 = { version: 2, key: crypto.randomBytes(32) };
    const { service, rows } = setup({ config: { current: v1, previous: null } });
    await service.setUserKey('user-1', OWN_KEY);
    const before = rows[0]!.ciphertext;

    (service as unknown as { cfg: AiKeyEncryptionConfig }).cfg = { current: v2, previous: v1 };
    assert.deepEqual(await service.resolveForRun('user-1'), {
      apiKey: OWN_KEY,
      source: AiKeySlot.USER,
    });
    assert.equal(rows[0]!.keyVersion, 2);
    assert.notEqual(rows[0]!.ciphertext, before);

    // After the old key is removed, the re-encrypted row still works.
    (service as unknown as { cfg: AiKeyEncryptionConfig }).cfg = { current: v2, previous: null };
    assert.deepEqual(await service.resolveForRun('user-1'), {
      apiKey: OWN_KEY,
      source: AiKeySlot.USER,
    });
  });

  it('fails closed when the own key cannot be decrypted (no fallback to the admin key)', async () => {
    const { service } = setup();
    await service.setAdminKey('admin-1', 'user-1', ADMIN_KEY);
    await service.setUserKey('user-1', OWN_KEY);
    (service as unknown as { cfg: AiKeyEncryptionConfig }).cfg = {
      current: { version: 1, key: crypto.randomBytes(32) },
      previous: null,
    };
    assert.equal(await service.resolveForRun('user-1'), null);
  });
});
