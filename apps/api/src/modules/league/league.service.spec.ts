import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { berlinWeekKey, previousWeekKey } from '@luki-fitti/common/utils';
import {
  Arena,
  LeagueOutcome,
  LeagueStage,
  LeagueStageMode,
  NotificationKind,
} from '@luki-fitti/common/enums';
import type { AppSettingsService } from '../app-settings/app-settings.service';
import type { PrismaService } from '../database/prisma.service';
import type { NotificationService } from '../notifications/notification.service';
import { LeagueService } from './league.service';

interface Week {
  weekKey: string;
  stage: LeagueStage;
  activeUsers: number;
  buckets: unknown;
  closedAt: Date | null;
}
interface Cohort {
  id: string;
  weekKey: string;
  bucket: number | null;
  createdAt: Date;
}
interface Membership {
  cohortId: string;
  userId: string;
  weekKey: string;
  arenaAtStart: Arena;
  finalPoints: number | null;
  finalRank: number | null;
  outcome: LeagueOutcome | null;
  resultSeenAt: Date | null;
}

const makeState = () => ({
  weeks: new Map<string, Week>(),
  cohorts: [] as Cohort[],
  memberships: [] as Membership[],
  scores: [] as Array<{ userId: string; weekKey: string; points: number; updatedAt: Date }>,
  users: new Map<
    string,
    { handle: string | null; socialPaused: boolean; arena: Arena; leagueInactiveWeeks: number }
  >(),
  notifications: [] as Array<{ userId: string; kind: NotificationKind; payload: unknown }>,
  arenaCounts: [] as Array<{ arena: Arena; n: bigint }>,
  locks: 0,
  cohortSeq: 0,
});

