import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ReportReason } from '@luki-fitti/common/enums';
import { berlinWeekKey } from '@luki-fitti/common/utils';
import type { NotificationService } from '../notifications/notification.service';
import type { PrismaService } from '../database/prisma.service';
import type { StorageService } from '../storage/storage.service';
import { SocialService } from './social.service';

const sha256Hex = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex');
const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

interface TestUser {
  id: string;
  username: string | null;
  name: string | null;
  emailLookupHash: string | null;
  discoverableByEmail: boolean;
  socialPaused: boolean;
  avatarKey: string | null;
  avatarUpdatedAt: Date | null;
  usernameChangedAt: Date | null;
}

function makeUser(partial: Partial<TestUser> & { id: string }): TestUser {
  return {
    username: null,
    name: 'Test User',
    emailLookupHash: null,
    discoverableByEmail: true,
    socialPaused: false,
    avatarKey: null,
    avatarUpdatedAt: null,
    usernameChangedAt: null,
    ...partial,
  };
}

/** In-memory fake of the Prisma surface SocialService uses. */
function makePrisma(seed: { users?: TestUser[] } = {}) {
  const users = new Map<string, TestUser>((seed.users ?? []).map((u) => [u.id, u]));
  const friendships = new Map<
    string,
    { userAId: string; userBId: string; requestedById: string; status: string }
  >();
  const blocks = new Set<string>();
  const invites = new Map<
    string,
    {
      id: string;
      tokenHash: string;
      createdById: string;
      expiresAt: Date;
      maxUses: number;
      uses: number;
    }
  >();
  const reports: Record<string, unknown>[] = [];
  const duels: Array<{
    id: string;
    challengerId: string;
    opponentId: string;
    status: string;
    respondedAt: Date | null;
  }> = [];
  const entries: Array<{ userId: string; weekKey: string; dayKey: string; points: number }> = [];

  const prisma = {
    users,
    friendships,
    blocks,
    invites,
    reports,
    duels,
    entries,
    user: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        if (typeof where.id === 'string') return users.get(where.id) ?? null;
        if (typeof where.username === 'string') {
          return [...users.values()].find((u) => u.username === where.username) ?? null;
        }
        return null;
      },
      findUniqueOrThrow: async ({ where }: { where: Record<string, unknown> }) => {
        const u = await prisma.user.findUnique({ where });
        if (!u) throw new NotFoundException();
        return u;
      },
      findMany: async ({
        where,
      }: {
        where: {
          id?: { not?: string; notIn?: string[] };
          username?: { not?: null; startsWith?: string };
          discoverableByEmail?: boolean;
          emailLookupHash?: { in?: string[] };
        };
      }) => {
        return [...users.values()].filter((u) => {
          if (where.id?.not === u.id || where.id?.notIn?.includes(u.id)) return false;
          if (where.username?.not === null && u.username === null) return false;
          if (where.username?.startsWith && !u.username?.startsWith(where.username.startsWith))
            return false;
          if (where.discoverableByEmail === true && !u.discoverableByEmail) return false;
          if (
            where.emailLookupHash?.in &&
            !(u.emailLookupHash !== null && where.emailLookupHash.in.includes(u.emailLookupHash))
          )
            return false;
          if ((where as { socialPaused?: boolean }).socialPaused === true && !u.socialPaused)
            return false;
          return true;
        });
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const u = users.get(where.id);
        if (!u) throw new NotFoundException();
        if (
          typeof data.username === 'string' &&
          [...users.values()].some((x) => x.username === data.username && x.id !== u.id)
        ) {
          const err = new Error('unique') as Error & { code: string };
          err.code = 'P2002';
          throw err;
        }
        Object.assign(u, data);
        return u;
      },
    },
    friendship: {
      findUnique: async ({
        where,
      }: {
        where: { userAId_userBId: { userAId: string; userBId: string } };
      }) =>
        friendships.get(pair(where.userAId_userBId.userAId, where.userAId_userBId.userBId)) ?? null,
      create: async ({
        data,
      }: {
        data: { userAId: string; userBId: string; requestedById: string; status: string };
      }) => {
        friendships.set(pair(data.userAId, data.userBId), { ...data });
      },
      update: async ({
        where,
        data,
      }: {
        where: { userAId_userBId: { userAId: string; userBId: string } };
        data: Record<string, unknown>;
      }) => {
        const f = friendships.get(
          pair(where.userAId_userBId.userAId, where.userAId_userBId.userBId),
        );
        if (!f) throw new NotFoundException();
        Object.assign(f, data);
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { userAId_userBId: { userAId: string; userBId: string } };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const key = pair(where.userAId_userBId.userAId, where.userAId_userBId.userBId);
        const f = friendships.get(key);
        if (f) Object.assign(f, update);
        else friendships.set(key, create as never);
      },
      delete: async ({
        where,
      }: {
        where: { userAId_userBId: { userAId: string; userBId: string } };
      }) => {
        friendships.delete(pair(where.userAId_userBId.userAId, where.userAId_userBId.userBId));
      },
      deleteMany: async ({ where }: { where: { userAId: string; userBId: string } }) => {
        friendships.delete(pair(where.userAId, where.userBId));
      },
      findMany: async () => [],
      count: async ({ where }: { where: { status: string } }) =>
        [...friendships.values()].filter((f) => f.status === where.status).length,
    },
    friendInvite: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const inv = invites.get(where.tokenHash);
        return inv ? { ...inv, createdBy: users.get(inv.createdById)! } : null;
      },
      create: async ({
        data,
      }: {
        data: { tokenHash: string; createdById: string; expiresAt: Date };
      }) => {
        invites.set(data.tokenHash, { id: `inv-${invites.size}`, maxUses: 20, uses: 0, ...data });
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; uses: { lt: number } };
        data: { uses: { increment: number } };
      }) => {
        const inv = [...invites.values()].find((i) => i.id === where.id);
        if (!inv || inv.uses >= where.uses.lt) return { count: 0 };
        inv.uses += data.uses.increment;
        return { count: 1 };
      },
    },
    userBlock: {
      findFirst: async ({
        where,
      }: {
        where: { OR: { blockerId: string; blockedId: string }[] };
      }) => {
        for (const c of where.OR) {
          if (blocks.has(`${c.blockerId}|${c.blockedId}`)) return { id: 'b' };
        }
        return null;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const out: { blockerId: string; blockedId: string; createdAt: Date }[] = [];
        const match = (cond: { blockerId?: unknown; blockedId?: unknown }) => {
          const fits = (val: string, c: unknown) =>
            c === undefined || c === val || ((c as { in?: string[] }).in?.includes(val) ?? false);
          for (const key of blocks) {
            const [blockerId, blockedId] = key.split('|') as [string, string];
            if (fits(blockerId, cond.blockerId) && fits(blockedId, cond.blockedId)) {
              out.push({ blockerId, blockedId, createdAt: new Date() });
            }
          }
        };
        if (Array.isArray(where.OR)) where.OR.forEach(match);
        else match(where as { blockerId?: unknown; blockedId?: unknown });
        return out;
      },
      upsert: async ({ create }: { create: { blockerId: string; blockedId: string } }) => {
        blocks.add(`${create.blockerId}|${create.blockedId}`);
      },
      deleteMany: async ({ where }: { where: { blockerId: string; blockedId: string } }) => {
        blocks.delete(`${where.blockerId}|${where.blockedId}`);
      },
    },
    userReport: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `rep-${reports.length + 1}`, ...data };
        reports.push(row);
        return { id: row.id };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = reports.find((r) => r.id === where.id);
        if (!row) throw new NotFoundException();
        Object.assign(row, data);
        return row;
      },
    },
    effortPointEntry: {
      groupBy: async ({
        where,
      }: {
        by: string[];
        where: { weekKey: string; points: { gt: number }; userId: { in: string[] } };
      }) => {
        const counts = new Map<string, number>();
        for (const e of prisma.entries) {
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
    },
    duel: {
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          status: { in: string[] };
          OR: { challengerId: string; opponentId: string }[];
        };
        data: Record<string, unknown>;
      }) => {
        let count = 0;
        for (const d of duels) {
          if (!where.status.in.includes(d.status)) continue;
          const hit = where.OR.some(
            (c) => c.challengerId === d.challengerId && c.opponentId === d.opponentId,
          );
          if (!hit) continue;
          Object.assign(d, data);
          count += 1;
        }
        return { count };
      },
    },
    $transaction: async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return (arg as (tx: unknown) => Promise<unknown>)(prisma);
    },
  };
  return prisma;
}

