import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import sharp from 'sharp';
import { ProgressPhotoKind, ProgressPose } from '@luki-fitti/common/enums';
import { UpdatePreferencesSchema } from '@luki-fitti/common/schemas';
import { ProgressService } from './progress.service';
import type { PrismaService } from '../database/prisma.service';
import type { StorageService } from '../storage/storage.service';

function checkIn(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ci-1',
    clientEntryId: 'client-ci-1',
    userId: 'u1',
    takenAt: new Date('2026-11-01T08:00:00Z'),
    note: null,
    bodyWeightClientEntryId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    photos: [],
    ...overrides,
  };
}

function fakePrisma(overrides: Record<string, unknown> = {}) {
  return {
    progressCheckIn: {
      findMany: async () => [],
      findUnique: async () => checkIn(),
      upsert: async ({ create }: { create: object }) => checkIn(create as Record<string, unknown>),
      delete: async () => checkIn(),
      ...(overrides.progressCheckIn as object | undefined),
    },
    progressPhoto: {
      findUnique: async () => null,
      findMany: async () => [],
      create: async ({ data }: { data: object }) => ({
        id: 'ph-1',
        createdAt: new Date(),
        width: null,
        height: null,
        ...data,
      }),
      delete: async () => null,
      deleteMany: async () => ({ count: 0 }),
      ...(overrides.progressPhoto as object | undefined),
    },
  } as unknown as PrismaService;
}

function fakeStorage(overrides: Partial<StorageService> & { isConfigured?: boolean } = {}) {
  const deleted: string[] = [];
  return {
    isConfigured: true,
    deleted,
    put: async () => {},
    get: async () => ({ body: Buffer.from('jpg'), contentType: 'image/jpeg' }),
    deleteMany: async (keys: string[]) => {
      deleted.push(...keys);
    },
    ...overrides,
  } as unknown as StorageService & { deleted: string[] };
}

async function tinyJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 4, height: 4, channels: 3, background: '#e8743b' } })
    .jpeg()
    .toBuffer();
}

describe('ProgressService ownership', () => {
  it('returns 404 for check-ins owned by someone else (delete)', async () => {
    const prisma = fakePrisma({
      progressCheckIn: {
        findUnique: async () => checkIn({ userId: 'other' }),
        delete: async () => checkIn(),
      },
    });
    const service = new ProgressService(prisma, fakeStorage());
    await assert.rejects(() => service.deleteCheckIn('u1', 'ci-1'), NotFoundException);
  });

  it('returns 404 when streaming a photo owned by someone else', async () => {
    const prisma = fakePrisma({
      progressPhoto: {
        findUnique: async () => ({
          storageKey: 'k',
          checkIn: { userId: 'other' },
        }),
      },
    });
    const service = new ProgressService(prisma, fakeStorage());
    await assert.rejects(() => service.getPhoto('u1', 'ph-1'), NotFoundException);
  });
});

describe('ProgressService.upsertCheckIn', () => {
  it('is idempotent on clientEntryId', async () => {
    let calls = 0;
    const prisma = fakePrisma({
      progressCheckIn: {
        findUnique: async () => null,
        upsert: async (args: { create: object }) => {
          calls += 1;
          return checkIn(args.create as Record<string, unknown>);
        },
      },
    });
    const service = new ProgressService(prisma, fakeStorage());
    const dto = { clientEntryId: 'client-ci-1', takenAt: '2026-11-01T08:00:00Z', note: 'first' };
    const first = await service.upsertCheckIn('u1', dto);
    const second = await service.upsertCheckIn('u1', dto);
    assert.equal(first.clientEntryId, 'client-ci-1');
    assert.equal(second.clientEntryId, 'client-ci-1');
    assert.equal(calls, 2); // upsert, never duplicate rows
  });
});