const makePrisma = (state: ReturnType<typeof makeState>) => {
  const prisma = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    $executeRaw: async () => {
      state.locks += 1;
      return 1;
    },
    $queryRaw: async () => state.arenaCounts,
    leagueWeek: {
      findUnique: async ({ where: { weekKey } }: { where: { weekKey: string } }) =>
        state.weeks.get(weekKey) ?? null,
      upsert: async ({
        where,
        create,
      }: {
        where: { weekKey: string };
        create: { weekKey: string; stage: LeagueStage; activeUsers: number; buckets?: unknown };
      }) => {
        const week =
          state.weeks.get(where.weekKey) ?? ({ closedAt: null, buckets: null, ...create } as Week);
        state.weeks.set(where.weekKey, week);
        return week;
      },
      update: async ({
        where: { weekKey },
        data,
      }: {
        where: { weekKey: string };
        data: { closedAt: Date };
      }) => Object.assign(state.weeks.get(weekKey)!, data),
      findMany: async ({ where }: { where: { closedAt: null; weekKey: { lt: string } } }) =>
        [...state.weeks.values()]
          .filter((w) => w.closedAt === null && w.weekKey < where.weekKey.lt)
          .sort((a, b) => a.weekKey.localeCompare(b.weekKey))
          .map((w) => ({ weekKey: w.weekKey })),
    },
    leagueCohort: {
      findFirst: async ({ where }: { where: { weekKey: string; bucket: number | null } }) =>
        [...state.cohorts]
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .find((c) => c.weekKey === where.weekKey && c.bucket === where.bucket) ?? null,
      findMany: async ({ where }: { where: { weekKey: string } }) =>
        state.cohorts
          .filter((c) => c.weekKey === where.weekKey)
          .map((c) => ({
            ...c,
            members: state.memberships.filter((m) => m.cohortId === c.id),
          })),
      create: async ({ data }: { data: { weekKey: string; bucket: number | null } }) => {
        const cohort: Cohort = {
          id: `cohort-${state.cohortSeq++}`,
          createdAt: new Date(Date.now() + state.cohortSeq),
          ...data,
        };
        state.cohorts.push(cohort);
        return cohort;
      },
    },
    leagueMembership: {
      findUnique: async ({
        where: { userId_weekKey },
      }: {
        where: { userId_weekKey: { userId: string; weekKey: string } };
      }) =>
        state.memberships.find(
          (m) => m.userId === userId_weekKey.userId && m.weekKey === userId_weekKey.weekKey,
        ) ?? null,
      findFirst: async ({
        where,
      }: {
        where: { userId: string; resultSeenAt: null; outcome: { not: null } };
      }) =>
        [...state.memberships]
          .sort((a, b) => b.weekKey.localeCompare(a.weekKey))
          .find(
            (m) => m.userId === where.userId && m.resultSeenAt === null && m.outcome !== null,
          ) ?? null,
      findMany: async ({
        where,
      }: {
        where: { userId?: string; weekKey?: unknown; cohortId?: string };
      }) =>
        state.memberships.filter(
          (m) =>
            (where.userId === undefined || m.userId === where.userId) &&
            (where.cohortId === undefined || m.cohortId === where.cohortId) &&
            (where.weekKey === undefined ||
              typeof where.weekKey !== 'object' ||
              (where.weekKey as { lt?: string }).lt === undefined ||
              m.weekKey < (where.weekKey as { lt: string }).lt ||
              m.weekKey === (where.weekKey as unknown as string)),
        ),
      count: async ({ where: { cohortId } }: { where: { cohortId: string } }) =>
        state.memberships.filter((m) => m.cohortId === cohortId).length,
      create: async ({
        data,
      }: {
        data: { cohortId: string; userId: string; weekKey: string; arenaAtStart: Arena };
      }) => {
        const m: Membership = {
          finalPoints: null,
          finalRank: null,
          outcome: null,
          resultSeenAt: null,
          ...data,
        };
        state.memberships.push(m);
        return m;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { cohortId?: string; userId?: string; weekKey?: string; resultSeenAt?: null };
        data: Partial<Membership>;
      }) => {
        let count = 0;
        for (const m of state.memberships) {
          if (
            (where.cohortId === undefined || m.cohortId === where.cohortId) &&
            (where.userId === undefined || m.userId === where.userId) &&
            (where.weekKey === undefined || m.weekKey === where.weekKey) &&
            (where.resultSeenAt === undefined || m.resultSeenAt === null)
          ) {
            Object.assign(m, data);
            count += 1;
          }
        }
        return { count };
      },
    },
    weeklyScore: {
      findMany: async ({ where }: { where: { weekKey: string; userId?: { in: string[] } } }) =>
        state.scores.filter(
          (s) =>
            s.weekKey === where.weekKey && (!where.userId || where.userId.in.includes(s.userId)),
        ),
    },
    user: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) => {
        const u = state.users.get(id);
        return u ? { id, arena: u.arena } : null;
      },
      findUniqueOrThrow: async ({ where: { id } }: { where: { id: string } }) => ({
        id,
        arena: state.users.get(id)!.arena,
      }),
      findMany: async ({ where }: { where: { id?: { in: string[] } } }) =>
        [...state.users.entries()]
          .filter(
            ([id, u]) =>
              u.handle !== null && !u.socialPaused && (!where.id || where.id.in.includes(id)),
          )
          .map(([id, u]) => ({ id, arena: u.arena, leagueInactiveWeeks: u.leagueInactiveWeeks })),
      update: async ({
        where: { id },
        data,
      }: {
        where: { id: string };
        data: Partial<{ arena: Arena; leagueInactiveWeeks: number }>;
      }) => Object.assign(state.users.get(id)!, data),
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: { in: string[] } };
        data: { leagueInactiveWeeks: number | { increment: number } };
      }) => {
        for (const id of where.id.in) {
          const u = state.users.get(id)!;
          u.leagueInactiveWeeks =
            typeof data.leagueInactiveWeeks === 'number'
              ? data.leagueInactiveWeeks
              : u.leagueInactiveWeeks + data.leagueInactiveWeeks.increment;
        }
      },
    },
    notification: {
      findFirst: async ({
        where: { userId, kind },
      }: {
        where: { userId: string; kind: NotificationKind };
      }) => state.notifications.find((n) => n.userId === userId && n.kind === kind) ?? null,
    },
    friendship: { findMany: async () => [] },
    userBlock: { findMany: async () => [] },
  };
  return prisma as unknown as PrismaService;
};

const settings = (
  overrides: Partial<{
    leaguesEnabled: boolean;
    leagueStageMode: LeagueStageMode;
    leagueStage2MinUsers: number;
    leagueStage3MinUsers: number;
    leagueCohortSize: number;
    socialEnabled: boolean;
    socialBetaUserIds: string[];
  }> = {},
) =>
  ({
    get: async () => ({
      leaguesEnabled: true,
      leagueStageMode: LeagueStageMode.AUTO,
      leagueStage2MinUsers: 20,
      leagueStage3MinUsers: 100,
      leagueCohortSize: 30,
      socialEnabled: true,
      socialBetaUserIds: [],
      ...overrides,
    }),
  }) as unknown as AppSettingsService;

const notifications = (state: ReturnType<typeof makeState>) =>
  ({
    notify: async (userId: string, kind: NotificationKind, _a: null, payload: unknown) => {
      state.notifications.push({ userId, kind, payload });
    },
  }) as unknown as NotificationService;

