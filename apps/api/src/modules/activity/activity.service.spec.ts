import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import {
  HealthActivityRangeQuerySchema,
  ImportHealthActivitySchema,
  type HealthWorkoutInputDto,
  type ImportHealthActivityDto,
} from '@luki-fitti/common/schemas';
import { ActivityService } from './activity.service';
import type { PrismaService } from '../database/prisma.service';

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

interface Range {
  in?: unknown[];
  gte?: unknown;
  lte?: unknown;
}

const isRange = (value: unknown): value is Range =>
  typeof value === 'object' && value !== null && !(value instanceof Date);

const cmp = (a: unknown, b: unknown): number => {
  const va = a instanceof Date ? a.getTime() : (a as string | number);
  const vb = b instanceof Date ? b.getTime() : (b as string | number);
  return va < vb ? -1 : va > vb ? 1 : 0;
};

function matches(row: Row, where: Where = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (isRange(cond)) {
      if (cond.in && !cond.in.includes(value)) return false;
      if (cond.gte !== undefined && cmp(value, cond.gte) < 0) return false;
      if (cond.lte !== undefined && cmp(value, cond.lte) > 0) return false;
      return true;
    }
    return value instanceof Date && cond instanceof Date
      ? value.getTime() === cond.getTime()
      : value === cond;
  });
}

function pick(row: Row, select?: Record<string, boolean>): Row {
  if (!select) return { ...row };
  return Object.fromEntries(Object.keys(select).map((k) => [k, row[k]]));
}

function createTable(prefix: string, uniqueKey: (row: Row) => string) {
  const rows: Row[] = [];
  const writes: Array<{ op: string; where?: Where }> = [];
  let seq = 0;
  return {
    rows,
    writes,
    api: {
      findMany: async ({
        where,
        orderBy,
        select,
        take,
      }: {
        where: Where;
        orderBy?: Record<string, 'asc' | 'desc'>;
        select?: Record<string, boolean>;
        take?: number;
      }) => {
        let list = rows.filter((r) => matches(r, where));
        if (orderBy) {
          const [[key, dir]] = Object.entries(orderBy) as [[string, 'asc' | 'desc']];
          list = [...list].sort((a, b) => (dir === 'asc' ? 1 : -1) * cmp(a[key], b[key]));
        }
        return list.slice(0, take ?? Infinity).map((r) => pick(r, select));
      },
      createMany: async ({ data }: { data: Row[]; skipDuplicates?: boolean }) => {
        writes.push({ op: 'createMany' });
        let count = 0;
        for (const item of data) {
          if (rows.some((r) => uniqueKey(r) === uniqueKey(item))) continue;
          const now = new Date();
          rows.push({ id: `${prefix}-${++seq}`, createdAt: now, updatedAt: now, ...item });
          count++;
        }
        return { count };
      },
      updateMany: async ({ where, data }: { where: Where; data: Row }) => {
        writes.push({ op: 'updateMany', where });
        const list = rows.filter((r) => matches(r, where));
        for (const r of list) Object.assign(r, data, { updatedAt: new Date() });
        return { count: list.length };
      },
      deleteMany: async ({ where }: { where: Where }) => {
        writes.push({ op: 'deleteMany', where });
        let count = 0;
        for (let i = rows.length - 1; i >= 0; i--) {
          if (matches(rows[i]!, where)) {
            rows.splice(i, 1);
            count++;
          }
        }
        return { count };
      },
    },
  };
}

function createMockPrisma() {
  const days = createTable('day', (r) => `${String(r.userId)}|${String(r.day)}`);
  const workouts = createTable('wo', (r) => `${String(r.userId)}|${String(r.healthKitUuid)}`);
  let transactions = 0;
  const prisma = {
    healthDailyEnergy: days.api,
    healthWorkout: workouts.api,
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
      transactions++;
      return fn(prisma);
    },
  };
  return {
    prisma: prisma as unknown as PrismaService,
    days,
    workouts,
    transactionCount: () => transactions,
  };
}

