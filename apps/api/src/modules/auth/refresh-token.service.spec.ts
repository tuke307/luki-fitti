import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import { RefreshTokenService } from './refresh-token.service';
import { REFRESH_TOKEN_REUSE_GRACE_MS } from '@/config/env.config';
import type { PrismaService } from '../database/prisma.service';
import { ForbiddenException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DeviceSessionSchema } from '@luki-fitti/common/schemas';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import { generateAccessToken, verifyAccessToken } from '@/utils/jwt.util';

interface MockRefreshTokenRow {
  id: string;
  token: string;
  userId: string;
  familyId: string;
  deviceLabel: string | null;
  rotatedAt: Date | null;
  lastUsedAt: Date | null;
  expiresAt: Date;
}

type Where = {
  id?: string;
  token?: string;
  userId?: string;
  familyId?: string;
  rotatedAt?: null;
  expiresAt?: { lt: Date };
};

const matches = (row: MockRefreshTokenRow, where: Where) =>
  (where.id === undefined || row.id === where.id) &&
  (where.token === undefined || row.token === where.token) &&
  (where.userId === undefined || row.userId === where.userId) &&
  (where.familyId === undefined || row.familyId === where.familyId) &&
  (where.rotatedAt === undefined || row.rotatedAt === null) &&
  (where.expiresAt === undefined || row.expiresAt < where.expiresAt.lt);

function createRefreshTokenPrisma() {
  let rows: MockRefreshTokenRow[] = [];
  let seq = 0;
  const refreshToken = {
    create: async ({
      data,
    }: {
      data: Omit<MockRefreshTokenRow, 'id' | 'rotatedAt' | 'lastUsedAt'>;
    }) => {
      const row = { id: `rt-${++seq}`, rotatedAt: null, lastUsedAt: null, ...data };
      rows.push(row);
      return row;
    },
    findUnique: async ({ where }: { where: Where }) => rows.find((r) => matches(r, where)) ?? null,
    updateMany: async ({ where, data }: { where: Where; data: Partial<MockRefreshTokenRow> }) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    },
    deleteMany: async ({ where }: { where: Where }) => {
      const before = rows.length;
      rows = rows.filter((r) => !matches(r, where));
      return { count: before - rows.length };
    },
  };
  return {
    prisma: { refreshToken } as unknown as PrismaService,
    rows: () => rows,
  };
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const future = () => new Date(Date.now() + 60_000);

async function setup() {
  const db = createRefreshTokenPrisma();
  const service = new RefreshTokenService(db.prisma);
  await service.create({
    token: 'a1',
    userId: 'u1',
    expiresAt: future(),
    familyId: 'famA',
    deviceLabel: 'web',
  });
  await service.create({
    token: 'b1',
    userId: 'u1',
    expiresAt: future(),
    familyId: 'famB',
    deviceLabel: 'ios',
  });
  return { db, service };
}