const service = (state: ReturnType<typeof makeState>, settingsOverrides = {}) =>
  new LeagueService(makePrisma(state), settings(settingsOverrides), notifications(state));

const addUsers = (
  state: ReturnType<typeof makeState>,
  ids: string[],
  arena: Arena = Arena.GOLD,
) => {
  for (const id of ids) {
    state.users.set(id, { handle: id, socialPaused: false, arena, leagueInactiveWeeks: 0 });
  }
};

const seedCohort = (
  state: ReturnType<typeof makeState>,
  weekKey: string,
  userIds: string[],
  bucket: number | null = null,
) => {
  const cohort: Cohort = {
    id: `cohort-${state.cohortSeq++}`,
    weekKey,
    bucket,
    createdAt: new Date(Date.now() + state.cohortSeq),
  };
  state.cohorts.push(cohort);
  for (const userId of userIds) {
    state.memberships.push({
      cohortId: cohort.id,
      userId,
      weekKey,
      arenaAtStart: state.users.get(userId)!.arena,
      finalPoints: null,
      finalRank: null,
      outcome: null,
      resultSeenAt: null,
    });
  }
  return cohort;
};

const ids = (n: number, prefix = 'u') => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const prevWeek = () => previousWeekKey(berlinWeekKey(new Date()));

describe('ensureWeek stage selection (seeded 3 / 30 / 300)', () => {
  it('3 active → FRIENDS, 30 → GLOBAL, 300 → ARENAS', async () => {
    for (const [total, stage] of [
      [3, LeagueStage.FRIENDS],
      [30, LeagueStage.GLOBAL],
      [300, LeagueStage.ARENAS],
    ] as const) {
      const state = makeState();
      state.arenaCounts = [{ arena: Arena.GOLD, n: BigInt(total) }];
      const week = await service(state).ensureWeek('2099-01-05');
      assert.equal(week.stage, stage, `${total} users`);
      assert.equal(week.activeUsers, total);
    }
  });

  it('forced mode overrides AUTO thresholds', async () => {
    const state = makeState();
    state.arenaCounts = [{ arena: Arena.GOLD, n: BigInt(300) }];
    const week = await service(state, { leagueStageMode: LeagueStageMode.GLOBAL }).ensureWeek(
      '2099-01-05',
    );
    assert.equal(week.stage, LeagueStage.GLOBAL);
  });

  it('an existing week is returned untouched', async () => {
    const state = makeState();
    state.weeks.set('2099-01-05', {
      weekKey: '2099-01-05',
      stage: LeagueStage.GLOBAL,
      activeUsers: 42,
      buckets: null,
      closedAt: null,
    });
    assert.equal((await service(state).ensureWeek('2099-01-05')).stage, LeagueStage.GLOBAL);
  });
});

describe('ensurePlaced', () => {
  it('fills a cohort to its size, then creates the next one', async () => {
    const state = makeState();
    const weekKey = '2099-01-05';
    state.weeks.set(weekKey, {
      weekKey,
      stage: LeagueStage.GLOBAL,
      activeUsers: 0,
      buckets: null,
      closedAt: null,
    });
    addUsers(state, ids(7));
    const svc = service(state, { leagueCohortSize: 5 });
    for (const id of ids(7)) await svc.ensurePlaced(id, weekKey);
    assert.equal(state.cohorts.length, 2);
    const sizes = state.cohorts.map(
      (c) => state.memberships.filter((m) => m.cohortId === c.id).length,
    );
    assert.deepEqual(sizes, [5, 2]);
    assert.ok(state.locks >= 7, 'advisory lock taken per placement');
  });

  it('is a no-op for existing members and FRIENDS weeks', async () => {
    const state = makeState();
    const weekKey = '2099-01-05';
    state.weeks.set(weekKey, {
      weekKey,
      stage: LeagueStage.FRIENDS,
      activeUsers: 0,
      buckets: null,
      closedAt: null,
    });
    addUsers(state, ['u0']);
    const svc = service(state);
    await svc.ensurePlaced('u0', weekKey);
    assert.equal(state.memberships.length, 0);

    state.weeks.set(weekKey, { ...state.weeks.get(weekKey)!, stage: LeagueStage.GLOBAL });
    await svc.ensurePlaced('u0', weekKey);
    await svc.ensurePlaced('u0', weekKey);
    assert.equal(state.memberships.length, 1);
  });
});

