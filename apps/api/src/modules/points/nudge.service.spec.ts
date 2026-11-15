import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { berlinDayKey, berlinMidnight, berlinWeekKey, weekBounds } from '@luki-fitti/common/utils';
import { NotificationKind } from '@luki-fitti/common/enums';
import type { PrismaService } from '../database/prisma.service';
import type { SocialAccessService } from '../social/social-access.service';
import type { NotificationService } from '../notifications/notification.service';
import { NudgeService } from './nudge.service';

const NOW = new Date();
const WEEK = berlinWeekKey(NOW);
const TODAY = berlinDayKey(NOW);

interface Entry {
  userId: string;
  weekKey: string;
  dayKey: string;
  points: number;
}

const YESTERDAY = '2000-01-01'; // any day that is not today — only dayKey matters

const entry = (userId: string, points = 50, weekKey = WEEK, dayKey = TODAY): Entry => ({
  userId,
  weekKey,
  dayKey,
  points,
});

const makeState = () => ({
  entries: [] as Entry[],
  friendships: [] as Array<{ userAId: string; userBId: string; status: string }>,
  blocks: [] as Array<{ blockerId: string; blockedId: string }>,
  users: new Map<string, { socialPaused: boolean }>(),
  scores: [] as Array<{ userId: string; weekKey: string; goalReached: boolean }>,
  notifications: [] as Array<{
    userId: string;
    kind: string;
    actorId: string | null;
    createdAt: Date;
  }>,
});

const addFriends = (state: ReturnType<typeof makeState>, a: string, ...fs: string[]) => {
  for (const f of fs) state.friendships.push({ userAId: a, userBId: f, status: 'ACCEPTED' });
};

const makePrisma = (state: ReturnType<typeof makeState>) =>
  ({
    friendship: {
      findMany: async ({
        where,
      }: {
        where: { status: string; OR: Array<{ userAId?: string; userBId?: string }> };
      }) =>
        state.friendships.filter(
          (f) =>
            f.status === where.status &&
            where.OR.some(
              (o) =>
                (o.userAId !== undefined && f.userAId === o.userAId) ||
                (o.userBId !== undefined && f.userBId === o.userBId),
            ),
        ),
    },
    userBlock: {
      findMany: async ({
        where,
      }: {
        where: {
          OR: Array<{ blockerId?: unknown; blockedId?: unknown }>;
        };
      }) =>
        state.blocks.filter((b) =>
          where.OR.some((o) => {
            const blocker = o.blockerId as { in?: string[] } | string;
            const blocked = o.blockedId as { in?: string[] } | string;
            const bOk =
              typeof blocker === 'string'
                ? b.blockerId === blocker
                : (blocker.in?.includes(b.blockerId) ?? true);
            const dOk =
              typeof blocked === 'string'
                ? b.blockedId === blocked
                : (blocked.in?.includes(b.blockedId) ?? true);
            return bOk && dOk;
          }),
        ),
    },
    effortPointEntry: {
      groupBy: async ({
        where,
      }: {
        by: string[];
        where: { weekKey: string; points: { gt: number }; userId: { in: string[] } };
      }) => {
        const counts = new Map<string, number>();
        for (const e of state.entries) {
          if (
            e.weekKey === where.weekKey &&
            e.points > where.points.gt &&
            where.userId.in.includes(e.userId)
          ) {
            counts.set(e.userId, (counts.get(e.userId) ?? 0) + 1);
          }
        }
        return [...counts].map(([userId, n]) => ({ userId, _count: { _all: n } }));
      },
      findMany: async ({
        where,
      }: {
        where: { userId: { in: string[] }; dayKey: string; points: { gt: number } };
      }) => {
        const seen = new Set<string>();
        return state.entries.filter((e) => {
          if (
            !where.userId.in.includes(e.userId) ||
            e.dayKey !== where.dayKey ||
            e.points <= where.points.gt ||
            seen.has(e.userId)
          ) {
            return false;
          }
          seen.add(e.userId);
          return true;
        });
      },
    },
    user: {
      findMany: async ({ where }: { where: { id: { in: string[] }; socialPaused: boolean } }) =>
        where.id.in
          .filter((id) => (state.users.get(id)?.socialPaused ?? false) === where.socialPaused)
          .map((id) => ({ id })),
    },
    weeklyScore: {
      findMany: async ({
        where,
      }: {
        where: { weekKey: string; userId: { in: string[] }; goalReached: boolean };
      }) =>
        state.scores.filter(
          (s) =>
            s.weekKey === where.weekKey &&
            where.userId.in.includes(s.userId) &&
            s.goalReached === where.goalReached,
        ),
    },
    notification: {
      findMany: async ({
        where,
      }: {
        where: {
          kind: string;
          userId: { in: string[] };
          actorId?: string;
          createdAt: { gte: Date; lt?: Date };
        };
      }) =>
        state.notifications.filter(
          (n) =>
            n.kind === where.kind &&
            where.userId.in.includes(n.userId) &&
            (where.actorId === undefined || n.actorId === where.actorId) &&
            n.createdAt >= where.createdAt.gte &&
            (where.createdAt.lt === undefined || n.createdAt < where.createdAt.lt),
        ),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          userId: data.userId as string,
          kind: data.kind as string,
          actorId: (data.actorId ?? null) as string | null,
          createdAt: NOW,
        };
        state.notifications.push(row);
        return row;
      },
    },
  }) as unknown as PrismaService;