function makeService(
  prisma: ReturnType<typeof makePrisma>,
  objects: Map<string, Buffer> = new Map(),
) {
  const notifications = { notify: async () => undefined } as unknown as NotificationService;
  const storage = {
    objects,
    get: async (key: string) => {
      const body = objects.get(key);
      if (!body) throw new Error(`no such object ${key}`);
      return { body, contentType: 'image/jpeg' };
    },
    put: async (key: string, body: Buffer) => {
      objects.set(key, body);
    },
    deleteMany: async (keys: string[]) => {
      for (const k of keys) objects.delete(k);
    },
  } as unknown as StorageService;
  return new SocialService(prisma as unknown as PrismaService, storage, notifications, {
    incrementCounter: async () => 1,
  });
}

describe('SocialService username update', () => {
  it('first username is exempt from the cooldown; the second change honours it', async () => {
    const prisma = makePrisma({ users: [makeUser({ id: 'me' })] });
    const svc = makeService(prisma);

    const first = await svc.updateMe('me', { username: 'Lukas' });
    assert.equal(first.username, 'lukas');
    assert.ok(first.usernameChangeAvailableAt);

    await assert.rejects(svc.updateMe('me', { username: 'other' }), ForbiddenException);
    // Same username again is a no-op, not an error.
    assert.equal((await svc.updateMe('me', { username: 'lukas' })).username, 'lukas');
  });

  it('rejects taken, invalid and reserved usernames', async () => {
    const prisma = makePrisma({
      users: [makeUser({ id: 'me' }), makeUser({ id: 'other', username: 'taken' })],
    });
    const svc = makeService(prisma);
    await assert.rejects(svc.updateMe('me', { username: 'taken' }), ConflictException);
    await assert.rejects(svc.updateMe('me', { username: 'ab' }), BadRequestException);
    await assert.rejects(svc.updateMe('me', { username: 'admin' }), BadRequestException);
  });
});