describe('rollover', () => {
  const runScenario = async (n: number, stage: LeagueStage) => {
    const state = makeState();
    const prevKey = prevWeek();
    const userIds = ids(n);
    addUsers(state, userIds);
    state.weeks.set(prevKey, {
      weekKey: prevKey,
      stage,
      activeUsers: n,
      buckets: null,
      closedAt: null,
    });
    seedCohort(state, prevKey, userIds);
    for (const [i, id] of userIds.entries()) {
      state.scores.push({ userId: id, weekKey: prevKey, points: n - i, updatedAt: new Date(i) });
    }
    await service(state).rollover();
    return { state, prevKey, userIds };
  };

  const outcomeOf = (state: ReturnType<typeof makeState>, userId: string) =>
    state.memberships.find((m) => m.userId === userId)!.outcome;

  it('n=3: nobody moves', async () => {
    const { state, userIds } = await runScenario(3, LeagueStage.GLOBAL);
    assert.ok(userIds.every((id) => outcomeOf(state, id) === LeagueOutcome.STAYED));
  });

  it('n=5 GLOBAL: top promotes, bottom demotes', async () => {
    const { state, userIds } = await runScenario(5, LeagueStage.GLOBAL);
    assert.equal(outcomeOf(state, userIds[0]!), LeagueOutcome.PROMOTED);
    assert.equal(state.users.get(userIds[0]!)!.arena, Arena.PLATINUM);
    assert.equal(outcomeOf(state, userIds[4]!), LeagueOutcome.DEMOTED);
    assert.equal(state.users.get(userIds[4]!)!.arena, Arena.SILVER);
    assert.equal(outcomeOf(state, userIds[2]!), LeagueOutcome.STAYED);
  });

  it('n=10 GLOBAL: 2 promote, 2 demote; n=30 ARENAS: 7 promote, 5 demote', async () => {
    for (const [n, stage, promoted, demoted] of [
      [10, LeagueStage.GLOBAL, 2, 2],
      [30, LeagueStage.ARENAS, 7, 5],
    ] as const) {
      const { state } = await runScenario(n, stage);
      const count = (outcome: LeagueOutcome) =>
        state.memberships.filter((m) => m.outcome === outcome).length;
      assert.equal(count(LeagueOutcome.PROMOTED), promoted, `${stage} n=${n}`);
      assert.equal(count(LeagueOutcome.DEMOTED), demoted, `${stage} n=${n}`);
    }
  });

  it('arena edges: BRONZE cannot demote, TITAN cannot promote', async () => {
    const state = makeState();
    const prevKey = prevWeek();
    const userIds = ids(5);
    state.weeks.set(prevKey, {
      weekKey: prevKey,
      stage: LeagueStage.GLOBAL,
      activeUsers: 5,
      buckets: null,
      closedAt: null,
    });
    state.users.set(userIds[0]!, {
      handle: 'u0',
      socialPaused: false,
      arena: Arena.TITAN,
      leagueInactiveWeeks: 0,
    });
    addUsers(state, userIds.slice(1, 4), Arena.GOLD);
    state.users.set(userIds[4]!, {
      handle: 'u4',
      socialPaused: false,
      arena: Arena.BRONZE,
      leagueInactiveWeeks: 0,
    });
    seedCohort(state, prevKey, userIds);
    for (const [i, id] of userIds.entries()) {
      state.scores.push({ userId: id, weekKey: prevKey, points: 5 - i, updatedAt: new Date(i) });
    }
    await service(state).rollover();
    assert.equal(state.users.get(userIds[0]!)!.arena, Arena.TITAN);
    assert.equal(outcomeOf(state, userIds[4]!), LeagueOutcome.STAYED);
    assert.equal(state.users.get(userIds[4]!)!.arena, Arena.BRONZE);
  });

  it('drops an arena step after two consecutive weeks without membership', async () => {
    const state = makeState();
    const prevKey = prevWeek();
    state.weeks.set(prevKey, {
      weekKey: prevKey,
      stage: LeagueStage.GLOBAL,
      activeUsers: 5,
      buckets: null,
      closedAt: null,
    });
    addUsers(state, ['inactive', 'missed-once', 'member']);
    state.users.get('inactive')!.leagueInactiveWeeks = 1;
    seedCohort(state, prevKey, ['member']);
    state.scores.push({ userId: 'member', weekKey: prevKey, points: 10, updatedAt: new Date() });
    await service(state).rollover();
    assert.equal(state.users.get('inactive')!.arena, Arena.SILVER);
    assert.equal(state.users.get('inactive')!.leagueInactiveWeeks, 0);
    assert.equal(state.users.get('missed-once')!.leagueInactiveWeeks, 1);
    assert.equal(state.users.get('missed-once')!.arena, Arena.GOLD);
    assert.equal(state.users.get('member')!.leagueInactiveWeeks, 0);
  });

  it('members with 0 points rank but get no outcome', async () => {
    const state = makeState();
    const prevKey = prevWeek();
    const userIds = ids(5);
    addUsers(state, userIds);
    state.weeks.set(prevKey, {
      weekKey: prevKey,
      stage: LeagueStage.GLOBAL,
      activeUsers: 5,
      buckets: null,
      closedAt: null,
    });
    seedCohort(state, prevKey, userIds);
    for (const [i, id] of userIds.entries()) {
      state.scores.push({
        userId: id,
        weekKey: prevKey,
        points: i === 4 ? 0 : 5 - i,
        updatedAt: new Date(i),
      });
    }
    await service(state).rollover();
    assert.equal(outcomeOf(state, userIds[4]!), null);
    assert.equal(state.memberships.find((m) => m.userId === userIds[4])!.finalRank, 5);
  });

  it('is idempotent when run twice', async () => {
    const { state, prevKey } = await runScenario(5, LeagueStage.GLOBAL);
    const seen = state.memberships.map((m) => ({ ...m }));
    await service(state).rollover();
    assert.equal(state.memberships.length, seen.length);
    assert.ok(state.weeks.get(prevKey)!.closedAt);
    assert.deepEqual(
      state.memberships.map((m) => m.outcome),
      seen.map((m) => m.outcome),
    );
  });

  it('notifies promoted and demoted users with week/arena/rank payload', async () => {
    const { state, prevKey } = await runScenario(5, LeagueStage.GLOBAL);
    const kinds = state.notifications.map((n) => n.kind);
    assert.ok(kinds.includes(NotificationKind.LEAGUE_PROMOTED));
    assert.ok(kinds.includes(NotificationKind.LEAGUE_DEMOTED));
    const payload = state.notifications[0]!.payload as Record<string, unknown>;
    assert.equal(payload.weekKey, prevKey);
    assert.ok(payload.fromArena && payload.toArena && payload.rank);
  });

  it('closes every unclosed week oldest first and notifies only for the latest', async () => {
    const state = makeState();
    const prevKey = prevWeek();
    const olderKey = previousWeekKey(prevKey);
    for (const weekKey of [olderKey, prevKey]) {
      state.weeks.set(weekKey, {
        weekKey,
        stage: LeagueStage.GLOBAL,
        activeUsers: 5,
        buckets: null,
        closedAt: null,
      });
      const userIds = ids(5, weekKey);
      addUsers(state, userIds);
      seedCohort(state, weekKey, userIds);
      for (const [i, id] of userIds.entries()) {
        state.scores.push({
          userId: id,
          weekKey,
          points: 5 - i,
          updatedAt: new Date(i),
        });
      }
    }
    await service(state).rollover();
    assert.ok(state.weeks.get(olderKey)!.closedAt, 'older week closed');
    assert.ok(state.weeks.get(prevKey)!.closedAt, 'previous week closed');
    const notifiedWeeks = new Set(
      state.notifications.map((n) => (n.payload as { weekKey: string }).weekKey),
    );
    assert.deepEqual([...notifiedWeeks], [prevKey], 'only the latest week notifies');
  });

  it('does nothing when leagues are disabled', async () => {
    const state = makeState();
    await service(state, { leaguesEnabled: false }).rollover();
    assert.equal(state.notifications.length, 0);
  });
});