describe('RefreshTokenService', () => {
  it('stores hashed tokens with family and label, pruning expired rows of the user', async () => {
    const { db, service } = await setup();
    await service.create({
      token: 'old',
      userId: 'u1',
      expiresAt: new Date(Date.now() - 1),
      familyId: 'famC',
    });
    await service.create({ token: 'c1', userId: 'u1', expiresAt: future(), familyId: 'famC' });
    assert.ok(db.rows().every((r) => r.token !== 'c1' && r.token !== 'old'));
    assert.equal(
      db.rows().find((r) => r.token === hash('old')),
      undefined,
    );
    assert.equal(db.rows().find((r) => r.token === hash('c1'))?.familyId, 'famC');
  });

  it('rotates a fresh token and keeps the row for reuse detection', async () => {
    const { db, service } = await setup();
    const result = await service.rotate('a1');
    assert.deepEqual(result, { status: 'ok', familyId: 'famA', deviceLabel: 'web' });
    const row = db.rows().find((r) => r.token === hash('a1'));
    assert.ok(row?.rotatedAt);
    assert.ok(row?.lastUsedAt);
  });

  it('accepts reuse within the grace window in the same family', async () => {
    const { service } = await setup();
    await service.rotate('a1');
    assert.deepEqual(await service.rotate('a1'), {
      status: 'ok',
      familyId: 'famA',
      deviceLabel: 'web',
    });
  });

  it('revokes only the reused family after the grace window', async () => {
    const { db, service } = await setup();
    await service.rotate('a1');
    const row = db.rows().find((r) => r.token === hash('a1'))!;
    row.rotatedAt = new Date(Date.now() - REFRESH_TOKEN_REUSE_GRACE_MS - 1000);

    assert.deepEqual(await service.rotate('a1'), { status: 'reused' });
    assert.equal(db.rows().filter((r) => r.familyId === 'famA').length, 0);
    assert.equal(db.rows().filter((r) => r.familyId === 'famB').length, 1);
    assert.deepEqual(await service.rotate('b1'), {
      status: 'ok',
      familyId: 'famB',
      deviceLabel: 'ios',
    });
  });

  it('keeps families independent when rotating', async () => {
    const { db, service } = await setup();
    await service.rotate('a1');
    const b = db.rows().find((r) => r.token === hash('b1'));
    assert.equal(b?.rotatedAt, null);
  });

  it('returns invalid for missing or expired tokens', async () => {
    const { db, service } = await setup();
    assert.deepEqual(await service.rotate('nope'), { status: 'invalid' });
    db.rows().find((r) => r.token === hash('b1'))!.expiresAt = new Date(Date.now() - 1);
    assert.deepEqual(await service.rotate('b1'), { status: 'invalid' });
  });

  it('deletes the family of a raw token', async () => {
    const { db, service } = await setup();
    await service.deleteByHashedTokenOf('b1');
    assert.deepEqual(
      db.rows().map((r) => r.familyId),
      ['famA'],
    );
    await service.deleteByHashedTokenOf('unknown');
    assert.equal(db.rows().length, 1);
  });
});

