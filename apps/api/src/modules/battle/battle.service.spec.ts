import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DuelStatus, FriendStreakStatus, NotificationKind } from '@luki-fitti/common/enums';
import {
  addBerlinDays,
  berlinDayKey,
  berlinMidnight,
  berlinWeekKey,
  nextWeekKey,
} from '@luki-fitti/common/utils';
import type { AppSettingsService } from '../app-settings/app-settings.service';
import type { PrismaService } from '../database/prisma.service';
import type { NotificationService } from '../notifications/notification.service';
import { DuelService } from './duel.service';
import { StreakService } from './streak.service';
import { TrophyService } from './trophy.service';

interface User {
  id: string;
  handle: string | null;
  name: string | null;
  avatarKey: string | null;
  avatarUpdatedAt: Date | null;
}
interface Friendship {
  id: string;
  userAId: string;
  userBId: string;
  requestedById: string;
  status: 'PENDING' | 'ACCEPTED';
}
interface Duel {
  id: string;
  challengerId: string;
  opponentId: string;
  status: DuelStatus;
  createdAt: Date;
  respondedAt: Date | null;
  startDayKey: string | null;
  endDayKey: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  challengerPoints: number;
  opponentPoints: number;
  winnerId: string | null;
  isTie: boolean;
  challengerSeenAt: Date | null;
  opponentSeenAt: Date | null;
  lastStandingsDayKey: string | null;
}
interface Streak {
  id: string;
  friendshipId: string;
  status: FriendStreakStatus;
  requestedById: string;
  count: number;
  longest: number;
  startedWeekKey: string | null;
  lastEvaluatedWeekKey: string | null;
  freezes: number;
  weeksSinceFreeze: number;
  lastReminderWeekKey: string | null;
}
interface Entry {
  userId: string;
  sessionId: string;
  weekKey: string;
  dayKey: string;
  points: number;
}
interface Score {
  userId: string;
  weekKey: string;
  goalReached: boolean;
}

const makeUser = (id: string): User => ({
  id,
  handle: id,
  name: `User ${id}`,
  avatarKey: null,
  avatarUpdatedAt: null,
});

const pair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

const makeState = () => ({
  users: new Map<string, User>(),
  friendships: [] as Friendship[],
  blocks: [] as Array<{ blockerId: string; blockedId: string }>,
  duels: [] as Duel[],
  streaks: [] as Streak[],
  trophies: [] as Array<{
    userId: string;
    kind: string;
    refId: string;
    tier: null;
    createdAt: Date;
  }>,
  entries: [] as Entry[],
  scores: [] as Score[],
  prefs: new Map<string, number>(),
  notifications: [] as Array<{
    userId: string;
    kind: NotificationKind;
    actorId: string | null;
    payload: Record<string, unknown>;
  }>,
  seq: 0,
});
type State = ReturnType<typeof makeState>;

const addFriendship = (
  state: State,
  a: string,
  b: string,
  status: 'PENDING' | 'ACCEPTED' = 'ACCEPTED',
) => {
  const [x, y] = pair(a, b);
  state.friendships.push({
    id: `fs-${x}-${y}`,
    userAId: x,
    userBId: y,
    requestedById: a,
    status,
  });
  return state.friendships[state.friendships.length - 1]!;
};

const makeDuel = (
  state: State,
  partial: Partial<Duel> & { challengerId: string; opponentId: string },
): Duel => {
  const duel: Duel = {
    id: `duel-${state.seq++}`,
    status: DuelStatus.PENDING,
    createdAt: new Date(),
    respondedAt: null,
    startDayKey: null,
    endDayKey: null,
    startsAt: null,
    endsAt: null,
    challengerPoints: 0,
    opponentPoints: 0,
    winnerId: null,
    isTie: false,
    challengerSeenAt: null,
    opponentSeenAt: null,
    lastStandingsDayKey: null,
    ...partial,
  };
  state.duels.push(duel);
  return duel;
};

const makeStreak = (
  state: State,
  partial: Partial<Streak> & { friendshipId: string; requestedById: string },
): Streak => {
  const streak: Streak = {
    id: `streak-${state.seq++}`,
    status: FriendStreakStatus.ACTIVE,
    count: 0,
    longest: 0,
    startedWeekKey: null,
    lastEvaluatedWeekKey: null,
    freezes: 0,
    weeksSinceFreeze: 0,
    lastReminderWeekKey: null,
    ...partial,
  };
  state.streaks.push(streak);
  return streak;
};