describe('reminder', () => {
  it('warns members near the promote line or inside the demotion zone, once', async () => {
    const state = makeState();
    const weekKey = berlinWeekKey(new Date());
    const userIds = ids(10);
    addUsers(state, userIds);
    state.weeks.set(weekKey, {
      weekKey,
      stage: LeagueStage.GLOBAL,
      activeUsers: 10,
      buckets: null,
      closedAt: null,
    });
    seedCohort(state, weekKey, userIds);
    for (const [i, id] of userIds.entries()) {
      state.scores.push({ userId: id, weekKey, points: 10 - i, updatedAt: new Date(i) });
    }
    const svc = service(state);
    await svc.reminder();
    const warned = new Set(state.notifications.map((n) => n.userId));
    assert.deepEqual([...warned].sort(), [userIds[2], userIds[3], userIds[8], userIds[9]].sort());
    await svc.reminder();
    assert.equal(state.notifications.length, 4, 'no duplicate weekly reminder');
  });

  it('does nothing for FRIENDS weeks', async () => {
    const state = makeState();
    const weekKey = berlinWeekKey(new Date());
    state.weeks.set(weekKey, {
      weekKey,
      stage: LeagueStage.FRIENDS,
      activeUsers: 0,
      buckets: null,
      closedAt: null,
    });
    await service(state).reminder();
    assert.equal(state.notifications.length, 0);
  });
});