describe('SocialService friend requests', () => {
  it('a reverse pending request auto-accepts instead of creating a second row', async () => {
    const a = makeUser({ id: 'a', username: 'aaa' });
    const b = makeUser({ id: 'b', username: 'bbb' });
    const prisma = makePrisma({ users: [a, b] });
    const svc = makeService(prisma);

    assert.deepEqual(await svc.sendRequest('a', 'b'), { relation: 'OUTGOING' });
    // b "requests" a back — implicit accept.
    assert.deepEqual(await svc.sendRequest('b', 'a'), { relation: 'FRIEND' });
    const f = prisma.friendships.get(pair('a', 'b'));
    assert.equal(f?.status, 'ACCEPTED');
    assert.equal(prisma.friendships.size, 1);
  });

  it('users without a username and blocked pairs are invisible (404)', async () => {
    const prisma = makePrisma({
      users: [
        makeUser({ id: 'me' }),
        makeUser({ id: 'nousername' }),
        makeUser({ id: 'x', username: 'xxx' }),
      ],
    });
    prisma.blocks.add('me|x');
    const svc = makeService(prisma);
    await assert.rejects(svc.sendRequest('me', 'nousername'), NotFoundException);
    await assert.rejects(svc.sendRequest('me', 'x'), NotFoundException);
    await assert.rejects(svc.getUserByUsername('me', 'xxx'), NotFoundException);
  });
});

