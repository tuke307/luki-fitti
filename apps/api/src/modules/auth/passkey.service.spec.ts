import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PasskeyService, type ChallengeStore } from './passkey.service';
import type { PrismaService } from '../database/prisma.service';

interface PasskeyRow {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: Buffer;
  counter: bigint;
  transports: string[];
  deviceType: string;
  backedUp: boolean;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

function memoryChallenges() {
  const map = new Map<string, string>();
  const store: ChallengeStore = {
    put: async (key, challenge) => {
      map.set(key, challenge);
    },
    take: async (key) => {
      const value = map.get(key) ?? null;
      map.delete(key);
      return value;
    },
  };
  return { store, map };
}

function createPasskeyPrisma(rows: PasskeyRow[] = [], opts: { passwordHash?: string | null } = {}) {
  const passkeys = [...rows];
  const oauthAccounts: Array<{ userId: string }> = [];
  const userRow = { passwordHash: opts.passwordHash ?? null };

  const prisma = {
    passkey: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        passkeys.filter((p) => p.userId === where.userId),
      findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
        passkeys.find((p) => p.id === where.id && p.userId === where.userId) ?? null,
      findUnique: async ({ where }: { where: { credentialId: string } }) => {
        const p = passkeys.find((x) => x.credentialId === where.credentialId);
        return p ? { ...p, user: { id: p.userId, emailVerified: true, lockedUntil: null } } : null;
      },
      count: async ({ where }: { where: { userId: string; id?: { not: string } } }) =>
        passkeys.filter((p) => p.userId === where.userId && p.id !== where.id?.not).length,
      create: async ({ data }: { data: Omit<PasskeyRow, 'id' | 'createdAt' | 'lastUsedAt'> }) => {
        const row = {
          id: `pk-${passkeys.length + 1}`,
          createdAt: new Date(),
          lastUsedAt: null,
          ...data,
        };
        passkeys.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<PasskeyRow> }) => {
        const row = passkeys.find((p) => p.id === where.id);
        if (!row) throw new Error('Not found');
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const i = passkeys.findIndex((p) => p.id === where.id);
        if (i < 0) throw new Error('Not found');
        return passkeys.splice(i, 1)[0];
      },
    },
    user: {
      findUnique: async () => userRow,
    },
    oAuthAccount: {
      count: async ({ where }: { where: { userId: string } }) =>
        oauthAccounts.filter((a) => a.userId === where.userId).length,
    },
  };

  return {
    prisma: prisma as unknown as PrismaService,
    passkeys,
    oauthAccounts,
  };
}

const makeRow = (over: Partial<PasskeyRow> = {}): PasskeyRow => ({
  id: 'pk-1',
  userId: 'u1',
  credentialId: 'cred-1',
  publicKey: Buffer.alloc(4),
  counter: 0n,
  transports: [],
  deviceType: 'singleDevice',
  backedUp: false,
  name: 'Passkey 1',
  createdAt: new Date(),
  lastUsedAt: null,
  ...over,
});

function createService(rows: PasskeyRow[] = [], opts: { passwordHash?: string | null } = {}) {
  const db = createPasskeyPrisma(rows, opts);
  const service = new PasskeyService(db.prisma);
  const challenges = memoryChallenges();
  service.challenges = challenges.store;
  return { service, db, challenges };
}

const user = { id: 'u1', email: 'a@b.c', name: null };

describe('PasskeyService', () => {
  it('registrationOptions stores the challenge under reg:<userId>', async () => {
    const { service, challenges } = createService();
    const options = await service.registrationOptions(user);
    assert.equal(challenges.map.get('reg:u1'), options.challenge);
  });

  it('registrationOptions throws ConflictException at 10 passkeys', async () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      makeRow({ id: `pk-${i}`, credentialId: `c-${i}` }),
    );
    const { service } = createService(rows);
    await assert.rejects(() => service.registrationOptions(user), ConflictException);
  });

  it('verifyRegistration without a stored challenge → BadRequest', async () => {
    const { service } = createService();
    await assert.rejects(() => service.verifyRegistration('u1', {}), BadRequestException);
  });

  it('the registration challenge is single-use', async () => {
    const { service, challenges } = createService();
    await service.registrationOptions(user);
    challenges.map.set('reg:u1', 'abc');
    await assert.rejects(() => service.verifyRegistration('u1', {}), BadRequestException);
    // take() consumed it — a second call hits the missing-challenge branch.
    await assert.rejects(() => service.verifyRegistration('u1', {}), /expired/i);
  });

  it('verifyRegistration maps a malformed response to BadRequest, not a 500', async () => {
    const { service, challenges } = createService();
    challenges.map.set('reg:u1', 'abc');
    await assert.rejects(
      () => service.verifyRegistration('u1', { garbage: true }),
      BadRequestException,
    );
  });

  it('loginOptions returns a challengeId and stores the challenge', async () => {
    const { service, challenges } = createService();
    const { challengeId } = await service.loginOptions();
    assert.ok(challengeId.length >= 16);
    assert.ok(challenges.map.get(`auth:${challengeId}`));
  });

  it('verifyLogin with an expired/unknown challenge → Unauthorized', async () => {
    const { service } = createService();
    await assert.rejects(
      () => service.verifyLogin('nope', { id: 'cred-1' }),
      UnauthorizedException,
    );
  });

  it('verifyLogin with an unknown credential id → Unauthorized', async () => {
    const { service, challenges } = createService();
    challenges.map.set('auth:cid', 'chal');
    await assert.rejects(
      () => service.verifyLogin('cid', { id: 'unknown-cred' }),
      /Unknown passkey/i,
    );
  });

  it('verifyLogin rejects a userHandle bound to another account', async () => {
    const { service, challenges } = createService([makeRow()]);
    challenges.map.set('auth:cid', 'chal');
    const otherHandle = Buffer.from('someone-else').toString('base64url');
    await assert.rejects(
      () => service.verifyLogin('cid', { id: 'cred-1', response: { userHandle: otherHandle } }),
      /does not match/i,
    );
  });

  it('rename/remove of a passkey owned by another user → NotFound', async () => {
    const { service } = createService([makeRow({ userId: 'other-user' })]);
    await assert.rejects(() => service.rename('u1', 'pk-1', 'new'), NotFoundException);
    await assert.rejects(() => service.remove('u1', 'pk-1'), NotFoundException);
  });

  it('rename updates the name of an owned passkey', async () => {
    const { service } = createService([makeRow()]);
    const dto = await service.rename('u1', 'pk-1', 'Laptop');
    assert.equal(dto.name, 'Laptop');
  });

  it('remove refuses to delete the last sign-in method', async () => {
    const { service } = createService([makeRow()], { passwordHash: null });
    await assert.rejects(() => service.remove('u1', 'pk-1'), ConflictException);
  });

  it('remove is allowed when a password (or another method) remains', async () => {
    const { service, db } = createService([makeRow()], { passwordHash: 'hash' });
    await service.remove('u1', 'pk-1');
    assert.equal(db.passkeys.length, 0);
  });
});