describe('AuthController sessions', () => {
  const user = { id: 'u1', email: 'u1@example.com', name: null };

  function createController() {
    const db = createRefreshTokenPrisma();
    const refreshTokenService = new RefreshTokenService(db.prisma);
    const authService = {
      getUserById: async (id: string) => (id === user.id ? user : null),
      authenticateUser: async () => user,
    } as unknown as AuthService;
    const controller = new AuthController(authService, refreshTokenService);
    const denied: string[] = [];
    controller.denylistJti = async (jti) => {
      denied.push(jti);
    };
    return { controller, db, denied };
  }

  function createReq(
    opts: {
      bearer?: string;
      cookies?: Record<string, string>;
      headers?: Record<string, string>;
    } = {},
  ) {
    const headers: Record<string, string> = { ...opts.headers };
    if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
    return {
      headers,
      cookies: opts.cookies ?? {},
      header: (name: string) => headers[name.toLowerCase()],
    } as unknown as Request;
  }

  function createRes() {
    const set: string[] = [];
    const cleared: string[] = [];
    const res = {
      cookie: (name: string) => set.push(name),
      clearCookie: (name: string) => cleared.push(name),
    } as unknown as Response;
    return { res, set, cleared };
  }

  async function login(controller: AuthController, label: string) {
    const result = await controller.login(
      { email: user.email, password: 'x' },
      createReq({ headers: { 'x-device-label': label } }),
      createRes().res,
    );
    return result.tokens!;
  }

  const sidOf = (token: string) => verifyAccessToken(token).sid!;

  it('creates a separate family per login with its device label', async () => {
    const { controller, db } = createController();
    const web = await login(controller, 'web');
    const ios = await login(controller, 'iOS');
    assert.notEqual(sidOf(web.accessToken), sidOf(ios.accessToken));
    assert.deepEqual(
      db
        .rows()
        .map((r) => r.deviceLabel)
        .sort(),
      ['ios', 'web'],
    );
  });

  it('falls back to "unknown" for invalid device labels', async () => {
    const { controller, db } = createController();
    await login(controller, 'not a label!');
    assert.equal(db.rows()[0]?.deviceLabel, 'unknown');
  });

  it('refreshes in the same family and prefers the body token over the cookie', async () => {
    const { controller, db } = createController();
    const web = await login(controller, 'web');
    const ios = await login(controller, 'ios');
    const { res, set } = createRes();
    const result = await controller.refreshToken(
      createReq({ cookies: { refreshToken: web.refreshToken } }),
      res,
      { refreshToken: ios.refreshToken },
    );
    assert.equal(sidOf(result.tokens.accessToken), sidOf(ios.accessToken));
    assert.deepEqual(set.sort(), ['accessToken', 'csrfToken', 'refreshToken']);
    assert.equal(db.rows().find((r) => r.token === hash(web.refreshToken))?.rotatedAt, null);
    assert.equal(db.rows().filter((r) => r.familyId === sidOf(ios.accessToken)).length, 2);
  });

  it('rejects a replayed token after the grace window with 403 and keeps other families', async () => {
    const { controller, db } = createController();
    const web = await login(controller, 'web');
    const ios = await login(controller, 'ios');
    await controller.refreshToken(createReq(), createRes().res, { refreshToken: web.refreshToken });
    db.rows().find((r) => r.token === hash(web.refreshToken))!.rotatedAt = new Date(0);

    const { res, cleared } = createRes();
    await assert.rejects(
      controller.refreshToken(createReq(), res, { refreshToken: web.refreshToken }),
      ForbiddenException,
    );
    assert.ok(cleared.includes('refreshToken'));
    assert.equal(db.rows().filter((r) => r.familyId === sidOf(web.accessToken)).length, 0);
    const again = await controller.refreshToken(createReq(), createRes().res, {
      refreshToken: ios.refreshToken,
    });
    assert.equal(again.success, true);
  });

  it('logout revokes only the family of the access token sid', async () => {
    const { controller, db, denied } = createController();
    const web = await login(controller, 'web');
    const ios = await login(controller, 'ios');
    const { res, cleared } = createRes();
    await controller.logout(createReq({ bearer: web.accessToken }), res, undefined);
    assert.equal(denied.length, 1);
    assert.ok(cleared.includes('accessToken'));
    assert.deepEqual(
      db.rows().map((r) => r.familyId),
      [sidOf(ios.accessToken)],
    );
  });

  it('logout falls back to the refresh token family when the access token has no sid', async () => {
    const { controller, db } = createController();
    const web = await login(controller, 'web');
    const ios = await login(controller, 'ios');
    const legacyAccess = generateAccessToken(user);
    await controller.logout(createReq({ bearer: legacyAccess }), createRes().res, {
      refreshToken: ios.refreshToken,
    });
    assert.deepEqual(
      db.rows().map((r) => r.familyId),
      [sidOf(web.accessToken)],
    );
  });

  it('logout without sid or refresh token revokes nothing', async () => {
    const { controller, db } = createController();
    await login(controller, 'web');
    await login(controller, 'ios');
    await controller.logout(
      createReq({ bearer: generateAccessToken(user) }),
      createRes().res,
      undefined,
    );
    assert.equal(db.rows().length, 2);
  });

  it('logout-all revokes every family of the user', async () => {
    const { controller, db, denied } = createController();
    const web = await login(controller, 'web');
    await login(controller, 'ios');
    const { res, cleared } = createRes();
    const result = await controller.logoutAll(user, createReq({ bearer: web.accessToken }), res);
    assert.deepEqual(result, { success: true });
    assert.equal(db.rows().length, 0);
    assert.equal(denied.length, 1);
    assert.ok(cleared.includes('refreshToken'));
  });

  it('device-session issues a new family without setting cookies', async () => {
    const { controller, db } = createController();
    const ios = await login(controller, 'ios');
    const { res, set } = createRes();
    const result = await controller.createDeviceSession(user, { deviceLabel: 'watchos' }, res);
    assert.equal(result.success, true);
    assert.deepEqual(set, []);
    assert.notEqual(sidOf(result.tokens.accessToken), sidOf(ios.accessToken));
    const row = db.rows().find((r) => r.token === hash(result.tokens.refreshToken));
    assert.equal(row?.deviceLabel, 'watchos');
    assert.equal(row?.familyId, sidOf(result.tokens.accessToken));
  });

  it('validates device-session labels', () => {
    assert.deepEqual(DeviceSessionSchema.parse({ deviceLabel: ' WatchOS ' }), {
      deviceLabel: 'watchos',
    });
    assert.throws(() => DeviceSessionSchema.parse({ deviceLabel: 'apple watch' }));
  });
});
