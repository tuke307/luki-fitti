import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BodyWeightSource, ExerciseType, SessionType, SetType } from '@luki-fitti/common/enums';
import { BodyWeightService, computeRecalcWindow, resolveBodyWeightAt } from './body-weight.service';
import type { PrismaService } from '../database/prisma.service';

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

interface Range {
  in?: unknown[];
  gte?: Date;
  lte?: Date;
  lt?: Date;
}

const isRange = (value: unknown): value is Range =>
  typeof value === 'object' && value !== null && !(value instanceof Date);

function matches(row: Row, where: Where = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (isRange(cond)) {
      if (cond.in && !cond.in.includes(value)) return false;
      const t = value instanceof Date ? value.getTime() : NaN;
      if (cond.gte && !(t >= cond.gte.getTime())) return false;
      if (cond.lte && !(t <= cond.lte.getTime())) return false;
      if (cond.lt && !(t < cond.lt.getTime())) return false;
      return true;
    }
    return value instanceof Date && cond instanceof Date
      ? value.getTime() === cond.getTime()
      : value === cond;
  });
}

function sortRows(rows: Row[], orderBy?: Record<string, 'asc' | 'desc'>): Row[] {
  if (!orderBy) return rows;
  const [[key, dir]] = Object.entries(orderBy) as [[string, 'asc' | 'desc']];
  const val = (r: Row) => (r[key] instanceof Date ? (r[key] as Date).getTime() : String(r[key]));
  return [...rows].sort((a, b) => {
    const cmp = val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0;
    return dir === 'asc' ? cmp : -cmp;
  });
}

interface SessionRow extends Row {
  id: string;
  userId: string;
  status: string;
  startedAt: Date;
  sessionType: string;
  activeDurationSeconds: number;
  activeCaloriesKcal: number | null;
  estimatedCaloriesKcal: number | null;
  exercises: Array<{ exerciseTypeSnapshot: string; sets: Row[] }>;
}

function createMockPrisma(options: { prefsWeight?: number | null } = {}) {
  const entries: Row[] = [];
  const sessions: SessionRow[] = [];
  const prefs = new Map<string, { bodyWeightKg: number | null }>([
    ['me', { bodyWeightKg: options.prefsWeight ?? null }],
    ['other', { bodyWeightKg: null }],
  ]);
  const sessionQueries: Where[] = [];
  let seq = 0;

  const createRow = (data: Row): Row => {
    if (entries.some((e) => e.clientEntryId === data.clientEntryId)) {
      throw new Error('Unique constraint failed on clientEntryId');
    }
    const now = new Date();
    const row: Row = {
      id: `bw-${++seq}`,
      source: BodyWeightSource.MANUAL,
      healthKitUuid: null,
      note: null,
      createdAt: now,
      updatedAt: now,
      ...data,
    };
    entries.push(row);
    return { ...row };
  };

  const prisma = {
    bodyWeightEntry: {
      findUnique: async ({ where }: { where: Where }) => {
        const row = entries.find((e) => matches(e, where));
        return row ? { ...row } : null;
      },
      findUniqueOrThrow: async ({ where }: { where: Where }) => {
        const row = entries.find((e) => matches(e, where));
        if (!row) throw new Error('Not found');
        return { ...row };
      },
      findFirst: async ({
        where,
        orderBy,
      }: {
        where: Where;
        orderBy?: Record<string, 'asc' | 'desc'>;
      }) => {
        const row = sortRows(
          entries.filter((e) => matches(e, where)),
          orderBy,
        )[0];
        return row ? { ...row } : null;
      },
      findMany: async ({
        where,
        orderBy,
        take,
      }: {
        where: Where;
        orderBy?: Record<string, 'asc' | 'desc'>;
        take?: number;
      }) =>
        sortRows(
          entries.filter((e) => matches(e, where)),
          orderBy,
        )
          .slice(0, take ?? Infinity)
          .map((e) => ({ ...e })),
      create: async ({ data }: { data: Row }) => createRow(data),
      createManyAndReturn: async ({ data }: { data: Row[] }) => data.map(createRow),
      updateMany: async ({ where, data }: { where: Where; data: Row }) => {
        const rows = entries.filter((e) => matches(e, where));
        for (const row of rows) Object.assign(row, data, { updatedAt: new Date() });
        return { count: rows.length };
      },
      deleteMany: async ({ where }: { where: Where }) => {
        let count = 0;
        for (let i = entries.length - 1; i >= 0; i--) {
          if (matches(entries[i]!, where)) {
            entries.splice(i, 1);
            count++;
          }
        }
        return { count };
      },
    },
    userPreferences: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { userId: string };
        data: { bodyWeightKg: number | null };
      }) => {
        const row = prefs.get(where.userId);
        if (row) Object.assign(row, data);
        return { count: row ? 1 : 0 };
      },
      findUnique: async ({ where }: { where: { userId: string } }) =>
        prefs.get(where.userId) ?? null,
    },
    workoutSession: {
      findMany: async ({ where, cursor }: { where: Where; cursor?: { id: string } }) => {
        sessionQueries.push(where);
        const rows = sortRows(
          sessions.filter((s) => matches(s, where)),
          { id: 'asc' },
        ) as SessionRow[];
        const start = cursor ? rows.findIndex((r) => r.id === cursor.id) + 1 : 0;
        return rows.slice(start).map((s) => ({ ...s }));
      },
      updateMany: async ({ where, data }: { where: Where; data: Row }) => {
        const rows = sessions.filter((s) => matches(s, where));
        for (const row of rows) Object.assign(row, data);
        return { count: rows.length };
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(prisma),
  };

  return {
    prisma: prisma as unknown as PrismaService,
    entries,
    sessions,
    prefs,
    sessionQueries,
  };
}