describe('SocialService invites', () => {
  it('stores only the SHA-256 of the token and accepts once', async () => {
    const prisma = makePrisma({
      users: [
        makeUser({ id: 'inviter', username: 'inviter' }),
        makeUser({ id: 'me', username: 'me' }),
      ],
    });
    const svc = makeService(prisma);
    const { url } = await svc.createInvite('inviter');
    const token = url.split('/invite/')[1]!;
    assert.equal(prisma.invites.has(sha256Hex(token)), true);
    assert.equal(prisma.invites.has(token), false);

    const preview = await svc.previewInvite('me', token);
    assert.equal(preview.username, 'inviter');
    assert.deepEqual(await svc.acceptInvite('me', token), { relation: 'FRIEND' });
    assert.equal(prisma.friendships.get(pair('me', 'inviter'))?.status, 'ACCEPTED');
  });

  it('rejects self-accept and expired/used-up/unknown tokens', async () => {
    const prisma = makePrisma({ users: [makeUser({ id: 'me', username: 'me' })] });
    const svc = makeService(prisma);
    const { url } = await svc.createInvite('me');
    const token = url.split('/invite/')[1]!;

    await assert.rejects(svc.acceptInvite('me', token), BadRequestException);
    await assert.rejects(svc.previewInvite('me', 'bogus-token'), NotFoundException);

    const inv = prisma.invites.get(sha256Hex(token))!;
    inv.expiresAt = new Date(Date.now() - 1000);
    await assert.rejects(svc.previewInvite('me', token), NotFoundException);

    inv.expiresAt = new Date(Date.now() + 100000);
    inv.uses = inv.maxUses;
    await assert.rejects(svc.acceptInvite('me', token), NotFoundException);
  });
});

describe('SocialService contact matching', () => {
  it('returns only opted-in users with a username, excluding self and blocked', async () => {
    const h = (s: string) => sha256Hex(s);
    const users = [
      makeUser({ id: 'me', username: 'me' }),
      makeUser({ id: 'ok', username: 'ok', emailLookupHash: h('ok@x.de') }),
      makeUser({
        id: 'optout',
        username: 'optout',
        emailLookupHash: h('out@x.de'),
        discoverableByEmail: false,
      }),
      makeUser({ id: 'nousername', emailLookupHash: h('nh@x.de') }),
      makeUser({ id: 'blockee', username: 'blockee', emailLookupHash: h('b@x.de') }),
    ];
    const prisma = makePrisma({ users });
    prisma.blocks.add('blockee|me'); // blocked in either direction
    const svc = makeService(prisma);

    const results = await svc.matchContacts('me', [
      h('ok@x.de'),
      h('out@x.de'),
      h('nh@x.de'),
      h('b@x.de'),
      h('me@x.de'),
    ]);
    assert.deepEqual(
      results.map((r) => r.userId),
      ['ok'],
    );
  });

  it('never persists the submitted hashes', async () => {
    const prisma = makePrisma({ users: [makeUser({ id: 'me', username: 'me' })] });
    const svc = makeService(prisma);
    const submitted = [sha256Hex('a@x.de'), sha256Hex('b@x.de')];
    await svc.matchContacts('me', submitted);
    const stored = [...prisma.users.values()].flatMap((u) => [u.emailLookupHash]);
    for (const hash of submitted) assert.equal(stored.includes(hash), false);
  });
});

describe('SocialService reports', () => {
  it('snapshots username, name and a copied avatar object', async () => {
    const prisma = makePrisma({
      users: [
        makeUser({ id: 'me', username: 'me' }),
        makeUser({ id: 'bad', username: 'bad', name: 'Bad Name', avatarKey: 'avatars/bad/1.jpg' }),
      ],
    });
    const objects = new Map([['avatars/bad/1.jpg', Buffer.from('jpeg-bytes')]]);
    const svc = makeService(prisma, objects);
    await svc.createReport('me', 'bad', ReportReason.INAPPROPRIATE_NAME, 'offensive');
    const report = prisma.reports[0]!;
    assert.equal(report.usernameSnapshot, 'bad');
    assert.equal(report.nameSnapshot, 'Bad Name');
    assert.equal(report.avatarKeySnapshot, 'reports/rep-1.jpg');
    // The evidence copy survives the live object being deleted.
    assert.deepEqual(objects.get('reports/rep-1.jpg'), Buffer.from('jpeg-bytes'));
  });

  it('leaves the snapshot null when the copy fails', async () => {
    const prisma = makePrisma({
      users: [
        makeUser({ id: 'me', username: 'me' }),
        makeUser({ id: 'bad', username: 'bad', avatarKey: 'avatars/bad/gone.jpg' }),
      ],
    });
    const svc = makeService(prisma); // empty storage: get() throws
    await svc.createReport('me', 'bad', ReportReason.INAPPROPRIATE_NAME);
    assert.equal(prisma.reports[0]!.avatarKeySnapshot, undefined);
  });
});

