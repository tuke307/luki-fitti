import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { generateSync } from 'otplib';
import { TwoFactorService } from './two-factor.service';
import { hashRecoveryCode } from '@/utils/secret-box.util';
import type { PrismaService } from '../database/prisma.service';

process.env.TWO_FACTOR_ENCRYPTION_KEY ??= 'fake-two-factor-key-for-unit-tests-only';

interface TwoFactorRow {
  userId: string;
  secretEnc: string;
  enabledAt: Date | null;
  lastStep: number | null;
}

interface RecoveryRow {
  id: string;
  userId: string;
  codeHash: string;
  usedAt: Date | null;
}

function createTwoFactorPrisma() {
  const twoFactors = new Map<string, TwoFactorRow>();
  let recoveryRows: RecoveryRow[] = [];
  let seq = 0;

  const prisma = {
    twoFactor: {
      findUnique: async ({ where }: { where: { userId: string } }) =>
        twoFactors.get(where.userId) ?? null,
      upsert: async ({
        where,
        update,
        create,
      }: {
        where: { userId: string };
        update: Partial<TwoFactorRow>;
        create: { userId: string; secretEnc: string };
      }) => {
        const existing = twoFactors.get(where.userId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { enabledAt: null, lastStep: null, ...create };
        twoFactors.set(where.userId, row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { userId: string };
        data: Partial<TwoFactorRow>;
      }) => {
        const row = twoFactors.get(where.userId);
        if (!row) throw new Error('Not found');
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { userId: string; OR?: Array<Record<string, unknown>> };
        data: Partial<TwoFactorRow>;
      }) => {
        const row = twoFactors.get(where.userId);
        const matchesOr = (where.OR ?? []).some(
          (cond) =>
            ('lastStep' in cond && cond.lastStep === null && row?.lastStep === null) ||
            (typeof cond.lastStep === 'object' &&
              cond.lastStep !== null &&
              row !== undefined &&
              row.lastStep !== null &&
              row.lastStep < (cond.lastStep as { lt: number }).lt),
        );
        if (!row || !matchesOr) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      delete: async ({ where }: { where: { userId: string } }) => {
        const row = twoFactors.get(where.userId);
        twoFactors.delete(where.userId);
        return row;
      },
    },
    recoveryCode: {
      count: async ({ where }: { where: { userId: string; usedAt: null } }) =>
        recoveryRows.filter((r) => r.userId === where.userId && r.usedAt === null).length,
      findMany: async ({ where }: { where: { userId: string; usedAt: null } }) =>
        recoveryRows.filter((r) => r.userId === where.userId && r.usedAt === null),
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; usedAt: null };
        data: { usedAt: Date };
      }) => {
        const hit = recoveryRows.filter((r) => r.id === where.id && r.usedAt === null);
        hit.forEach((r) => (r.usedAt = data.usedAt));
        return { count: hit.length };
      },
      createMany: async ({ data }: { data: Array<{ userId: string; codeHash: string }> }) => {
        data.forEach((d) =>
          recoveryRows.push({
            id: `rc-${++seq}`,
            userId: d.userId,
            codeHash: d.codeHash,
            usedAt: null,
          }),
        );
        return { count: data.length };
      },
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        const before = recoveryRows.length;
        recoveryRows = recoveryRows.filter((r) => r.userId !== where.userId);
        return { count: before - recoveryRows.length };
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };

  return {
    prisma: prisma as unknown as PrismaService,
    twoFactors,
    recoveryRows: () => recoveryRows,
  };
}

const EPOCH_MS = 1_800_000_000_000; // pinned clock
const totpAt = (secret: string, epochMs: number, offsetSteps = 0) =>
  generateSync({ secret, epoch: Math.floor(epochMs / 1000) + offsetSteps * 30 });

function createService() {
  const db = createTwoFactorPrisma();
  const service = new TwoFactorService(db.prisma);
  service.countAttempt = async () => 1;
  service.now = () => EPOCH_MS;
  return { service, db };
}

const user = { id: 'u1', email: 'athlete@lukifitti.de' };