describe('ProgressService photos', () => {
  it('re-uploading a clientPhotoId replaces the row and deletes the old object', async () => {
    const updateCalls: object[] = [];
    const prisma = fakePrisma({
      progressPhoto: {
        findUnique: async () => ({ id: 'old-ph', checkInId: 'ci-1', storageKey: 'old-key' }),
        update: async ({ where, data }: { where: object; data: object }) => {
          updateCalls.push(where);
          return { id: 'old-ph', createdAt: new Date(), ...data };
        },
        create: async () => {
          // Models the @unique clientPhotoId constraint.
          throw new Error('Unique constraint failed on clientPhotoId');
        },
      },
    });
    const storage = fakeStorage();
    const service = new ProgressService(prisma, storage);
    const dto = await service.attachPhoto(
      'u1',
      'client-ci-1',
      { clientPhotoId: 'photo-1', pose: ProgressPose.FRONT, kind: ProgressPhotoKind.PHOTO },
      { buffer: await tinyJpeg() },
    );
    assert.equal(updateCalls.length, 1);
    assert.deepEqual(storage.deleted, ['old-key']);
    assert.equal(dto.id, 'old-ph');
  });

  it('returns 409 and touches nothing when the clientPhotoId belongs to another user', async () => {
    const storage = fakeStorage();
    const prisma = fakePrisma({
      progressPhoto: {
        findUnique: async () => ({ id: 'their-ph', checkInId: 'foreign-ci', storageKey: 'k' }),
        delete: async () => {
          throw new Error('must not delete');
        },
      },
    });
    const service = new ProgressService(prisma, storage);
    const buffer = await tinyJpeg();
    await assert.rejects(
      () =>
        service.attachPhoto(
          'u1',
          'client-ci-1',
          { clientPhotoId: 'stolen-id', pose: ProgressPose.FRONT, kind: ProgressPhotoKind.PHOTO },
          { buffer },
        ),
      ConflictException,
    );
    assert.deepEqual(storage.deleted, []);
  });

  it('returns 409 when the clientPhotoId is on a different check-in of the same user', async () => {
    const prisma = fakePrisma({
      progressPhoto: {
        findUnique: async () => ({ id: 'ph-9', checkInId: 'ci-2', storageKey: 'k' }),
        delete: async () => {
          throw new Error('must not delete');
        },
      },
    });
    const service = new ProgressService(prisma, fakeStorage());
    const buffer = await tinyJpeg();
    await assert.rejects(
      () =>
        service.attachPhoto(
          'u1',
          'client-ci-1',
          { clientPhotoId: 'dup-id', pose: ProgressPose.BACK, kind: ProgressPhotoKind.PHOTO },
          { buffer },
        ),
      ConflictException,
    );
  });

  it('returns 503 when storage is not configured', async () => {
    const service = new ProgressService(fakePrisma(), fakeStorage({ isConfigured: false }));
    const buffer = await tinyJpeg();
    await assert.rejects(
      () =>
        service.attachPhoto(
          'u1',
          'client-ci-1',
          { clientPhotoId: 'p1', pose: ProgressPose.SIDE, kind: ProgressPhotoKind.PHOTO },
          { buffer },
        ),
      ServiceUnavailableException,
    );
  });

  it('deleting a check-in removes its stored objects', async () => {
    const prisma = fakePrisma({
      progressCheckIn: {
        findUnique: async () =>
          checkIn({
            photos: [{ storageKey: 'k1' }, { storageKey: 'k2' }],
          }),
        delete: async () => checkIn(),
      },
    });
    const storage = fakeStorage();
    const service = new ProgressService(prisma, storage);
    await service.deleteCheckIn('u1', 'ci-1');
    assert.deepEqual(storage.deleted, ['k1', 'k2']);
  });
});

describe('UpdatePreferencesSchema goal validation', () => {
  it('accepts only 3, 6 or 12 month horizons', () => {
    for (const horizon of [3, 6, 12]) {
      assert.ok(UpdatePreferencesSchema.safeParse({ goalHorizonMonths: horizon }).success);
    }
    for (const horizon of [1, 4, 9, 24]) {
      assert.ok(!UpdatePreferencesSchema.safeParse({ goalHorizonMonths: horizon }).success);
    }
    assert.ok(UpdatePreferencesSchema.safeParse({ goalHorizonMonths: null }).success);
    assert.ok(UpdatePreferencesSchema.safeParse({ bodyGoal: 'RECOMP' }).success);
    assert.ok(!UpdatePreferencesSchema.safeParse({ bodyGoal: 'BULK' }).success);
  });
});