/** A completed 60-minute strength session (no HealthKit energy, so weight matters). */
function strengthSession(id: string, startedAt: string, userId = 'me'): SessionRow {
  return {
    id,
    userId,
    status: 'COMPLETED',
    startedAt: new Date(startedAt),
    sessionType: SessionType.STRENGTH,
    activeDurationSeconds: 3600,
    activeCaloriesKcal: null,
    estimatedCaloriesKcal: null,
    exercises: [
      {
        exerciseTypeSnapshot: ExerciseType.STRENGTH,
        sets: Array.from({ length: 12 }, () => ({
          setType: SetType.WORKING,
          completed: true,
          durationSeconds: null,
          distanceMeters: null,
        })),
      },
    ],
  };
}

const upsert = (
  clientEntryId: string,
  measuredAt: string,
  weightKg: number,
  note?: string | null,
) => ({
  clientEntryId,
  measuredAt,
  weightKg,
  ...(note !== undefined ? { note } : {}),
});

describe('BodyWeightService.upsertEntry', () => {
  it('creates a manual entry and updates it in place on retry, keeping source and HealthKit link', async () => {
    const { prisma, entries, prefs } = createMockPrisma();
    const service = new BodyWeightService(prisma);

    const created = await service.upsertEntry(
      'me',
      upsert('client-entry-1', '2026-10-01T07:00:00Z', 82, ' morning '),
    );
    assert.equal(created.source, BodyWeightSource.MANUAL);
    assert.equal(created.note, 'morning');
    assert.equal(created.measuredAt, '2026-10-01T07:00:00.000Z');
    assert.equal(prefs.get('me')!.bodyWeightKg, 82);

    entries[0]!.source = BodyWeightSource.HEALTHKIT;
    entries[0]!.healthKitUuid = 'hk-uuid-0001';
    const updated = await service.upsertEntry(
      'me',
      upsert('client-entry-1', '2026-10-02T07:00:00Z', 81.5),
    );
    assert.equal(entries.length, 1);
    assert.equal(updated.id, created.id);
    assert.equal(updated.weightKg, 81.5);
    assert.equal(updated.note, 'morning', 'omitted note is left unchanged');
    assert.equal(updated.source, BodyWeightSource.HEALTHKIT);
    assert.equal(updated.healthKitUuid, 'hk-uuid-0001');
    assert.equal(prefs.get('me')!.bodyWeightKg, 81.5);
  });

  it('returns 404 and leaves the row untouched when the client id belongs to another user', async () => {
    const { prisma, entries } = createMockPrisma();
    const service = new BodyWeightService(prisma);
    await service.upsertEntry('other', upsert('client-entry-x', '2026-10-01T07:00:00Z', 70));

    await assert.rejects(
      service.upsertEntry('me', upsert('client-entry-x', '2026-10-01T07:00:00Z', 99)),
      NotFoundException,
    );
    assert.equal(entries[0]!.weightKg, 70);
    assert.equal(entries[0]!.userId, 'other');
  });

  it('reserves the hk- client id prefix for HealthKit imports', async () => {
    const { prisma } = createMockPrisma();
    const service = new BodyWeightService(prisma);
    await assert.rejects(
      service.upsertEntry('me', upsert('hk-someone-elses-uuid', '2026-10-01T07:00:00Z', 70)),
      BadRequestException,
    );
  });
});