describe('TwoFactorService', () => {
  it('setup returns a secret + otpauth URL and stores the secret encrypted', async () => {
    const { service, db } = createService();
    const { secret, otpauthUrl } = await service.setup(user);

    assert.match(otpauthUrl, /^otpauth:\/\/totp\//);
    assert.ok(otpauthUrl.includes('LukiFitti'));
    assert.ok(
      otpauthUrl.includes(encodeURIComponent(user.email)) || otpauthUrl.includes(user.email),
    );

    const stored = db.twoFactors.get(user.id)!;
    assert.ok(stored.secretEnc);
    assert.notEqual(stored.secretEnc, secret);
    assert.equal(stored.enabledAt, null);
  });

  it('setup throws ConflictException when 2FA is already enabled', async () => {
    const { service, db } = createService();
    db.twoFactors.set(user.id, {
      userId: user.id,
      secretEnc: 'x',
      enabledAt: new Date(),
      lastStep: null,
    });
    await assert.rejects(() => service.setup(user), ConflictException);
  });

  it('enable requires a prior setup and rejects a wrong code', async () => {
    const { service } = createService();
    await assert.rejects(() => service.enable(user.id, '123456'), BadRequestException);

    await service.setup(user);
    await assert.rejects(() => service.enable(user.id, '000000'), UnauthorizedException);
  });

  it('enable with a valid code turns 2FA on and issues 10 hashed recovery codes', async () => {
    const { service, db } = createService();
    const { secret } = await service.setup(user);

    const { recoveryCodes } = await service.enable(user.id, totpAt(secret, EPOCH_MS));

    assert.equal(recoveryCodes.length, 10);
    recoveryCodes.forEach((c) => assert.match(c, /^[a-z2-9]{5}-[a-z2-9]{5}$/));
    assert.ok(db.twoFactors.get(user.id)!.enabledAt);
    assert.equal(await service.isEnabled(user.id), true);
    assert.equal(db.recoveryRows().length, 10);
    db.recoveryRows().forEach((r) => {
      assert.match(r.codeHash, /^[0-9a-f]{64}$/);
      assert.ok(!recoveryCodes.includes(r.codeHash));
    });
    // Stored hashes match the keyed hash of the normalized code.
    const normalized = recoveryCodes[0]!.replace('-', '');
    assert.equal(
      db.recoveryRows().some((r) => r.codeHash === hashRecoveryCode(normalized)),
      true,
    );
  });

  it('verify returns false when 2FA is not enabled', async () => {
    const { service } = createService();
    assert.equal(await service.verify(user.id, '123456'), false);
  });

  it('accepts a valid TOTP exactly once and rejects replays and stale steps', async () => {
    const { service } = createService();
    const { secret } = await service.setup(user);
    await service.enable(user.id, totpAt(secret, EPOCH_MS));

    // otplib only accepts ±1 step, so the next verifiable code is one step out.
    const next = totpAt(secret, EPOCH_MS, 1);

    // The code used to enable must not be reusable.
    assert.equal(await service.verify(user.id, totpAt(secret, EPOCH_MS)), false);

    assert.equal(await service.verify(user.id, next), true);
    // Replay of the same step fails.
    assert.equal(await service.verify(user.id, next), false);
    // A code from an earlier step after a newer one was accepted fails.
    assert.equal(await service.verify(user.id, totpAt(secret, EPOCH_MS)), false);
  });

  it('accepts a recovery code once, case/format-insensitively', async () => {
    const { service } = createService();
    const { secret } = await service.setup(user);
    const { recoveryCodes } = await service.enable(user.id, totpAt(secret, EPOCH_MS));

    const mangled = recoveryCodes[0]!.replace('-', '').toUpperCase();
    assert.equal(await service.verify(user.id, mangled), true);
    assert.equal(await service.verify(user.id, recoveryCodes[0]!), false);
    assert.equal(await service.verify(user.id, 'zzzzz-zzzzz'), false);
    assert.equal(await service.verify(user.id, 'not-a-code'), false);
  });

  it('throttles after too many attempts', async () => {
    const { service } = createService();
    const { secret } = await service.setup(user);
    service.countAttempt = async () => 6;
    await assert.rejects(
      () => service.enable(user.id, totpAt(secret, EPOCH_MS)),
      (err: unknown) => err instanceof HttpException && (err as HttpException).getStatus() === 429,
    );
  });

  it('verify is throttled too once enabled', async () => {
    const { service, db } = createService();
    const { secret } = await service.setup(user);
    await service.enable(user.id, totpAt(secret, EPOCH_MS));
    assert.ok(db.twoFactors.get(user.id)!.enabledAt);
    service.countAttempt = async () => 6;
    await assert.rejects(
      () => service.verify(user.id, totpAt(secret, EPOCH_MS, 1)),
      (err: unknown) => err instanceof HttpException && (err as HttpException).getStatus() === 429,
    );
  });

  it('disable requires a valid code and wipes 2FA + recovery codes', async () => {
    const { service, db } = createService();
    const { secret } = await service.setup(user);
    const { recoveryCodes } = await service.enable(user.id, totpAt(secret, EPOCH_MS));

    await assert.rejects(() => service.disable(user.id, '000000'), UnauthorizedException);
    assert.ok(db.twoFactors.get(user.id));
    assert.equal(db.recoveryRows().length, 10);

    await service.disable(user.id, recoveryCodes[0]!);
    assert.equal(db.twoFactors.get(user.id), undefined);
    assert.equal(db.recoveryRows().length, 0);
    assert.equal(await service.isEnabled(user.id), false);
  });
});
