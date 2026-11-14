import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { ApiKey } from '@luki-fitti/database';
import type { PrismaService } from '../database/prisma.service';
import type { AppSettingsService } from '../app-settings/app-settings.service';
import { ApiKeyGuard } from './api-key.guard';
import { formatApiKey, generateApiKeySecret, hashApiKeySecret } from '../api-keys/api-key.crypto';

const SECRET = generateApiKeySecret();
const KEY_ID = 'abc234de';
const FULL_KEY = formatApiKey(KEY_ID, SECRET);

const record = (overrides: Partial<ApiKey> = {}, user: Record<string, unknown> = {}) => ({
  ...{
    id: KEY_ID,
    userId: 'u1',
    name: 'k',
    secretHash: hashApiKeySecret(SECRET),
    scopes: ['read:workouts'],
    createdAt: new Date(),
    expiresAt: null,
    revokedAt: null,
    lastUsedAt: null,
  },
  ...overrides,
  user: { id: 'u1', email: 'u@t.dev', lockedUntil: null, ...user },
});

const prismaMock = (row: unknown) =>
  ({
    apiKey: { findUnique: async () => row, update: async () => ({}) },
  }) as unknown as PrismaService;

const settings = (apiKeysEnabled: boolean) =>
  ({ get: async () => ({ apiKeysEnabled }) }) as unknown as AppSettingsService;

const ctx = (opts: {
  authorization?: string;
  query?: Record<string, unknown>;
  cookies?: unknown;
}) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: opts.authorization ? { authorization: opts.authorization } : {},
        query: opts.query ?? {},
        cookies: opts.cookies,
        ip: '10.0.0.1',
      }),
    }),
  }) as unknown as ExecutionContext;

const guard = (row: unknown = record(), enabled = true) => {
  const g = new ApiKeyGuard(prismaMock(row), settings(enabled));
  // Test-local in-memory counters instead of Redis.
  const fails = new Map<string, number>();
  g.failCount = async (ip) => fails.get(ip) ?? 0;
  g.countFailure = async (ip) => {
    const n = (fails.get(ip) ?? 0) + 1;
    fails.set(ip, n);
    return n;
  };
  const used = new Set<string>();
  g.touchLastUsed = async (id) => {
    if (used.has(id)) return false;
    used.add(id);
    return true;
  };
  return { g, fails, used };
};