describe('BodyWeightService.deleteEntry', () => {
  it("returns 404 for another user's entry and only deletes owned ones", async () => {
    const { prisma, entries, prefs } = createMockPrisma();
    const service = new BodyWeightService(prisma);
    const theirs = await service.upsertEntry(
      'other',
      upsert('client-other-1', '2026-10-01T07:00:00Z', 70),
    );
    const older = await service.upsertEntry(
      'me',
      upsert('client-mine-01', '2026-10-01T07:00:00Z', 82),
    );
    const newer = await service.upsertEntry(
      'me',
      upsert('client-mine-02', '2026-10-08T07:00:00Z', 81),
    );
    assert.equal(prefs.get('me')!.bodyWeightKg, 81);

    await assert.rejects(service.deleteEntry('me', theirs.id), NotFoundException);
    await assert.rejects(service.deleteEntry('me', 'missing'), NotFoundException);
    assert.equal(entries.length, 3);

    assert.deepEqual(await service.deleteEntry('me', newer.id), { success: true });
    assert.equal(prefs.get('me')!.bodyWeightKg, 82, 'falls back to the next newest weigh-in');

    await service.deleteEntry('me', older.id);
    assert.equal(prefs.get('me')!.bodyWeightKg, null, 'cleared once no history remains');
    assert.equal(entries.length, 1);
  });
});

describe('BodyWeightService.listEntries', () => {
  it('returns only the users entries in range, oldest first', async () => {
    const { prisma } = createMockPrisma();
    const service = new BodyWeightService(prisma);
    await service.upsertEntry('me', upsert('client-list-3', '2026-10-15T07:00:00Z', 80));
    await service.upsertEntry('me', upsert('client-list-1', '2026-10-01T07:00:00Z', 82));
    await service.upsertEntry('me', upsert('client-list-2', '2026-10-08T07:00:00Z', 81));
    await service.upsertEntry('other', upsert('client-list-o', '2026-10-09T07:00:00Z', 60));

    const all = await service.listEntries('me');
    assert.deepEqual(
      all.map((e) => e.weightKg),
      [82, 81, 80],
    );
    const ranged = await service.listEntries('me', '2026-10-02T00:00:00Z', '2026-10-15T07:00:00Z');
    assert.deepEqual(
      ranged.map((e) => e.weightKg),
      [81, 80],
    );
    await assert.rejects(
      service.listEntries('me', '2026-10-15T00:00:00Z', '2026-10-01T00:00:00Z'),
      BadRequestException,
    );
  });
});