/** Mirrors the Duel where-clauses used by DuelService. */
const duelMatches = (d: Duel, where: Record<string, unknown>): boolean => {
  const w = where as {
    id?: string;
    status?: DuelStatus | { in: DuelStatus[] };
    createdAt?: { lt: Date };
    endsAt?: { lte: Date };
    OR?: Array<{ challengerId?: string; opponentId?: string }>;
    NOT?: Array<Record<string, unknown>> | Record<string, unknown>;
  };
  if (w.id !== undefined && d.id !== w.id) return false;
  if (w.status !== undefined) {
    const ok =
      typeof w.status === 'object' && 'in' in w.status
        ? w.status.in.includes(d.status)
        : d.status === w.status;
    if (!ok) return false;
  }
  if (w.createdAt?.lt && !(d.createdAt < w.createdAt.lt)) return false;
  if (w.endsAt?.lte && !(d.endsAt !== null && d.endsAt <= w.endsAt.lte)) return false;
  if (w.OR) {
    const hit = w.OR.some(
      (c) =>
        (c.challengerId === undefined || d.challengerId === c.challengerId) &&
        (c.opponentId === undefined || d.opponentId === c.opponentId),
    );
    if (!hit) return false;
  }
  const nots = Array.isArray(w.NOT) ? w.NOT : w.NOT ? [w.NOT] : [];
  for (const n of nots) {
    for (const [k, v] of Object.entries(n)) {
      if ((d as unknown as Record<string, unknown>)[k] === v) return false;
    }
  }
  return true;
};

const streakMatches = (s: Streak, state: State, where: Record<string, unknown>): boolean => {
  const w = where as {
    id?: string;
    status?: FriendStreakStatus;
    count?: { gte: number };
    friendship?: { OR: Array<{ userAId?: string; userBId?: string }> };
    NOT?: { lastReminderWeekKey?: string } | Array<Record<string, unknown>>;
  };
  if (w.id !== undefined && s.id !== w.id) return false;
  if (w.status !== undefined && s.status !== w.status) return false;
  if (w.count?.gte !== undefined && s.count < w.count.gte) return false;
  if (w.friendship?.OR) {
    const f = state.friendships.find((x) => x.id === s.friendshipId);
    if (!f) return false;
    const hit = w.friendship.OR.some(
      (c) =>
        (c.userAId === undefined || f.userAId === c.userAId) &&
        (c.userBId === undefined || f.userBId === c.userBId),
    );
    if (!hit) return false;
  }
  const nots = Array.isArray(w.NOT) ? w.NOT : w.NOT ? [w.NOT] : [];
  for (const n of nots) {
    for (const [k, v] of Object.entries(n)) {
      if ((s as unknown as Record<string, unknown>)[k] === v) return false;
    }
  }
  return true;
};

const friendshipOf = (state: State, s: Streak) =>
  state.friendships.find((f) => f.id === s.friendshipId)!;

