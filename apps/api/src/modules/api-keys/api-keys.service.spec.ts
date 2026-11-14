import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import type { ApiKey } from '@luki-fitti/database';
import { ApiKeyScope } from '@luki-fitti/common/enums';
import { parseApiKey } from '@luki-fitti/common/utils';
import type { CreateApiKeyDto } from '@luki-fitti/common/schemas';
import type { PrismaService } from '../database/prisma.service';
import type { AppSettingsService } from '../app-settings/app-settings.service';
import type { EmailService } from '../email/email.service';
import { ApiKeysService } from './api-keys.service';
import { verifyApiKeySecret } from './api-key.crypto';

const USER_ID = 'user-1';
const PASSWORD = 'correct-horse-battery-staple';

const passwordHash = bcrypt.hashSync(PASSWORD, 4);

const makeKey = (overrides: Partial<ApiKey> = {}): ApiKey => ({
  id: 'keyid123',
  userId: USER_ID,
  name: 'Sheets',
  secretHash: 'hash',
  scopes: ['read:workouts'],
  createdAt: new Date('2026-01-01T00:00:00Z'),
  expiresAt: null,
  revokedAt: null,
  lastUsedAt: null,
  ...overrides,
});

const prismaMock = (impl: Record<string, unknown> = {}) =>
  ({
    apiKey: {
      findMany: async () => [],
      create: async ({ data }: { data: Partial<ApiKey> }) => makeKey(data as ApiKey),
      count: async () => 0,
      deleteMany: async () => ({ count: 0 }),
      updateMany: async () => ({ count: 1 }),
      ...((impl.apiKey as object) ?? {}),
    },
    user: {
      findUnique: async () => ({ id: USER_ID, email: 'u@t.dev', name: 'U', passwordHash }),
      ...((impl.user as object) ?? {}),
    },
  }) as unknown as PrismaService;

const appSettings = (apiKeysEnabled: boolean) =>
  ({ get: async () => ({ apiKeysEnabled }) }) as unknown as AppSettingsService;

const emailService = (impl: Partial<EmailService> = {}) =>
  ({
    enqueueApiKeyCreatedEmail: async () => ({ id: 'email-1' }),
    ...impl,
  }) as unknown as EmailService;

const dto = (overrides: Partial<CreateApiKeyDto> = {}): CreateApiKeyDto => ({
  name: 'Sheets',
  scopes: [ApiKeyScope.READ_WORKOUTS],
  expiresInDays: 90,
  currentPassword: PASSWORD,
  ...overrides,
});

const service = (prisma: PrismaService, enabled = true, email = emailService()) =>
  new ApiKeysService(prisma, appSettings(enabled), email);

describe('ApiKeysService.create', () => {
  it('returns the full key once and stores only its HMAC hash', async () => {
    let stored: Partial<ApiKey> | undefined;
    const prisma = prismaMock({
      apiKey: {
        create: async ({ data }: { data: Partial<ApiKey> }) => (
          (stored = data),
          makeKey(data as ApiKey)
        ),
      },
    });
    const result = await service(prisma).create(USER_ID, dto());
    assert.match(result.key, /^lf_pat_[a-z2-7]{8}_[A-Za-z0-9_-]{43}$/);
    // base64url secrets may contain '_' — parse, don't split
    const secret = parseApiKey(result.key)!.secret;
    assert.equal(verifyApiKeySecret(secret, stored!.secretHash!), true);
    assert.notEqual(stored!.secretHash, secret);
    assert.equal(result.apiKey.prefix, `lf_pat_${result.apiKey.id}`);
    // expiry honoured
    const expected = Date.parse(result.apiKey.expiresAt!);
    assert.ok(Math.abs(expected - (Date.now() + 90 * 86_400_000)) < 60_000);
  });

  it('throws 403 when the kill switch is off', async () => {
    await assert.rejects(service(prismaMock(), false).create(USER_ID, dto()), (e: unknown) => {
      assert.ok(e instanceof ForbiddenException);
      assert.deepEqual((e as ForbiddenException).getResponse(), {
        message: 'API keys are disabled',
        code: 'API_KEYS_DISABLED',
      });
      return true;
    });
  });

  it('rejects a wrong current password like changePassword does', async () => {
    await assert.rejects(
      service(prismaMock()).create(USER_ID, dto({ currentPassword: 'nope' })),
      UnauthorizedException,
    );
  });

  it('rejects a 10th active key with API_KEY_LIMIT', async () => {
    const prisma = prismaMock({ apiKey: { count: async () => 10 } });
    await assert.rejects(service(prisma).create(USER_ID, dto()), (e: unknown) => {
      assert.ok(e instanceof ConflictException);
      assert.match(JSON.stringify((e as ConflictException).getResponse()), /API_KEY_LIMIT/);
      return true;
    });
  });

  it('still creates when the notification email fails', async () => {
    const email = emailService({
      enqueueApiKeyCreatedEmail: async () => {
        throw new Error('queue down');
      },
    });
    const result = await service(prismaMock(), true, email).create(USER_ID, dto());
    assert.match(result.key, /^lf_pat_/);
  });

  it('retries on a PK collision for the 8-char id', async () => {
    let calls = 0;
    const prisma = prismaMock({
      apiKey: {
        create: async ({ data }: { data: Partial<ApiKey> }) => {
          calls++;
          if (calls === 1) throw Object.assign(new Error('dup'), { code: 'P2002' });
          return makeKey(data as ApiKey);
        },
      },
    });
    const result = await service(prisma).create(USER_ID, dto());
    assert.equal(calls, 2);
    assert.match(result.key, /^lf_pat_/);
  });
});

describe('ApiKeysService.revoke', () => {
  it('marks the owner-scoped key revoked', async () => {
    let where: unknown;
    const prisma = prismaMock({
      apiKey: {
        updateMany: async (args: { where: unknown }) => ((where = args.where), { count: 1 }),
      },
    });
    assert.deepEqual(await service(prisma).revoke(USER_ID, 'keyid123'), { success: true });
    assert.deepEqual((where as { userId: string }).userId, USER_ID);
    assert.equal(typeof (where as { revokedAt: null }).revokedAt, 'object');
  });

  it('404s on an unknown or foreign key id', async () => {
    const prisma = prismaMock({ apiKey: { updateMany: async () => ({ count: 0 }) } });
    await assert.rejects(service(prisma).revoke(USER_ID, 'foreign'), NotFoundException);
  });
});

describe('ApiKeysService.list', () => {
  it('returns enabled flag and filters out revoked / long-expired keys', async () => {
    let findWhere: unknown;
    let deletedWhere: unknown;
    const prisma = prismaMock({
      apiKey: {
        findMany: async (args: { where: unknown }) => ((findWhere = args.where), [makeKey()]),
        deleteMany: async (args: { where: unknown }) => ((deletedWhere = args.where), { count: 2 }),
      },
    });
    const result = await service(prisma, false).list(USER_ID);
    assert.equal(result.enabled, false);
    assert.equal(result.keys.length, 1);
    const w = findWhere as { revokedAt: null; userId: string };
    assert.equal(w.revokedAt, null);
    assert.equal(w.userId, USER_ID);
    // Lazy purge ran first
    assert.ok(deletedWhere);
  });

  it('marks keys past expiresAt as expired', async () => {
    const past = new Date(Date.now() - 60_000);
    const prisma = prismaMock({
      apiKey: { findMany: async () => [makeKey({ expiresAt: past })] },
    });
    const result = await service(prisma).list(USER_ID);
    assert.equal(result.keys[0]!.status, 'expired');
  });
});