describe('BodyWeightService.importHealthKit', () => {
  it('dedupes by HealthKit UUID, updates changed samples and deletes removed ones', async () => {
    const { prisma, entries, prefs } = createMockPrisma();
    const service = new BodyWeightService(prisma);
    await service.upsertEntry('me', upsert('client-manual-1', '2026-10-20T07:00:00Z', 79));

    const first = await service.importHealthKit('me', {
      samples: [
        { healthKitUuid: 'uuid-aaaa-0001', measuredAt: '2026-10-01T07:00:00Z', weightKg: 82 },
        { healthKitUuid: 'uuid-aaaa-0002', measuredAt: '2026-10-08T07:00:00Z', weightKg: 81 },
        { healthKitUuid: 'uuid-aaaa-0002', measuredAt: '2026-10-08T07:00:00Z', weightKg: 80.8 },
      ],
      deletedHealthKitUuids: [],
    });
    assert.equal(first.imported, 2);
    assert.equal(first.deleted, 0);
    assert.deepEqual(
      first.entries.map((e) => [e.clientEntryId, e.weightKg, e.source]),
      [
        ['hk-uuid-aaaa-0001', 82, BodyWeightSource.HEALTHKIT],
        ['hk-uuid-aaaa-0002', 80.8, BodyWeightSource.HEALTHKIT],
      ],
    );
    assert.equal(entries.length, 3);

    // Re-sync: one unchanged, one corrected in Health, one new, one deleted.
    const second = await service.importHealthKit('me', {
      samples: [
        { healthKitUuid: 'uuid-aaaa-0001', measuredAt: '2026-10-01T07:00:00Z', weightKg: 82 },
        { healthKitUuid: 'uuid-aaaa-0003', measuredAt: '2026-10-25T07:00:00Z', weightKg: 78.4 },
      ],
      deletedHealthKitUuids: ['uuid-aaaa-0002', 'uuid-never-imported'],
    });
    assert.equal(second.imported, 1);
    assert.equal(second.deleted, 1);
    assert.deepEqual(
      second.entries.map((e) => e.healthKitUuid),
      ['uuid-aaaa-0001', 'uuid-aaaa-0003'],
    );
    assert.deepEqual(entries.map((e) => e.clientEntryId).sort(), [
      'client-manual-1',
      'hk-uuid-aaaa-0001',
      'hk-uuid-aaaa-0003',
    ]);
    assert.equal(prefs.get('me')!.bodyWeightKg, 78.4);

    const corrected = await service.importHealthKit('me', {
      samples: [
        { healthKitUuid: 'uuid-aaaa-0003', measuredAt: '2026-10-25T07:00:00Z', weightKg: 78.1 },
      ],
      deletedHealthKitUuids: [],
    });
    assert.equal(corrected.imported, 1);
    assert.equal(entries.length, 3);
    assert.equal(prefs.get('me')!.bodyWeightKg, 78.1);
  });

  it("never touches manual entries or other users' imports", async () => {
    const { prisma, entries } = createMockPrisma();
    const service = new BodyWeightService(prisma);
    await service.importHealthKit('other', {
      samples: [
        { healthKitUuid: 'uuid-shared-0001', measuredAt: '2026-10-01T07:00:00Z', weightKg: 60 },
      ],
      deletedHealthKitUuids: [],
    });
    const manual = await service.upsertEntry(
      'me',
      upsert('client-manual-2', '2026-10-02T07:00:00Z', 80),
    );
    entries.find((e) => e.id === manual.id)!.healthKitUuid = 'uuid-manual-0001';

    const result = await service.importHealthKit('me', {
      samples: [
        { healthKitUuid: 'uuid-shared-0001', measuredAt: '2026-10-03T07:00:00Z', weightKg: 81 },
      ],
      deletedHealthKitUuids: ['uuid-manual-0001'],
    });
    assert.equal(result.imported, 1);
    assert.equal(result.deleted, 0, 'manual entries are not deleted by HealthKit deletions');
    const theirs = entries.find((e) => e.userId === 'other')!;
    assert.equal(theirs.weightKg, 60);
    const mine = entries.find((e) => e.userId === 'me' && e.healthKitUuid === 'uuid-shared-0001')!;
    assert.notEqual(mine.clientEntryId, theirs.clientEntryId);
    assert.match(String(mine.clientEntryId), /^hk-/);
  });
});

describe('BodyWeightService.recordFromPreferences', () => {
  it('records a weigh-in only when the value differs from the newest one', async () => {
    const { prisma, entries, prefs } = createMockPrisma();
    const service = new BodyWeightService(prisma);
    await service.recordFromPreferences('me', 80);
    assert.equal(entries.length, 1);
    assert.match(String(entries[0]!.clientEntryId), /^weight-pref-/);
    assert.equal(entries[0]!.source, BodyWeightSource.MANUAL);
    assert.equal(prefs.get('me')!.bodyWeightKg, 80);

    await service.recordFromPreferences('me', 80);
    assert.equal(entries.length, 1);
    await service.recordFromPreferences('me', 79);
    assert.equal(entries.length, 2);
  });
});

describe('computeRecalcWindow', () => {
  const history = [
    { measuredAt: '2026-10-01T07:00:00Z', weightKg: 82 },
    { measuredAt: '2026-10-08T07:00:00Z', weightKg: 81 },
    { measuredAt: '2026-10-15T07:00:00Z', weightKg: 80 },
  ];
  const d = (iso: string) => new Date(iso);

  it('spans from the changed weigh-in to the next remaining one', () => {
    assert.deepEqual(computeRecalcWindow(history, [d('2026-10-08T07:00:00Z')]), {
      from: d('2026-10-08T07:00:00Z'),
      to: d('2026-10-15T07:00:00Z'),
    });
  });

  it('is open-ended after the newest weigh-in', () => {
    assert.deepEqual(computeRecalcWindow(history, [d('2026-10-15T07:00:00Z')]), {
      from: d('2026-10-15T07:00:00Z'),
      to: null,
    });
  });

  it('covers both the old and new time of a moved weigh-in', () => {
    const moved = [
      { measuredAt: '2026-10-01T07:00:00Z', weightKg: 82 },
      { measuredAt: '2026-10-12T07:00:00Z', weightKg: 81 },
      { measuredAt: '2026-10-15T07:00:00Z', weightKg: 80 },
    ];
    assert.deepEqual(
      computeRecalcWindow(moved, [d('2026-10-08T07:00:00Z'), d('2026-10-12T07:00:00Z')]),
      {
        from: d('2026-10-08T07:00:00Z'),
        to: d('2026-10-15T07:00:00Z'),
      },
    );
  });

  it('includes everything before the first weigh-in when the earliest one changes', () => {
    assert.deepEqual(computeRecalcWindow(history, [d('2026-10-01T07:00:00Z')]), {
      from: null,
      to: d('2026-10-08T07:00:00Z'),
    });
    // Deleting the earliest: the new earliest now also applies to everything before it.
    assert.deepEqual(computeRecalcWindow(history.slice(1), [d('2026-10-01T07:00:00Z')]), {
      from: null,
      to: d('2026-10-08T07:00:00Z'),
    });
    // Deleting the only weigh-in affects every session.
    assert.deepEqual(computeRecalcWindow([], [d('2026-10-01T07:00:00Z')]), {
      from: null,
      to: null,
    });
  });

  it('returns null when nothing changed', () => {
    assert.equal(computeRecalcWindow(history, []), null);
  });
});