const makePrisma = (state: State) => {
  const prisma = {
    $transaction: async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return (arg as (tx: unknown) => Promise<unknown>)(prisma);
    },
    user: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        state.users.get(id) ?? null,
    },
    friendship: {
      findUnique: async ({
        where: { userAId_userBId },
      }: {
        where: { userAId_userBId: { userAId: string; userBId: string } };
      }) =>
        state.friendships.find(
          (f) => f.userAId === userAId_userBId.userAId && f.userBId === userAId_userBId.userBId,
        ) ?? null,
      findUniqueOrThrow: async (args: {
        where: { userAId_userBId: { userAId: string; userBId: string } };
      }) => {
        const f = await prisma.friendship.findUnique(args);
        if (!f) throw new NotFoundException();
        return f;
      },
    },
    userBlock: {
      count: async ({
        where: { OR },
      }: {
        where: { OR: Array<{ blockerId: string; blockedId: string }> };
      }) =>
        state.blocks.filter((b) =>
          OR.some((c) => c.blockerId === b.blockerId && c.blockedId === b.blockedId),
        ).length,
    },
    duel: {
      create: async ({ data }: { data: { challengerId: string; opponentId: string } }) =>
        makeDuel(state, data),
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.duels.find((d) => duelMatches(d, where)) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        [...state.duels]
          .filter((d) => duelMatches(d, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      update: async ({
        where: { id },
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const d = state.duels.find((x) => x.id === id);
        if (!d) throw new NotFoundException();
        Object.assign(d, data);
        return d;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        let count = 0;
        for (const d of state.duels) {
          if (!duelMatches(d, where)) continue;
          Object.assign(d, data);
          count += 1;
        }
        return { count };
      },
      count: async ({ where }: { where: Record<string, unknown> }) =>
        state.duels.filter((d) => duelMatches(d, where)).length,
    },
    effortPointEntry: {
      findMany: async ({
        where,
      }: {
        where: { userId: string; dayKey?: { gte: string; lt: string }; weekKey?: string };
      }) =>
        state.entries.filter(
          (e) =>
            e.userId === where.userId &&
            (where.dayKey === undefined ||
              (e.dayKey >= where.dayKey.gte && e.dayKey < where.dayKey.lt)) &&
            (where.weekKey === undefined || e.weekKey === where.weekKey),
        ),
      count: async ({
        where,
      }: {
        where: { userId: string; weekKey: string; points?: { gt: number } };
      }) =>
        state.entries.filter(
          (e) =>
            e.userId === where.userId &&
            e.weekKey === where.weekKey &&
            (where.points === undefined || e.points > where.points.gt),
        ).length,
    },
    weeklyScore: {
      findMany: async ({
        where,
      }: {
        where: { userId: { in: string[] }; weekKey: { in: string[] } | string };
      }) =>
        state.scores.filter(
          (s) =>
            where.userId.in.includes(s.userId) &&
            (typeof where.weekKey === 'string'
              ? s.weekKey === where.weekKey
              : where.weekKey.in.includes(s.weekKey)),
        ),
    },
    userPreferences: {
      findUnique: async ({ where: { userId } }: { where: { userId: string } }) =>
        state.prefs.has(userId) ? { weeklyGoalSessions: state.prefs.get(userId) } : null,
    },
    friendStreak: {
      create: async ({
        data,
      }: {
        data: { friendshipId: string; status: FriendStreakStatus; requestedById: string };
      }) => {
        if (state.streaks.some((s) => s.friendshipId === data.friendshipId)) {
          const err = new Error('unique') as Error & { code: string };
          err.code = 'P2002';
          throw err;
        }
        return makeStreak(state, data);
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const s = state.streaks.find((x) => streakMatches(x, state, where));
        return s ? { ...s, friendship: friendshipOf(state, s) } : null;
      },
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        state.streaks.find((s) => s.id === id) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        state.streaks
          .filter((s) => streakMatches(s, state, where))
          .map((s) => ({ ...s, friendship: friendshipOf(state, s) })),
      update: async ({
        where: { id },
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const s = state.streaks.find((x) => x.id === id);
        if (!s) throw new NotFoundException();
        Object.assign(s, data);
        return s;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        let count = 0;
        for (const s of state.streaks) {
          if (!streakMatches(s, state, where)) continue;
          Object.assign(s, data);
          count += 1;
        }
        return { count };
      },
      delete: async ({ where: { id } }: { where: { id: string } }) => {
        const i = state.streaks.findIndex((s) => s.id === id);
        if (i >= 0) state.streaks.splice(i, 1);
      },
    },
    trophy: {
      upsert: async ({
        where: { userId_kind_refId },
        create,
      }: {
        where: { userId_kind_refId: { userId: string; kind: string; refId: string } };
        create: { userId: string; kind: string; refId: string };
      }) => {
        const key = `${create.userId}:${create.kind}:${create.refId}`;
        void userId_kind_refId;
        if (!state.trophies.some((t) => `${t.userId}:${t.kind}:${t.refId}` === key)) {
          state.trophies.push({ ...create, tier: null, createdAt: new Date() });
        }
        return create;
      },
      findMany: async ({ where: { userId } }: { where: { userId: string } }) =>
        state.trophies.filter((t) => t.userId === userId),
    },
  };
  return prisma;
};

const notifications = (state: State) =>
  ({
    notify: async (
      userId: string,
      kind: NotificationKind,
      actorId: string | null,
      payload: Record<string, unknown>,
    ) => {
      state.notifications.push({ userId, kind, actorId, payload });
    },
  }) as unknown as NotificationService;

const appSettings = (overrides: Record<string, unknown> = {}) =>
  ({
    get: async () => ({ epDailyCap: 600, duelsEnabled: true, ...overrides }),
  }) as unknown as AppSettingsService;

const duelService = (state: State, overrides?: Record<string, unknown>) =>
  new DuelService(
    makePrisma(state) as unknown as PrismaService,
    appSettings(overrides),
    notifications(state),
  );
const streakService = (state: State) =>
  new StreakService(makePrisma(state) as unknown as PrismaService, notifications(state));
const trophyService = (state: State) =>
  new TrophyService(makePrisma(state) as unknown as PrismaService);

const addUsers = (state: State, ids: string[]) => {
  for (const id of ids) state.users.set(id, makeUser(id));
};

describe('DuelService.challenge', () => {
  it('creates a pending duel and notifies the opponent', async () => {
    const state = makeState();
    addUsers(state, ['a', 'b']);
    addFriendship(state, 'a', 'b');
    const item = await duelService(state).challenge('a', 'b');
    assert.equal(item.status, DuelStatus.PENDING);
    assert.equal(item.opponent.userId, 'b');
    const invite = state.notifications.find((n) => n.kind === NotificationKind.DUEL_INVITE);
    assert.equal(invite?.userId, 'b');
    assert.equal(invite?.actorId, 'a');
  });

  it('rejects non-friends, pending friendships and self', async () => {
    const state = makeState();
    addUsers(state, ['a', 'b', 'c']);
    addFriendship(state, 'a', 'b', 'PENDING');
    const svc = duelService(state);
    await assert.rejects(svc.challenge('a', 'b'), NotFoundException);
    await assert.rejects(svc.challenge('a', 'c'), NotFoundException);
    await assert.rejects(svc.challenge('a', 'a'), BadRequestException);
  });

  it('allows at most 3 open duels per user and one per pair', async () => {
    const state = makeState();
    addUsers(state, ['a', 'b', 'c', 'd', 'e']);
    for (const other of ['b', 'c', 'd', 'e']) addFriendship(state, 'a', other);
    const svc = duelService(state);
    makeDuel(state, { challengerId: 'a', opponentId: 'b' });
    makeDuel(state, { challengerId: 'c', opponentId: 'a', status: DuelStatus.ACTIVE });
    makeDuel(state, { challengerId: 'a', opponentId: 'd', status: DuelStatus.ACTIVE });
    await assert.rejects(svc.challenge('a', 'e'), ConflictException);
    state.duels[1]!.status = DuelStatus.COMPLETED;
    await assert.rejects(svc.challenge('a', 'b'), ConflictException);
  });
});

describe('DuelService.accept', () => {
  it('schedules the duel for the next 7 Berlin days', async () => {
    const state = makeState();
    addUsers(state, ['a', 'b']);
    addFriendship(state, 'a', 'b');
    const duel = makeDuel(state, { challengerId: 'a', opponentId: 'b' });
    const item = await duelService(state).accept('b', duel.id);
    const tomorrow = addBerlinDays(berlinDayKey(new Date()), 1);
    assert.equal(item.status, DuelStatus.ACTIVE);
    assert.equal(duel.startDayKey, tomorrow);
    assert.equal(duel.endDayKey, addBerlinDays(tomorrow, 7));
    assert.deepEqual(duel.startsAt, berlinMidnight(tomorrow));
    assert.deepEqual(duel.endsAt, berlinMidnight(duel.endDayKey!));
    assert.equal(
      state.notifications.find((n) => n.kind === NotificationKind.DUEL_ACCEPTED)?.userId,
      'a',
    );
  });

  it('is opponent-only and fails once expired', async () => {
    const state = makeState();
    addUsers(state, ['a', 'b', 'c']);
    addFriendship(state, 'a', 'b');
    addFriendship(state, 'a', 'c');
    const svc = duelService(state);
    const duel = makeDuel(state, { challengerId: 'a', opponentId: 'b' });
    await assert.rejects(svc.accept('a', duel.id), NotFoundException);
    const stale = makeDuel(state, {
      challengerId: 'a',
      opponentId: 'c',
      createdAt: new Date(Date.now() - 49 * 60 * 60 * 1000),
    });
    await assert.rejects(svc.accept('c', stale.id), NotFoundException);
    assert.equal(stale.status, DuelStatus.EXPIRED);
  });

  it('decline and cancel are silent transitions', async () => {
    const state = makeState();
    addUsers(state, ['a', 'b', 'c']);
    addFriendship(state, 'a', 'b');
    addFriendship(state, 'a', 'c');
    const svc = duelService(state);
    const d1 = makeDuel(state, { challengerId: 'a', opponentId: 'b' });
    await svc.decline('b', d1.id);
    assert.equal(d1.status, DuelStatus.DECLINED);
    const d2 = makeDuel(state, { challengerId: 'a', opponentId: 'c' });
    await svc.cancel('a', d2.id);
    assert.equal(d2.status, DuelStatus.CANCELLED);
    assert.equal(state.notifications.length, 0);
  });
});

describe('DuelService scoring and tick', () => {
  const activeDuel = (state: State) => {
    const startDayKey = addBerlinDays(berlinDayKey(new Date()), -2);
    const endDayKey = addBerlinDays(startDayKey, 7);
    return makeDuel(state, {
      challengerId: 'a',
      opponentId: 'b',
      status: DuelStatus.ACTIVE,
      startDayKey,
      endDayKey,
      startsAt: berlinMidnight(startDayKey),
      endsAt: berlinMidnight(endDayKey),
    });
  };
  const entry = (state: State, userId: string, dayKey: string, points: number) => {
    state.entries.push({
      userId,
      sessionId: `s-${state.seq++}`,
      weekKey: dayKey,
      dayKey,
      points,
    });
  };

  it('sums daily-capped points inside the window only', async () => {
    const state = makeState();
    addUsers(state, ['a', 'b']);
    addFriendship(state, 'a', 'b');
    const duel = activeDuel(state);
    const inDay = duel.startDayKey!;
    const day2 = addBerlinDays(inDay, 1);
    // Cap: 400 + 400 on one day counts 600, not 800.
    entry(state, 'a', inDay, 400);
    entry(state, 'a', inDay, 400);
    entry(state, 'a', day2, 200);
    // Outside the window: before start and on the exclusive end day.
    entry(state, 'a', addBerlinDays(inDay, -1), 500);
    entry(state, 'a', duel.endDayKey!, 500);
    entry(state, 'b', inDay, 100);
    await duelService(state).recomputeForUser('a');
    assert.equal(duel.challengerPoints, 800);
    assert.equal(duel.opponentPoints, 100);
    // Removing the entry again lowers the score.
    state.entries = state.entries.filter((e) => e.userId !== 'a' || e.points !== 200);
    await duelService(state).recomputeForUser('a');
    assert.equal(duel.challengerPoints, 600);
  });

  it('tick expires 48h-old challenges silently', async () => {
    const state = makeState();
    const duel = makeDuel(state, {
      challengerId: 'a',
      opponentId: 'b',
      createdAt: new Date(Date.now() - 49 * 60 * 60 * 1000),
    });
    const fresh = makeDuel(state, { challengerId: 'a', opponentId: 'b' });
    await duelService(state).tick();
    assert.equal(duel.status, DuelStatus.EXPIRED);
    assert.equal(fresh.status, DuelStatus.PENDING);
    assert.equal(state.notifications.length, 0);
  });

  it('completes a duel: winner, trophy, both notified once', async () => {
    const state = makeState();
    addUsers(state, ['a', 'b']);
    addFriendship(state, 'a', 'b');
    const duel = makeDuel(state, {
      challengerId: 'a',
      opponentId: 'b',
      status: DuelStatus.ACTIVE,
      startDayKey: addBerlinDays(berlinDayKey(new Date()), -7),
      endDayKey: berlinDayKey(new Date()),
      endsAt: new Date(Date.now() - 1000),
    });
    entry(state, 'a', duel.startDayKey!, 300);
    entry(state, 'b', duel.startDayKey!, 200);
    const svc = duelService(state);
    await svc.tick();
    assert.equal(duel.status, DuelStatus.COMPLETED);
    assert.equal(duel.winnerId, 'a');
    assert.equal(duel.challengerPoints, 300);
    assert.equal(duel.opponentPoints, 200);
    assert.deepEqual(
      state.trophies.map((t) => t.userId),
      ['a'],
    );
    const results = state.notifications.filter((n) => n.kind === NotificationKind.DUEL_RESULT);
    assert.equal(results.length, 2);
    assert.equal(results.find((n) => n.userId === 'a')?.payload.outcome, 'WON');
    assert.equal(results.find((n) => n.userId === 'b')?.payload.outcome, 'LOST');
    // A second tick does not re-complete.
    await svc.tick();
    assert.equal(
      state.notifications.filter((n) => n.kind === NotificationKind.DUEL_RESULT).length,
      2,
    );
  });

  it('ties award both sides — except a 0–0', async () => {
    const state = makeState();
    addUsers(state, ['a', 'b', 'c', 'd']);
    const past = {
      status: DuelStatus.ACTIVE,
      startDayKey: addBerlinDays(berlinDayKey(new Date()), -7),
      endDayKey: berlinDayKey(new Date()),
      endsAt: new Date(Date.now() - 1000),
    };
    const tie = makeDuel(state, { challengerId: 'a', opponentId: 'b', ...past });
    const zero = makeDuel(state, { challengerId: 'c', opponentId: 'd', ...past });
    entry(state, 'a', past.startDayKey, 100);
    entry(state, 'b', past.startDayKey, 100);
    await duelService(state).tick();
    assert.equal(tie.isTie, true);
    assert.equal(zero.isTie, true);
    assert.deepEqual(state.trophies.map((t) => t.userId).sort(), ['a', 'b']);
    for (const n of state.notifications.filter((n) => n.kind === NotificationKind.DUEL_RESULT)) {
      assert.equal(n.payload.outcome, 'TIE');
    }
  });

  it('list partitions duels and exposes the unseen result', async () => {
    const state = makeState();
    addUsers(state, ['a', 'b', 'c']);
    addFriendship(state, 'a', 'b');
    addFriendship(state, 'a', 'c');
    activeDuel(state);
    makeDuel(state, { challengerId: 'c', opponentId: 'a' });
    makeDuel(state, { challengerId: 'a', opponentId: 'c' });
    const done = makeDuel(state, {
      challengerId: 'b',
      opponentId: 'a',
      status: DuelStatus.COMPLETED,
      winnerId: 'b',
    });
    const svc = duelService(state);
    const list = await svc.list('a');
    assert.equal(list.active.length, 1);
    assert.equal(list.incoming.length, 1);
    assert.equal(list.outgoing.length, 1);
    assert.equal(list.recent.length, 1);
    assert.equal(list.pendingResult?.id, done.id);
    assert.equal(list.pendingResult?.outcome, 'LOST');
    await svc.markSeen('a', done.id);
    assert.equal((await svc.list('a')).pendingResult, null);
    // Detail is participant-only and carries per-day scores.
    const detail = await svc.detail('a', state.duels[0]!.id);
    assert.ok(Array.isArray(detail.days));
    await assert.rejects(svc.detail('c', state.duels[0]!.id), NotFoundException);
  });

  it('standings pushes once per day and never on the start day', async () => {
    const state = makeState();
    addUsers(state, ['a', 'b', 'c', 'd']);
    const today = berlinDayKey(new Date());
    const started = makeDuel(state, {
      challengerId: 'a',
      opponentId: 'b',
      status: DuelStatus.ACTIVE,
      startDayKey: addBerlinDays(today, -1),
      endDayKey: addBerlinDays(today, 6),
    });
    makeDuel(state, {
      challengerId: 'c',
      opponentId: 'd',
      status: DuelStatus.ACTIVE,
      startDayKey: today,
      endDayKey: addBerlinDays(today, 7),
    });
    const svc = duelService(state);
    await svc.standings();
    const standings = state.notifications.filter((n) => n.kind === NotificationKind.DUEL_STANDINGS);
    assert.equal(standings.length, 2);
    assert.equal(started.lastStandingsDayKey, today);
    await svc.standings();
    assert.equal(
      state.notifications.filter((n) => n.kind === NotificationKind.DUEL_STANDINGS).length,
      2,
      'no second push on the same day',
    );
  });
});

describe('StreakService', () => {
  const accepted = (state: State, a: string, b: string) => {
    const f = addFriendship(state, a, b);
    return f;
  };

  it('invite → accept starts counting the current week', async () => {
    const state = makeState();
    addUsers(state, ['a', 'b']);
    const f = accepted(state, 'a', 'b');
    const svc = streakService(state);
    const dto = await svc.invite('a', 'b');
    assert.equal(dto.status, FriendStreakStatus.PENDING);
    assert.equal(
      state.notifications.find((n) => n.kind === NotificationKind.STREAK_INVITE)?.userId,
      'b',
    );
    const streak = state.streaks.find((s) => s.friendshipId === f.id)!;
    const acceptedDto = await svc.accept('b', streak.id);
    assert.equal(acceptedDto.status, FriendStreakStatus.ACTIVE);
    assert.equal(streak.startedWeekKey, berlinWeekKey(new Date()));
    assert.equal(
      state.notifications.find((n) => n.kind === NotificationKind.STREAK_STARTED)?.userId,
      'a',
    );
    // One streak per friendship.
    await assert.rejects(svc.invite('a', 'b'), ConflictException);
  });

  it('lists this-week progress for both sides', async () => {
    const state = makeState();
    addUsers(state, ['a', 'b']);
    const f = accepted(state, 'a', 'b');
    const week = berlinWeekKey(new Date());
    makeStreak(state, { friendshipId: f.id, requestedById: 'a', startedWeekKey: week });
    state.entries.push(
      { userId: 'a', sessionId: 's1', weekKey: week, dayKey: week, points: 10 },
      { userId: 'b', sessionId: 's2', weekKey: week, dayKey: week, points: 10 },
      { userId: 'b', sessionId: 's3', weekKey: week, dayKey: week, points: 10 },
      // 0-point entries do not count towards the goal.
      { userId: 'b', sessionId: 's4', weekKey: week, dayKey: week, points: 0 },
    );
    state.prefs.set('a', 2);
    const list = await streakService(state).list('a');
    assert.equal(list.active.length, 1);
    assert.deepEqual(list.active[0]!.thisWeek, {
      you: { done: 1, target: 2 },
      them: { done: 2, target: 4 },
    });
  });

  it('evaluation: both reached keeps the streak and banks freezes at 4', async () => {
    const state = makeState();
    const f = accepted(state, 'a', 'b');
    const w0 = '2026-10-19';
    const streak = makeStreak(state, {
      friendshipId: f.id,
      requestedById: 'a',
      startedWeekKey: w0,
      count: 3,
      longest: 3,
      weeksSinceFreeze: 3,
    });
    const w1 = nextWeekKey(w0);
    for (const u of ['a', 'b']) state.scores.push({ userId: u, weekKey: w0, goalReached: true });
    await streakService(state).evaluateClosedWeeks(w1);
    assert.equal(streak.count, 4);
    assert.equal(streak.longest, 4);
    assert.equal(streak.freezes, 1, 'a freeze is banked at 4 kept weeks');
    assert.equal(streak.weeksSinceFreeze, 0);
    assert.equal(streak.lastEvaluatedWeekKey, w0);
  });

  it('a missed week consumes a freeze before breaking', async () => {
    const state = makeState();
    const f = accepted(state, 'a', 'b');
    const w0 = '2026-10-19';
    const streak = makeStreak(state, {
      friendshipId: f.id,
      requestedById: 'a',
      startedWeekKey: w0,
      count: 5,
      freezes: 2,
    });
    // Only one side reached → freeze consumed, count kept.
    state.scores.push({ userId: 'a', weekKey: w0, goalReached: true });
    await streakService(state).evaluateClosedWeeks(nextWeekKey(w0));
    assert.equal(streak.count, 5);
    assert.equal(streak.freezes, 1);
    assert.equal(
      state.notifications.filter((n) => n.kind === NotificationKind.STREAK_FROZEN).length,
      2,
    );
    // Next missed week with one freeze left consumes it, then the week after breaks.
    const w1 = nextWeekKey(w0);
    await streakService(state).evaluateClosedWeeks(nextWeekKey(w1));
    assert.equal(streak.freezes, 0);
    assert.equal(streak.count, 5);
    const w2 = nextWeekKey(w1);
    await streakService(state).evaluateClosedWeeks(nextWeekKey(w2));
    assert.equal(streak.count, 0);
    assert.equal(
      state.notifications.filter((n) => n.kind === NotificationKind.STREAK_BROKEN).length,
      2,
    );
  });

  it('freezes cap at 2 and startedWeekKey is respected', async () => {
    const state = makeState();
    const f = accepted(state, 'a', 'b');
    const w0 = '2026-10-19';
    const streak = makeStreak(state, {
      friendshipId: f.id,
      requestedById: 'a',
      startedWeekKey: w0,
      count: 8,
      freezes: 2,
      weeksSinceFreeze: 3,
    });
    for (const u of ['a', 'b']) state.scores.push({ userId: u, weekKey: w0, goalReached: true });
    await streakService(state).evaluateClosedWeeks(nextWeekKey(w0));
    assert.equal(streak.freezes, 2, 'no third freeze');
    assert.equal(streak.count, 9);
    assert.equal(streak.lastEvaluatedWeekKey, w0);
  });

  it('catches up multiple closed weeks in order after an outage', async () => {
    const state = makeState();
    const f = accepted(state, 'a', 'b');
    const w0 = '2026-10-19';
    const w1 = nextWeekKey(w0);
    const w2 = nextWeekKey(w1);
    const w3 = nextWeekKey(w2);
    const streak = makeStreak(state, {
      friendshipId: f.id,
      requestedById: 'a',
      startedWeekKey: w0,
    });
    // w0 kept, w1 missed without a freeze → break; w2 reached again → count 1.
    for (const u of ['a', 'b']) {
      state.scores.push({ userId: u, weekKey: w0, goalReached: true });
      state.scores.push({ userId: u, weekKey: w2, goalReached: true });
    }
    await streakService(state).evaluateClosedWeeks(w3);
    assert.equal(streak.count, 1);
    assert.equal(streak.lastEvaluatedWeekKey, w2);
    const broken = state.notifications.filter((n) => n.kind === NotificationKind.STREAK_BROKEN);
    assert.equal(broken.length, 2);
  });

  it('reminder nudges only partners still short of the goal, once per week', async () => {
    const state = makeState();
    const f = accepted(state, 'a', 'b');
    const week = berlinWeekKey(new Date());
    makeStreak(state, {
      friendshipId: f.id,
      requestedById: 'a',
      startedWeekKey: week,
      count: 3,
    });
    state.scores.push({ userId: 'a', weekKey: week, goalReached: true });
    const svc = streakService(state);
    await svc.remind(week);
    const reminders = state.notifications.filter(
      (n) => n.kind === NotificationKind.STREAK_REMINDER,
    );
    assert.equal(reminders.length, 1);
    assert.equal(reminders[0]!.userId, 'b', 'only the short partner is nudged');
    assert.equal(reminders[0]!.payload.count, 3);
    await svc.remind(week);
    assert.equal(
      state.notifications.filter((n) => n.kind === NotificationKind.STREAK_REMINDER).length,
      1,
      'no second reminder in the same week',
    );
  });

  it('ending a streak deletes it silently', async () => {
    const state = makeState();
    const f = accepted(state, 'a', 'b');
    const streak = makeStreak(state, { friendshipId: f.id, requestedById: 'a' });
    const svc = streakService(state);
    await svc.end('b', streak.id);
    assert.equal(state.streaks.length, 0);
    assert.equal(state.notifications.length, 0);
  });
});

describe('TrophyService', () => {
  it('serves the shelf to self and friends, 404 for strangers', async () => {
    const state = makeState();
    addUsers(state, ['a', 'b', 'c']);
    addFriendship(state, 'a', 'b');
    state.trophies.push({
      userId: 'a',
      kind: 'DUEL_WIN',
      refId: 'd1',
      tier: null,
      createdAt: new Date(),
    });
    const svc = trophyService(state);
    const own = await svc.list('a', 'a');
    assert.equal(own.items.length, 1);
    assert.equal(own.counts.DUEL_WIN, 1);
    const friends = await svc.list('b', 'a');
    assert.equal(friends.items.length, 1);
    await assert.rejects(svc.list('c', 'a'), NotFoundException);
  });
});