const makeDeps = (state: ReturnType<typeof makeState>, disabledFor: string[] = []) => {
  const notified: Array<{
    userId: string;
    kind: string;
    actorId: string | null;
    payload: unknown;
  }> = [];
  const access = {
    isEnabledFor: async (id: string) => !disabledFor.includes(id),
  } as unknown as SocialAccessService;
  const notifications = {
    notify: async (
      userId: string,
      kind: string,
      actorId: string | null,
      payload: Record<string, unknown>,
    ) => {
      notified.push({ userId, kind, actorId, payload });
      state.notifications.push({ userId, kind, actorId, createdAt: NOW });
    },
  } as unknown as NotificationService;
  const svc = new NudgeService(makePrisma(state), access, notifications);
  return { svc, notified };
};

describe('NudgeService.afterEntry', () => {
  it('nudges a friend when A pulls ahead of them', async () => {
    const state = makeState();
    addFriends(state, 'A', 'F');
    state.entries.push(entry('A'), entry('A'), entry('F', 50, WEEK, YESTERDAY)); // A: 2, F: 1
    const { svc, notified } = makeDeps(state);
    await svc.afterEntry('A', WEEK, NOW);
    assert.equal(notified.length, 1);
    assert.equal(notified[0]!.userId, 'F');
    assert.equal(notified[0]!.kind, NotificationKind.FRIEND_PULLED_AHEAD);
    assert.equal(notified[0]!.actorId, 'A');
    assert.deepEqual(notified[0]!.payload, {
      count: 2,
      you: 1,
      weekKey: WEEK,
      url: '/social/friends',
    });
  });

  it('does not nudge the same friend twice in one day', async () => {
    const state = makeState();
    addFriends(state, 'A', 'F');
    state.entries.push(entry('A')); // A: 1, F: 0 → first session nudges
    const { svc, notified } = makeDeps(state);
    await svc.afterEntry('A', WEEK, NOW);
    assert.equal(notified.length, 1);
    state.entries.push(entry('A')); // A: 2 on the same day
    await svc.afterEntry('A', WEEK, NOW);
    assert.equal(notified.length, 1);
  });

  it('nudges when the lead grows to two (friend at zero)', async () => {
    const state = makeState();
    addFriends(state, 'A', 'F');
    state.entries.push(entry('A'), entry('A')); // A: 2, F: 0
    const { svc, notified } = makeDeps(state);
    await svc.afterEntry('A', WEEK, NOW);
    assert.equal(notified.length, 1);
  });

  it('does not nudge when A only catches up without passing', async () => {
    const state = makeState();
    addFriends(state, 'A', 'F');
    state.entries.push(entry('A'), entry('F', 50, WEEK, YESTERDAY), entry('F', 50, WEEK, YESTERDAY)); // A: 1, F: 2
    const { svc, notified } = makeDeps(state);
    await svc.afterEntry('A', WEEK, NOW);
    assert.equal(notified.length, 0);
  });

  it('ignores an entry backfilled into a different week', async () => {
    const state = makeState();
    addFriends(state, 'A', 'F');
    state.entries.push(entry('A'));
    const { svc, notified } = makeDeps(state);
    await svc.afterEntry('A', '1999-W01', NOW);
    assert.equal(notified.length, 0);
  });

  it('skips blocked friends in either direction', async () => {
    for (const block of [
      { blockerId: 'A', blockedId: 'F' },
      { blockerId: 'F', blockedId: 'A' },
    ]) {
      const state = makeState();
      addFriends(state, 'A', 'F');
      state.blocks.push(block);
      state.entries.push(entry('A'), entry('A'), entry('F', 50, WEEK, YESTERDAY));
      const { svc, notified } = makeDeps(state);
      await svc.afterEntry('A', WEEK, NOW);
      assert.equal(notified.length, 0);
    }
  });

  it('skips paused, rolled-out-off, already-trained and goal-reached friends', async () => {
    const cases: Array<{
      name: string;
      setup: (state: ReturnType<typeof makeState>) => void;
      disabledFor?: string[];
    }> = [
      {
        name: 'paused',
        // A: 1, F: 0 — would pull ahead without the skip.
        setup: (s) => {
          s.users.set('F', { socialPaused: true });
          s.entries.push(entry('A'));
        },
      },
      {
        name: 'not rolled out',
        setup: (s) => s.entries.push(entry('A')),
        disabledFor: ['F'],
      },
      {
        name: 'trained today',
        // F trained today (f=1), A passes 1→2 — would pull ahead without the skip.
        setup: (s) => s.entries.push(entry('A'), entry('A'), entry('F')),
      },
      {
        name: 'goal reached',
        setup: (s) => {
          s.scores.push({ userId: 'F', weekKey: WEEK, goalReached: true });
          s.entries.push(entry('A'));
        },
      },
    ];
    for (const c of cases) {
      const state = makeState();
      addFriends(state, 'A', 'F');
      c.setup(state);
      const { svc, notified } = makeDeps(state, c.disabledFor);
      await svc.afterEntry('A', WEEK, NOW);
      assert.equal(notified.length, 0, c.name);
    }
  });

  it('does not count zero-point entries toward the week', async () => {
    const state = makeState();
    addFriends(state, 'A', 'F');
    state.entries.push(entry('A'), entry('A', 0)); // A: 1 workout, F: 0
    const { svc, notified } = makeDeps(state);
    await svc.afterEntry('A', WEEK, NOW);
    // after=1, f=0 → pulled ahead (first workout of the week passes nobody's
    // count >0? before=0 <= 0 and after=1 > 0) — this IS a nudge by the rules.
    assert.equal(notified.length, 1);
  });

  it('caps the pair at two nudges per week', async () => {
    const state = makeState();
    addFriends(state, 'A', 'F');
    state.entries.push(entry('A'), entry('A'), entry('F', 50, WEEK, YESTERDAY));
    const week = weekBounds(WEEK);
    state.notifications.push(
      {
        userId: 'F',
        kind: NotificationKind.FRIEND_PULLED_AHEAD,
        actorId: 'A',
        createdAt: new Date(week.start.getTime() + 1000),
      },
      {
        userId: 'F',
        kind: NotificationKind.FRIEND_PULLED_AHEAD,
        actorId: 'A',
        createdAt: new Date(week.start.getTime() + 2000),
      },
    );
    const { svc, notified } = makeDeps(state);
    await svc.afterEntry('A', WEEK, NOW);
    assert.equal(notified.length, 0);
  });

  it('a nudge from a different actor does not use up the pair budget', async () => {
    const state = makeState();
    addFriends(state, 'A', 'F');
    state.entries.push(entry('A'), entry('A'), entry('F', 50, WEEK, YESTERDAY));
    const yesterday = new Date(berlinMidnight(TODAY).getTime() - 60_000);
    // Two nudges by another actor, yesterday — neither the pair cap nor the
    // per-day cap applies.
    state.notifications.push(
      {
        userId: 'F',
        kind: NotificationKind.FRIEND_PULLED_AHEAD,
        actorId: 'X',
        createdAt: yesterday,
      },
      {
        userId: 'F',
        kind: NotificationKind.FRIEND_PULLED_AHEAD,
        actorId: 'X',
        createdAt: yesterday,
      },
    );
    const { svc, notified } = makeDeps(state);
    await svc.afterEntry('A', WEEK, NOW);
    assert.equal(notified.length, 1);
  });
});