describe('BodyWeightService session calorie recompute', () => {
  it('re-estimates only affected completed sessions with the weight at their start', async () => {
    const { prisma, sessions, sessionQueries } = createMockPrisma();
    const service = new BodyWeightService(prisma);
    await service.upsertEntry('me', upsert('client-rc-0001', '2026-10-01T07:00:00Z', 80));
    await service.upsertEntry('me', upsert('client-rc-0002', '2026-10-15T07:00:00Z', 100));

    sessions.push(
      strengthSession('s-before', '2026-09-20T17:00:00Z'),
      strengthSession('s-mid', '2026-10-05T17:00:00Z'),
      strengthSession('s-after', '2026-10-20T17:00:00Z'),
      {
        ...strengthSession('s-watch', '2026-10-05T18:00:00Z'),
        activeCaloriesKcal: 333,
        estimatedCaloriesKcal: 333,
      },
      strengthSession('s-other', '2026-10-05T17:00:00Z', 'other'),
    );
    const byId = (id: string) => sessions.find((s) => s.id === id)!;

    sessionQueries.length = 0;
    // Edit the later weigh-in: only sessions from Oct 15 onwards use it.
    await service.upsertEntry('me', upsert('client-rc-0002', '2026-10-15T07:00:00Z', 90));
    assert.equal(sessionQueries.length, 1);
    assert.deepEqual(sessionQueries[0]!.startedAt, { gte: new Date('2026-10-15T07:00:00Z') });
    assert.equal(sessionQueries[0]!.userId, 'me');
    const after90 = byId('s-after').estimatedCaloriesKcal!;
    assert.ok(after90 > 0);
    assert.equal(byId('s-mid').estimatedCaloriesKcal, null, 'outside the window: untouched');
    assert.equal(byId('s-before').estimatedCaloriesKcal, null);

    // Edit the earliest weigh-in: sessions before it fall back to it, so they are recomputed too.
    await service.upsertEntry('me', upsert('client-rc-0001', '2026-10-01T07:00:00Z', 70));
    const mid70 = byId('s-mid').estimatedCaloriesKcal!;
    assert.equal(byId('s-before').estimatedCaloriesKcal, mid70);
    assert.ok(
      Math.abs(after90 / mid70 - 90 / 70) < 0.02,
      'calories scale with the effective weight',
    );
    assert.equal(byId('s-after').estimatedCaloriesKcal, after90, 'later weigh-in still applies');
    assert.equal(
      byId('s-watch').estimatedCaloriesKcal,
      333,
      'HealthKit energy is weight-independent',
    );
    assert.equal(
      byId('s-other').estimatedCaloriesKcal,
      null,
      "other users' sessions are never touched",
    );
  });
});

describe('resolveBodyWeightAt', () => {
  it('uses the weigh-in at the date, then the earliest, then preferences', async () => {
    const { prisma } = createMockPrisma({ prefsWeight: 77 });
    const service = new BodyWeightService(prisma);
    assert.equal(await resolveBodyWeightAt(prisma, 'me', new Date('2026-10-10T00:00:00Z')), 77);

    await service.upsertEntry('me', upsert('client-res-001', '2026-10-01T07:00:00Z', 82));
    await service.upsertEntry('me', upsert('client-res-002', '2026-10-15T07:00:00Z', 80));
    assert.equal(await resolveBodyWeightAt(prisma, 'me', new Date('2026-10-10T00:00:00Z')), 82);
    assert.equal(await resolveBodyWeightAt(prisma, 'me', new Date('2026-10-15T07:00:00Z')), 80);
    assert.equal(await resolveBodyWeightAt(prisma, 'me', new Date('2026-09-01T00:00:00Z')), 82);
    assert.equal(await resolveBodyWeightAt({}, 'me', new Date()), null);
  });
});