const UUID_A = '6f1c2a8e-3b4d-4e5f-9a0b-1c2d3e4f5a01';
const UUID_B = '6f1c2a8e-3b4d-4e5f-9a0b-1c2d3e4f5a02';
const UUID_C = '6f1c2a8e-3b4d-4e5f-9a0b-1c2d3e4f5a03';

const workout = (
  healthKitUuid: string,
  startedAt: string,
  extra: Partial<HealthWorkoutInputDto> = {},
): HealthWorkoutInputDto => ({
  healthKitUuid,
  activityType: 'running',
  sourceName: 'Strava',
  isOwn: false,
  startedAt,
  endedAt: new Date(Date.parse(startedAt) + 30 * 60 * 1000).toISOString(),
  activeKcal: 300,
  distanceMeters: 5000,
  ...extra,
});

const payload = (p: Partial<ImportHealthActivityDto>): ImportHealthActivityDto => ({
  days: [],
  workouts: [],
  deletedWorkoutUuids: [],
  ...p,
});

describe('ActivityService.importHealthKit', () => {
  it('upserts days by (user, day) and workouts by (user, HealthKit UUID) in one transaction', async () => {
    const { prisma, days, workouts, transactionCount } = createMockPrisma();
    const service = new ActivityService(prisma);

    const first = await service.importHealthKit(
      'me',
      payload({
        days: [
          { day: '2026-10-30', activeKcal: 500 },
          { day: '2026-10-31', activeKcal: 200 },
          { day: '2026-10-31', activeKcal: 250 },
        ],
        workouts: [
          workout(UUID_A, '2026-10-30T07:00:00Z'),
          workout(UUID_B, '2026-10-31T17:00:00Z'),
        ],
      }),
    );
    assert.deepEqual(first, { daysUpserted: 2, workoutsUpserted: 2, workoutsDeleted: 0 });
    assert.equal(transactionCount(), 1);
    assert.equal(days.rows.length, 2);
    assert.equal(days.rows.find((d) => d.day === '2026-10-31')!.activeKcal, 250, 'last wins');
    assert.equal(workouts.rows.length, 2);

    // Re-sync: a day grew, a workout was corrected, one is unchanged.
    workouts.writes.length = 0;
    const second = await service.importHealthKit(
      'me',
      payload({
        days: [{ day: '2026-10-31', activeKcal: 640 }],
        workouts: [
          workout(UUID_A, '2026-10-30T07:00:00Z'),
          workout(UUID_B, '2026-10-31T17:00:00Z', { activeKcal: 410, distanceMeters: null }),
        ],
      }),
    );
    assert.deepEqual(second, { daysUpserted: 1, workoutsUpserted: 2, workoutsDeleted: 0 });
    assert.equal(days.rows.length, 2);
    assert.equal(days.rows.find((d) => d.day === '2026-10-31')!.activeKcal, 640);
    assert.equal(workouts.rows.length, 2);
    const b = workouts.rows.find((w) => w.healthKitUuid === UUID_B)!;
    assert.equal(b.activeKcal, 410);
    assert.equal(b.distanceMeters, null);
    assert.deepEqual(
      workouts.writes.map((w) => w.op),
      ['updateMany'],
      'only the changed workout is written',
    );
    assert.equal(workouts.writes[0]!.where!.userId, 'me');
  });

  it("keeps users apart and only deletes the caller's workouts", async () => {
    const { prisma, days, workouts } = createMockPrisma();
    const service = new ActivityService(prisma);
    await service.importHealthKit(
      'other',
      payload({
        days: [{ day: '2026-10-30', activeKcal: 999 }],
        workouts: [workout(UUID_A, '2026-10-30T07:00:00Z', { activeKcal: 111 })],
      }),
    );
    await service.importHealthKit(
      'me',
      payload({
        days: [{ day: '2026-10-30', activeKcal: 400 }],
        workouts: [
          workout(UUID_A, '2026-10-30T07:00:00Z'),
          workout(UUID_B, '2026-10-30T18:00:00Z'),
        ],
      }),
    );
    assert.equal(days.rows.length, 2);
    assert.equal(days.rows.find((d) => d.userId === 'other')!.activeKcal, 999);
    assert.equal(workouts.rows.find((w) => w.userId === 'other')!.activeKcal, 111);

    const result = await service.importHealthKit(
      'me',
      payload({
        // UUID_C is new but also reported deleted: it must not be created.
        workouts: [workout(UUID_C, '2026-10-31T07:00:00Z')],
        deletedWorkoutUuids: [UUID_A, UUID_A, UUID_C],
      }),
    );
    assert.deepEqual(result, { daysUpserted: 0, workoutsUpserted: 0, workoutsDeleted: 1 });
    assert.deepEqual(
      workouts.rows.map((w) => [w.userId, w.healthKitUuid]).sort(),
      [
        ['me', UUID_B],
        ['other', UUID_A],
      ],
      "the other user's workout with the same UUID survives",
    );
    const del = workouts.writes.find((w) => w.op === 'deleteMany')!;
    assert.equal(del.where!.userId, 'me');
  });

  it('accepts an empty delta without writing', async () => {
    const { prisma, days, workouts } = createMockPrisma();
    const service = new ActivityService(prisma);
    assert.deepEqual(await service.importHealthKit('me', payload({})), {
      daysUpserted: 0,
      workoutsUpserted: 0,
      workoutsDeleted: 0,
    });
    assert.equal(days.writes.length + workouts.writes.length, 0);
  });
});