describe('SocialService blocks', () => {
  it('blocking removes the friendship in the same call', async () => {
    const prisma = makePrisma({
      users: [makeUser({ id: 'me', username: 'me' }), makeUser({ id: 'x', username: 'x' })],
    });
    const svc = makeService(prisma);
    await svc.sendRequest('me', 'x');
    await svc.acceptRequest('x', 'me');
    assert.equal(prisma.friendships.size, 1);

    await svc.createBlock('me', 'x');
    assert.equal(prisma.friendships.size, 0);
    assert.equal(await svc.relation('me', 'x'), 'BLOCKED');
    // unblock restores visibility
    await svc.deleteBlock('me', 'x');
    assert.equal(await svc.relation('me', 'x'), 'NONE');
  });
});

describe('SocialService duel cancellation', () => {
  const seedDuel = (
    prisma: ReturnType<typeof makePrisma>,
    challengerId: string,
    opponentId: string,
    status = 'ACTIVE',
  ) => {
    prisma.duels.push({
      id: `duel-${prisma.duels.length}`,
      challengerId,
      opponentId,
      status,
      respondedAt: null,
    });
  };

  it('unfriending cancels pending and active duels in the same call', async () => {
    const prisma = makePrisma({
      users: [makeUser({ id: 'me', username: 'me' }), makeUser({ id: 'x', username: 'x' })],
    });
    const svc = makeService(prisma);
    await svc.sendRequest('me', 'x');
    await svc.acceptRequest('x', 'me');
    seedDuel(prisma, 'me', 'x');
    seedDuel(prisma, 'x', 'me', 'PENDING');
    seedDuel(prisma, 'me', 'x', 'COMPLETED');

    await svc.removeFriend('me', 'x');
    assert.equal(prisma.duels[0]!.status, 'CANCELLED');
    assert.equal(prisma.duels[1]!.status, 'CANCELLED');
    assert.equal(prisma.duels[2]!.status, 'COMPLETED', 'finished duels keep their result');
  });

  it('blocking cancels open duels too', async () => {
    const prisma = makePrisma({
      users: [makeUser({ id: 'me', username: 'me' }), makeUser({ id: 'x', username: 'x' })],
    });
    const svc = makeService(prisma);
    await svc.sendRequest('me', 'x');
    await svc.acceptRequest('x', 'me');
    seedDuel(prisma, 'me', 'x');

    await svc.createBlock('me', 'x');
    assert.equal(prisma.duels[0]!.status, 'CANCELLED');
  });
});

// ── Hub summary ──────────────────────────────────────────────────────────────

const card = (id: string, username: string) => ({
  userId: id,
  username,
  avatarUrl: null,
});

