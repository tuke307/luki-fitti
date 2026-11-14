import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service';
import type { AnalyticsService } from '../analytics/analytics.service';
import { PublicSessionListQuerySchema } from '@luki-fitti/common/schemas';
import { PublicApiService } from './public-api.service';
import { encodeCursor } from './pagination.util';

const OWNER = 'owner-1';
const OTHER = 'other-2';
const T0 = new Date('2026-01-01T00:00:00Z');
const T1 = new Date('2026-01-02T00:00:00Z');

const sessionRow = {
  id: 's1',
  templateId: 't1',
  stretchingRoutineId: null,
  sessionType: 'STRENGTH',
  workoutNameSnapshot: 'Push',
  status: 'COMPLETED',
  startedAt: T0,
  pausedAt: null,
  completedAt: T1,
  activeDurationSeconds: 3600,
  totalVolumeKg: 5000,
  totalSetsCompleted: 10,
  totalRepsCompleted: 100,
  totalStretchSeconds: null,
  notes: null,
  sourceDevice: 'WEB',
  activeCaloriesKcal: null,
  totalCaloriesKcal: null,
  estimatedCaloriesKcal: null,
  avgHeartRateBpm: null,
  maxHeartRateBpm: null,
  minHeartRateBpm: null,
  createdAt: T0,
  updatedAt: T1,
  weightUnit: 'KG',
  exercises: [],
};

const fixtureRows: Record<string, object[]> = {
  workoutSession: [sessionRow],
  workoutTemplate: [
    {
      id: 't1',
      folderId: null,
      name: 'Push',
      description: null,
      estimatedDurationMinutes: null,
      sortOrder: 0,
      trainingGoal: null,
      exercises: [],
      createdAt: T0,
      updatedAt: T1,
    },
  ],
  workoutFolder: [
    { id: 'f1', name: 'Plans', color: null, sortOrder: 0, createdAt: T0, updatedAt: T1 },
  ],
  stretchingRoutine: [
    {
      id: 'r1',
      name: 'Hips',
      description: null,
      targetArea: 'hips',
      estimatedDurationSeconds: 300,
      exercises: [],
      createdAt: T0,
      updatedAt: T1,
    },
  ],
  exercise: [
    {
      id: 'e1',
      name: 'Bench',
      description: null,
      instructions: null,
      category: 'STRENGTH',
      exerciseType: 'STRENGTH',
      primaryMuscleGroup: 'CHEST',
      muscleGroups: [{ muscleGroup: 'CHEST' }],
      equipment: 'BARBELL',
      tags: [],
      isSystem: false,
      createdAt: T0,
      updatedAt: T1,
    },
  ],
  mealEntry: [
    {
      id: 'm1',
      eatenAt: T0,
      mealType: 'LUNCH',
      label: null,
      notes: null,
      items: [],
      createdAt: T0,
      updatedAt: T1,
    },
  ],
  bodyWeightEntry: [
    {
      id: 'b1',
      measuredAt: T0,
      weightKg: 80,
      source: 'MANUAL',
      note: null,
      createdAt: T0,
      updatedAt: T1,
    },
  ],
  progressCheckIn: [
    { id: 'c1', takenAt: T0, note: null, photos: [], createdAt: T0, updatedAt: T1 },
  ],
  healthDailyEnergy: [{ id: 'd1', day: '2026-01-01', activeKcal: 500, updatedAt: T1 }],
  healthWorkout: [
    {
      id: 'w1',
      activityType: 'running',
      sourceName: 'Watch',
      isOwn: true,
      startedAt: T0,
      endedAt: T1,
      activeKcal: 300,
      distanceMeters: 5000,
      updatedAt: T1,
    },
  ],
};

const baseQuery = { limit: 50 };

/** Delegates that only yield rows for the queried owner — anything else is empty. */
const prismaMock = (captured: Record<string, unknown> = {}) =>
  new Proxy(
    {},
    {
      get: (_t, model: string) => {
        if (model === 'user') {
          return {
            findUnique: async ({ where }: { where: { id: string } }) =>
              where.id === OWNER ? { id: OWNER, name: 'O', handle: 'oh', preferences: null } : null,
          };
        }
        return {
          findMany: async (args: { where: { userId?: string; AND?: unknown[] } }) => {
            captured[model] = args;
            const uid = args.where.userId;
            return uid === OWNER ? (fixtureRows[model] ?? []) : [];
          },
          findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
            where.userId === OWNER
              ? (fixtureRows[model]?.find((r) => (r as { id: string }).id === where.id) ?? null)
              : null,
        };
      },
    },
  ) as unknown as PrismaService;