describe('ActivityService.listActivity', () => {
  it('returns the users days (with a day of slack) and workouts in range, oldest first', async () => {
    const { prisma } = createMockPrisma();
    const service = new ActivityService(prisma);
    await service.importHealthKit(
      'me',
      payload({
        days: [
          { day: '2026-10-27', activeKcal: 1 },
          { day: '2026-10-28', activeKcal: 2 },
          { day: '2026-11-01', activeKcal: 4 },
          { day: '2026-10-30', activeKcal: 3 },
          { day: '2026-11-02', activeKcal: 5 },
        ],
        workouts: [
          workout(UUID_B, '2026-10-31T17:00:00Z'),
          workout(UUID_A, '2026-10-29T07:00:00Z'),
          workout(UUID_C, '2026-10-28T23:00:00Z'),
        ],
      }),
    );
    await service.importHealthKit(
      'other',
      payload({
        days: [{ day: '2026-10-30', activeKcal: 99 }],
        workouts: [workout(UUID_A, '2026-10-30T07:00:00Z')],
      }),
    );

    const result = await service.listActivity('me', '2026-10-29T00:00:00Z', '2026-10-31T23:59:59Z');
    assert.deepEqual(
      result.days.map((d) => [d.day, d.activeKcal]),
      [
        ['2026-10-28', 2],
        ['2026-10-30', 3],
        ['2026-11-01', 4],
      ],
    );
    assert.equal(typeof result.days[0]!.updatedAt, 'string');
    assert.deepEqual(
      result.workouts.map((w) => w.healthKitUuid),
      [UUID_A, UUID_B],
    );
    const first = result.workouts[0]!;
    assert.equal(first.startedAt, '2026-10-29T07:00:00.000Z');
    assert.equal(first.endedAt, '2026-10-29T07:30:00.000Z');
    assert.deepEqual(Object.keys(first).sort(), [
      'activeKcal',
      'activityType',
      'distanceMeters',
      'endedAt',
      'healthKitUuid',
      'id',
      'isOwn',
      'sourceName',
      'startedAt',
    ]);
  });

  it('rejects inverted or oversized ranges', async () => {
    const { prisma } = createMockPrisma();
    const service = new ActivityService(prisma);
    await assert.rejects(
      service.listActivity('me', '2026-10-31T00:00:00Z', '2026-10-01T00:00:00Z'),
      BadRequestException,
    );
    await assert.rejects(
      service.listActivity('me', '2025-01-01T00:00:00Z', '2026-10-01T00:00:00Z'),
      BadRequestException,
    );
  });
});