const makeSummaryService = (
  prisma: ReturnType<typeof makePrisma>,
  opts: {
    lists?: { friends: ReturnType<typeof card>[]; incoming: ReturnType<typeof card>[] };
    settings?: Partial<{
      leaguesEnabled: boolean;
      duelsEnabled: boolean;
      streaksEnabled: boolean;
      raidsEnabled: boolean;
    }>;
    duels?: unknown;
    streaks?: unknown;
    squads?: unknown;
    raids?: unknown;
    league?: unknown;
    week?: unknown;
    eligible?: boolean;
  } = {},
) => {
  const svc = makeService(prisma);
  const appSettings = {
    get: async () => ({
      leaguesEnabled: true,
      duelsEnabled: true,
      streaksEnabled: true,
      raidsEnabled: true,
      ...opts.settings,
    }),
  };
  const points = { getWeek: async () => opts.week ?? null };
  const duels = {
    list: async () => ({ active: [], incoming: [], outgoing: [], ...(opts.duels ?? {}) }),
  };
  const streaks = {
    list: async () => ({ active: [], incoming: [], outgoing: [], ...(opts.streaks ?? {}) }),
  };
  const squads = { list: async () => ({ squads: [], invites: [], ...(opts.squads ?? {}) }) };
  const raids = {
    current: async () => ({ community: null, squads: [], ...(opts.raids ?? {}) }),
  };
  const leagues = { current: async () => opts.league ?? null };
  const access = { isEligibleForLeagues: async () => opts.eligible ?? true };
  const svc2 = new SocialService(
    prisma as unknown as PrismaService,
    (svc as unknown as { storage: StorageService }).storage,
    (svc as unknown as { notifications: NotificationService }).notifications,
    {},
    appSettings as never,
    points as never,
    duels as never,
    streaks as never,
    squads as never,
    raids as never,
    leagues as never,
    access as never,
  );
  // listFriends is covered by its own specs — the summary consumes its DTO.
  const lists = {
    friends: opts.lists?.friends ?? [],
    incoming: opts.lists?.incoming ?? [],
    outgoing: [],
  };
  svc2.listFriends = async () => lists;
  return svc2;
};

const weekEntry = (userId: string, points = 50) => ({
  userId,
  weekKey: berlinWeekKey(new Date()),
  dayKey: 'today',
  points,
});