const analyticsMock = {
  getSummary: async (userId: string) => ({
    personalRecords:
      userId === OWNER
        ? [
            {
              exerciseId: 'e1',
              exerciseName: 'Bench',
              primaryMuscle: 'CHEST',
              maxWeightKg: 100,
              repsAtMaxWeight: 5,
              estimatedOneRepMaxKg: 116,
              bestVolumeSetKg: 500,
            },
          ]
        : [],
  }),
} as unknown as AnalyticsService;

const service = (captured: Record<string, unknown> = {}) =>
  new PublicApiService(prismaMock(captured), analyticsMock);

describe('PublicApiService owner isolation', () => {
  it('every list endpoint scopes by userId and yields nothing for another user', async () => {
    const captured: Record<string, unknown> = {};
    const svc = service(captured);
    const range = { ...baseQuery, from: '2026-01-01', to: '2026-01-31' };

    for (const [model, call] of [
      ['workoutSession', () => svc.listSessions(OTHER, range)],
      ['workoutTemplate', () => svc.listWorkouts(OTHER, baseQuery)],
      ['workoutFolder', () => svc.listFolders(OTHER, baseQuery)],
      ['stretchingRoutine', () => svc.listStretchingRoutines(OTHER, baseQuery)],
      ['exercise', () => svc.listExercises(OTHER, baseQuery, false)],
      ['mealEntry', () => svc.listMeals(OTHER, range)],
      ['bodyWeightEntry', () => svc.listBodyWeight(OTHER, range)],
      ['progressCheckIn', () => svc.listProgressCheckIns(OTHER, baseQuery)],
      ['healthDailyEnergy', () => svc.listDailyEnergy(OTHER, range)],
      ['healthWorkout', () => svc.listActivityWorkouts(OTHER, range)],
    ] as const) {
      const page = await call();
      assert.deepEqual(page.data, [], model);
      assert.equal(page.nextCursor, null);
    }
  });

  it('getSession and getMe return 404 for another user', async () => {
    const svc = service();
    await assert.rejects(svc.getSession(OTHER, 's1'), NotFoundException);
    await assert.rejects(svc.getMe(OTHER), NotFoundException);
  });

  it('returns data for the owner with a where clause scoped to that user', async () => {
    const captured: Record<string, unknown> = {};
    const svc = service(captured);
    const page = await svc.listSessions(OWNER, baseQuery);
    assert.equal(page.data.length, 1);
    const args = captured['workoutSession'] as { where: { userId: string } };
    assert.equal(args.where.userId, OWNER);
  });
});

describe('PublicApiService incremental sync + pagination', () => {
  it('applies updatedSince as an updatedAt gt filter', async () => {
    const captured: Record<string, unknown> = {};
    const svc = service(captured);
    await svc.listSessions(OWNER, { ...baseQuery, updatedSince: '2026-01-01T12:00:00Z' });
    const args = captured['workoutSession'] as { where: { AND: Record<string, unknown>[] } };
    assert.deepEqual(args.where.AND, [{ updatedAt: { gt: new Date('2026-01-01T12:00:00Z') } }]);
  });

  it('applies the cursor as an (updatedAt, id) position filter', async () => {
    const captured: Record<string, unknown> = {};
    const svc = service(captured);
    const cursor = encodeCursor({ u: '2026-01-01T12:00:00.000Z', i: 's0' });
    await svc.listFolders(OWNER, { ...baseQuery, cursor });
    const args = captured['workoutFolder'] as { where: { AND: Record<string, unknown>[] } };
    assert.deepEqual(args.where.AND[0], {
      OR: [
        { updatedAt: { gt: new Date('2026-01-01T12:00:00.000Z') } },
        { updatedAt: new Date('2026-01-01T12:00:00.000Z'), id: { gt: 's0' } },
      ],
    });
  });

  it('emits nextCursor only when more rows exist (limit + 1 window)', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `s${i}`,
      updatedAt: new Date(T0.getTime() + i * 1000),
    }));
    const prisma = {
      workoutSession: {
        findMany: async () => rows.map((r) => ({ ...sessionRow, ...r })),
      },
    } as unknown as PrismaService;
    const svc = new PublicApiService(prisma, analyticsMock);
    const page = await svc.listSessions(OWNER, { limit: 2 });
    assert.equal(page.data.length, 2);
    assert.ok(page.nextCursor);
    const page2 = await svc.listSessions(OWNER, { limit: 5 });
    assert.equal(page2.nextCursor, null);
  });
});