describe('activity schemas', () => {
  const valid = {
    days: [{ day: '2026-10-30', activeKcal: 512.5 }],
    workouts: [
      {
        healthKitUuid: UUID_A.toUpperCase(),
        activityType: 'traditionalStrengthTraining',
        sourceName: 'Apple Watch',
        isOwn: true,
        startedAt: '2026-10-30T07:00:00+01:00',
        endedAt: '2026-10-30T08:00:00+01:00',
        activeKcal: null,
        distanceMeters: null,
      },
    ],
    deletedWorkoutUuids: [UUID_B],
  };

  it('accepts a valid delta and lowercases HealthKit UUIDs', () => {
    const parsed = ImportHealthActivitySchema.parse(valid);
    assert.equal(parsed.workouts[0]!.healthKitUuid, UUID_A);
    const omitted: Record<string, unknown> = { ...valid.workouts[0]! };
    delete omitted.activeKcal;
    delete omitted.distanceMeters;
    const lenient = ImportHealthActivitySchema.parse({ ...valid, workouts: [omitted] });
    assert.equal(lenient.workouts[0]!.activeKcal, null, 'omitted optionals become null');
    assert.equal(lenient.workouts[0]!.distanceMeters, null);
  });

  it('requires all three keys and enforces bounds', () => {
    assert.equal(ImportHealthActivitySchema.safeParse({ days: [], workouts: [] }).success, false);
    const bad = (patch: Record<string, unknown>) =>
      ImportHealthActivitySchema.safeParse({ ...valid, ...patch }).success;
    assert.equal(bad({ days: [{ day: '2026-02-30', activeKcal: 1 }] }), false);
    assert.equal(bad({ days: [{ day: '2026-10-30T00:00', activeKcal: 1 }] }), false);
    assert.equal(bad({ days: [{ day: '2026-10-30', activeKcal: 20001 }] }), false);
    assert.equal(bad({ days: [{ day: '2026-10-30', activeKcal: -1 }] }), false);
    assert.equal(bad({ deletedWorkoutUuids: ['not-a-uuid'] }), false);
    const w = valid.workouts[0]!;
    assert.equal(bad({ workouts: [{ ...w, endedAt: '2026-10-30T06:00:00+01:00' }] }), false);
    assert.equal(bad({ workouts: [{ ...w, endedAt: '2026-11-02T08:00:00+01:00' }] }), false);
    assert.equal(bad({ workouts: [{ ...w, activityType: '' }] }), false);
    assert.equal(bad({ workouts: [{ ...w, sourceName: 'x'.repeat(121) }] }), false);
    assert.equal(bad({ workouts: [{ ...w, distanceMeters: 1_000_001 }] }), false);
    assert.equal(
      bad({ days: Array.from({ length: 401 }, () => ({ day: '2026-10-30', activeKcal: 1 })) }),
      false,
    );
  });

  it('validates the range query', () => {
    const ok = HealthActivityRangeQuerySchema.safeParse({
      from: '2026-10-01T00:00:00Z',
      to: '2026-10-31T00:00:00Z',
    });
    assert.equal(ok.success, true);
    assert.equal(
      HealthActivityRangeQuerySchema.safeParse({ from: '2026-10-01T00:00:00Z' }).success,
      false,
    );
    assert.equal(
      HealthActivityRangeQuerySchema.safeParse({
        from: '2026-10-31T00:00:00Z',
        to: '2026-10-01T00:00:00Z',
      }).success,
      false,
    );
    assert.equal(
      HealthActivityRangeQuerySchema.safeParse({
        from: '2025-01-01T00:00:00Z',
        to: '2026-10-01T00:00:00Z',
      }).success,
      false,
    );
  });
});