describe('SocialService.summary', () => {
  it('badge counts friend requests plus every invite kind', async () => {
    const prisma = makePrisma();
    const svc = makeSummaryService(prisma, {
      lists: { friends: [], incoming: [card('i1', 'i1'), card('i2', 'i2')] },
      duels: { incoming: [{ id: 'd1', opponent: card('x', 'x'), createdAt: 'now' }] },
      streaks: { incoming: [{ id: 's1', friend: card('y', 'y') }] },
      squads: { invites: [{ id: 'q1', squadName: 'Crew', invitedBy: card('z', 'z') }] },
    });
    const res = await svc.summary('me');
    assert.equal(res.badge, 5);
    assert.equal(res.nextMove?.kind, 'FRIEND_REQUESTS');
    assert.equal(res.nextMove?.kind === 'FRIEND_REQUESTS' && res.nextMove.count, 2);
  });

  it('friendsWeek counts >0 entries only, sorts desc then username, drops paused and blocked', async () => {
    const prisma = makePrisma({
      users: [
        makeUser({ id: 'me', username: 'me' }),
        makeUser({ id: 'f1', username: 'zoe' }),
        makeUser({ id: 'f2', username: 'amy' }),
        makeUser({ id: 'f3', username: 'paused', socialPaused: true }),
        makeUser({ id: 'f4', username: 'blocked' }),
      ],
    });
    prisma.blocks.add('f4|me');
    prisma.entries.push(
      weekEntry('me'),
      weekEntry('f1'),
      weekEntry('f1'),
      weekEntry('f2'),
      weekEntry('f2'),
      weekEntry('f2', 0), // zero-point entry never counts
      weekEntry('f3'),
    );
    const svc = makeSummaryService(prisma, {
      lists: {
        friends: [
          card('f1', 'zoe'),
          card('f2', 'amy'),
          card('f3', 'paused'),
          card('f4', 'blocked'),
        ],
        incoming: [],
      },
      week: { goal: { done: 2, target: 4 }, points: 300 },
    });
    const res = await svc.summary('me');
    assert.deepEqual(
      res.friendsWeek.map((f) => [f.card.username, f.workouts]),
      [
        ['amy', 2],
        ['zoe', 2],
      ],
    );
    // week.workouts is the ledger count (matches friendsWeek and FRIEND_AHEAD's "you"),
    // not the weekly-goal session counter.
    assert.deepEqual(res.week, { workouts: 1, goal: 4, points: 300 });
    // Me at 1 ledger workout → the top friend (amy, tie-break by username) wins.
    assert.deepEqual(res.nextMove, {
      kind: 'FRIEND_AHEAD',
      actor: card('f2', 'amy'),
      them: 2,
      you: 1,
    });
  });

  it('next move picks friend ahead then duel behind', async () => {
    const prisma = makePrisma({ users: [makeUser({ id: 'me', username: 'me' })] });
    prisma.entries.push(weekEntry('f1'), weekEntry('f1'), weekEntry('f1'));
    const svc = makeSummaryService(prisma, {
      lists: { friends: [card('f1', 'f1')], incoming: [] },
      week: { goal: { done: 1, target: 4 }, points: 10 },
      duels: {
        active: [{ id: 'd1', opponent: card('o', 'o'), you: 1, them: 4, daysLeft: 2 }],
      },
    });
    const res = await svc.summary('me');
    assert.deepEqual(res.nextMove, {
      kind: 'FRIEND_AHEAD',
      actor: card('f1', 'f1'),
      them: 3,
      you: 0, // "you" is the ledger count, not the week goal's done
    });
    // No friend ahead (me has 5) → duel behind surfaces.
    const prisma2 = makePrisma({ users: [makeUser({ id: 'me', username: 'me' })] });
    prisma2.entries.push(
      weekEntry('me'),
      weekEntry('me'),
      weekEntry('me'),
      weekEntry('me'),
      weekEntry('me'),
    );
    const svc2 = makeSummaryService(prisma2, {
      lists: { friends: [card('f1', 'f1')], incoming: [] },
      week: { goal: { done: 5, target: 4 }, points: 10 },
      duels: {
        active: [{ id: 'd1', opponent: card('o', 'o'), you: 1, them: 4, daysLeft: 2 }],
      },
    });
    const res2 = await svc2.summary('me');
    assert.equal(res2.nextMove?.kind, 'DUEL_BEHIND');
  });

  it('kill switches drop their parts: no week, no invites, no demotion/raid', async () => {
    const prisma = makePrisma();
    const svc = makeSummaryService(prisma, {
      settings: {
        leaguesEnabled: false,
        duelsEnabled: false,
        streaksEnabled: false,
        raidsEnabled: false,
      },
      lists: { friends: [], incoming: [] },
      duels: { incoming: [{ id: 'd1' }] },
      raids: { community: { status: 'ACTIVE', yourDamage: 0, bossSlug: 'mole' } },
      league: { arena: 'GOLD', cohort: { members: [{ isSelf: true, zone: 'DEMOTE' }] } },
      week: { goal: { done: 1, target: 4 }, points: 10 },
    });
    const res = await svc.summary('me');
    assert.equal(res.badge, 0);
    assert.equal(res.week, null);
    assert.equal(res.nextMove, null);
  });

  it('league demotion and untouched raid feed the picker', async () => {
    const prisma = makePrisma();
    const svc = makeSummaryService(prisma, {
      settings: { duelsEnabled: false, streaksEnabled: false },
      lists: { friends: [], incoming: [] },
      league: {
        arena: 'GOLD',
        cohort: { members: [{ isSelf: true, zone: 'DEMOTE' }] },
      },
      raids: { community: { status: 'ACTIVE', yourDamage: 0, bossSlug: 'mole' } },
    });
    const res = await svc.summary('me');
    assert.equal(res.nextMove?.kind, 'LEAGUE_DEMOTION');

    const svc2 = makeSummaryService(prisma, {
      settings: { duelsEnabled: false, streaksEnabled: false },
      lists: { friends: [], incoming: [] },
      raids: { community: { status: 'ACTIVE', yourDamage: 0, bossSlug: 'mole' } },
    });
    const res2 = await svc2.summary('me');
    assert.deepEqual(res2.nextMove, { kind: 'RAID_NO_DAMAGE', bossSlug: 'mole' });
  });
});