describe('ApiKeyGuard', () => {
  const bearer = `Bearer ${FULL_KEY}`;

  it('accepts a valid key and attaches user + apiKey', async () => {
    const { g } = guard();
    const request: Record<string, unknown> = {
      headers: { authorization: bearer },
      query: {},
      ip: '10.0.0.1',
    };
    const c = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    assert.equal(await g.canActivate(c), true);
    assert.deepEqual(request.user, { id: 'u1', email: 'u@t.dev', permissions: [] });
    assert.deepEqual(request.apiKey, { id: KEY_ID, scopes: ['read:workouts'] });
  });

  it('rejects a key in the query string with 400 invalid_request', async () => {
    const { g } = guard();
    await assert.rejects(
      g.canActivate(ctx({ authorization: bearer, query: { key: FULL_KEY } })),
      (e: unknown) => {
        assert.ok(e instanceof BadRequestException);
        assert.match(JSON.stringify((e as BadRequestException).getResponse()), /invalid_request/);
        return true;
      },
    );
    // even without an Authorization header
    await assert.rejects(
      g.canActivate(ctx({ query: { filter: `lf_pat_${KEY_ID}_${SECRET}` } })),
      BadRequestException,
    );
  });

  it('rejects missing, malformed and app-JWT bearer tokens with a generic 401', async () => {
    const { g } = guard();
    for (const authorization of [undefined, 'Bearer not-a-key', 'Bearer eyJhbGciOi.jwt.token']) {
      await assert.rejects(g.canActivate(ctx({ authorization })), (e: unknown) => {
        assert.ok(e instanceof UnauthorizedException);
        assert.equal((e as UnauthorizedException).message, 'Invalid API key');
        return true;
      });
    }
  });

  it('returns the same generic 401 for unknown id, wrong secret, revoked, expired and locked user', async () => {
    const cases: [string, unknown][] = [
      ['unknown id', null],
      [
        'wrong secret',
        record({ secretHash: hashApiKeySecret('different-secret-padded-to-32-chars-ok') }),
      ],
      ['revoked', record({ revokedAt: new Date() })],
      ['expired', record({ expiresAt: new Date(Date.now() - 1000) })],
    ];
    for (const [label, row] of cases) {
      const { g } = guard(row);
      await assert.rejects(g.canActivate(ctx({ authorization: bearer })), (e: unknown) => {
        assert.ok(e instanceof UnauthorizedException, label);
        assert.equal((e as UnauthorizedException).message, 'Invalid API key', label);
        return true;
      });
    }
    const { g: locked } = guard(record({}, { lockedUntil: new Date(Date.now() + 60_000) }));
    await assert.rejects(locked.canActivate(ctx({ authorization: bearer })), (e: unknown) => {
      assert.ok(e instanceof UnauthorizedException);
      assert.equal((e as UnauthorizedException).message, 'Invalid API key');
      return true;
    });
  });

  it('allows a not-yet-expired key and an unlocked-after lock period', async () => {
    const { g } = guard(record({ expiresAt: new Date(Date.now() + 60_000) }));
    assert.equal(await g.canActivate(ctx({ authorization: bearer })), true);
    const { g: unlocked } = guard(record({}, { lockedUntil: new Date(Date.now() - 60_000) }));
    assert.equal(await unlocked.canActivate(ctx({ authorization: bearer })), true);
  });

  it('denies with 403 api_keys_disabled when the kill switch is off', async () => {
    const { g } = guard(record(), false);
    await assert.rejects(g.canActivate(ctx({ authorization: bearer })), (e: unknown) => {
      assert.ok(e instanceof ForbiddenException);
      assert.match(JSON.stringify((e as ForbiddenException).getResponse()), /api_keys_disabled/);
      return true;
    });
  });

  it('short-circuits with 429 after >30 failed attempts per IP, before the DB lookup', async () => {
    let lookups = 0;
    const prisma = {
      apiKey: { findUnique: async () => (lookups++, record()) },
    } as unknown as PrismaService;
    const g = new ApiKeyGuard(prisma, settings(true));
    g.failCount = async () => 31;
    g.countFailure = async () => 32;
    await assert.rejects(
      g.canActivate(ctx({ authorization: `Bearer ${FULL_KEY}` })),
      (e: unknown) => {
        assert.ok(e instanceof HttpException);
        assert.equal((e as HttpException).getStatus(), HttpStatus.TOO_MANY_REQUESTS);
        return true;
      },
    );
    assert.equal(lookups, 0);
  });

  it('increments the failure counter on invalid credentials only', async () => {
    const { g, fails } = guard(null); // unknown id → failure
    await assert.rejects(g.canActivate(ctx({ authorization: bearer })), UnauthorizedException);
    assert.equal(fails.get('10.0.0.1'), 1);

    const { g: ok, fails: okFails } = guard(record());
    assert.equal(await ok.canActivate(ctx({ authorization: bearer })), true);
    assert.equal(okFails.get('10.0.0.1'), undefined);
  });

  it('writes lastUsedAt at most once per minute per key', async () => {
    let updates = 0;
    const prisma = {
      apiKey: {
        findUnique: async () => record(),
        update: async () => (updates++, {}),
      },
    } as unknown as PrismaService;
    const g = new ApiKeyGuard(prisma, settings(true));
    g.failCount = async () => 0;
    const used = new Set<string>();
    g.touchLastUsed = async (id) => {
      if (used.has(id)) return false;
      used.add(id);
      return true;
    };
    assert.equal(await g.canActivate(ctx({ authorization: bearer })), true);
    // let the fire-and-forget update settle
    await new Promise((r) => setImmediate(r));
    assert.equal(await g.canActivate(ctx({ authorization: bearer })), true);
    await new Promise((r) => setImmediate(r));
    assert.equal(updates, 1);
  });
});