describe('PublicApiService DTO hygiene', () => {
  it('strips internal fields and uses unit-explicit names', async () => {
    const svc = service();
    const me = await svc.getMe(OWNER);
    assert.deepEqual(
      Object.keys(me).sort(),
      ['goals', 'handle', 'id', 'name', 'distanceUnit', 'weightUnit'].sort(),
    );
    assert.ok(!('email' in me), 'email must never be exposed');

    const s = (await svc.listSessions(OWNER, baseQuery)).data[0]!;
    for (const forbidden of ['userId', 'version', 'lastWriterDeviceId', 'clientSessionId']) {
      assert.ok(!(forbidden in s), `${forbidden} must not leak`);
    }
    assert.equal(s.totalVolumeKg, 5000);
    assert.equal(s.startedAt, T0.toISOString());
  });

  it('converts pounds to kg on session sets', async () => {
    const lbs = {
      ...sessionRow,
      weightUnit: 'LBS',
      exercises: [
        {
          id: 'se1',
          exerciseId: 'e1',
          exerciseNameSnapshot: 'Bench',
          primaryMuscleSnapshot: 'CHEST',
          exerciseTypeSnapshot: 'STRENGTH',
          origin: 'PLANNED',
          status: 'DONE',
          orderIndex: 0,
          plannedSets: 1,
          plannedWarmupSets: 0,
          targetRepsMin: null,
          targetRepsMax: null,
          targetWeight: 220,
          targetDurationSeconds: null,
          restSeconds: null,
          notes: null,
          sets: [
            {
              setNumber: 1,
              setType: 'WORK',
              weight: 220,
              weightUnit: 'LBS',
              reps: 5,
              durationSeconds: null,
              distanceMeters: null,
              rpe: null,
              completed: true,
              completedAt: T0,
              isPersonalRecord: false,
              notes: null,
              avgHeartRateBpm: null,
              peakHeartRateBpm: null,
              restEndHeartRateBpm: null,
            },
          ],
        },
      ],
    };
    const prisma = {
      workoutSession: { findFirst: async () => lbs },
    } as unknown as PrismaService;
    const svc = new PublicApiService(prisma, analyticsMock);
    const s = await svc.getSession(OWNER, 's1');
    const set = s.exercises[0]!.sets[0]!;
    assert.ok(Math.abs(set.weightKg! - 220 * 0.45359237) < 1e-6);
    assert.ok(Math.abs(s.exercises[0]!.targetWeightKg! - 220 * 0.45359237) < 1e-6);
  });
});

describe('PublicSessionListQuerySchema include=exercises', () => {
  it('rejects limit > 50 when include=exercises is set', () => {
    assert.throws(() => PublicSessionListQuerySchema.parse({ include: 'exercises', limit: 51 }));
    // without include the regular limit cap (200) applies unchanged
    assert.equal(PublicSessionListQuerySchema.parse({ limit: 51 }).limit, 51);
    assert.equal(PublicSessionListQuerySchema.parse({ include: 'exercises' }).limit, 50);
  });

  it('returns full sessions with exercises and sets when include=exercises', async () => {
    const captured: Record<string, unknown> = {};
    const svc = service(captured);
    const page = await svc.listSessions(OWNER, {
      ...baseQuery,
      include: 'exercises',
    });
    const args = captured['workoutSession'] as { include?: unknown };
    assert.deepEqual(args.include, {
      exercises: { include: { sets: true }, orderBy: { orderIndex: 'asc' } },
    });
    const row = page.data[0]!;
    assert.ok('exercises' in row, 'include=exercises returns PublicSessionDto rows');
  });

  it('returns summary rows without exercises by default', async () => {
    const captured: Record<string, unknown> = {};
    const svc = service(captured);
    const page = await svc.listSessions(OWNER, baseQuery);
    const args = captured['workoutSession'] as { include?: unknown };
    assert.equal(args.include, undefined);
    assert.ok(!('exercises' in page.data[0]!));
  });
});
