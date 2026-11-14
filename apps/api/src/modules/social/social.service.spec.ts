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
import type { NotificationService } from '../notifications/notification.service';
import type { PrismaService } from '../database/prisma.service';
import type { StorageService } from '../storage/storage.service';
import { SocialService } from './social.service';

const sha256Hex = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex');
const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

interface TestUser {
  id: string;
  handle: string | null;
  name: string | null;
  emailLookupHash: string | null;
  discoverableByEmail: boolean;
  socialPaused: boolean;
  avatarKey: string | null;
  avatarUpdatedAt: Date | null;
  handleChangedAt: Date | null;
}

function makeUser(partial: Partial<TestUser> & { id: string }): TestUser {
  return {
    handle: null,
    name: 'Test User',
    emailLookupHash: null,
    discoverableByEmail: true,
    socialPaused: false,
    avatarKey: null,
    avatarUpdatedAt: null,
    handleChangedAt: null,
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

  const prisma = {
    users,
    friendships,
    blocks,
    invites,
    reports,
    duels,
    user: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        if (typeof where.id === 'string') return users.get(where.id) ?? null;
        if (typeof where.handle === 'string') {
          return [...users.values()].find((u) => u.handle === where.handle) ?? null;
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
          handle?: { not?: null; startsWith?: string };
          discoverableByEmail?: boolean;
          emailLookupHash?: { in?: string[] };
        };
      }) => {
        return [...users.values()].filter((u) => {
          if (where.id?.not === u.id || where.id?.notIn?.includes(u.id)) return false;
          if (where.handle?.not === null && u.handle === null) return false;
          if (where.handle?.startsWith && !u.handle?.startsWith(where.handle.startsWith))
            return false;
          if (where.discoverableByEmail === true && !u.discoverableByEmail) return false;
          if (
            where.emailLookupHash?.in &&
            !(u.emailLookupHash !== null && where.emailLookupHash.in.includes(u.emailLookupHash))
          )
            return false;
          return true;
        });
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const u = users.get(where.id);
        if (!u) throw new NotFoundException();
        if (
          typeof data.handle === 'string' &&
          [...users.values()].some((x) => x.handle === data.handle && x.id !== u.id)
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
        for (const key of blocks) {
          const [blockerId, blockedId] = key.split('|') as [string, string];
          if (where.blockerId && blockerId !== where.blockerId) continue;
          out.push({ blockerId, blockedId, createdAt: new Date() });
        }
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

describe('SocialService handle update', () => {
  it('first handle is exempt from the cooldown; the second change honours it', async () => {
    const prisma = makePrisma({ users: [makeUser({ id: 'me' })] });
    const svc = makeService(prisma);

    const first = await svc.updateMe('me', { handle: 'Lukas' });
    assert.equal(first.handle, 'lukas');
    assert.ok(first.handleChangeAvailableAt);

    await assert.rejects(svc.updateMe('me', { handle: 'other' }), ForbiddenException);
    // Same handle again is a no-op, not an error.
    assert.equal((await svc.updateMe('me', { handle: 'lukas' })).handle, 'lukas');
  });

  it('rejects taken, invalid and reserved handles', async () => {
    const prisma = makePrisma({
      users: [makeUser({ id: 'me' }), makeUser({ id: 'other', handle: 'taken' })],
    });
    const svc = makeService(prisma);
    await assert.rejects(svc.updateMe('me', { handle: 'taken' }), ConflictException);
    await assert.rejects(svc.updateMe('me', { handle: 'ab' }), BadRequestException);
    await assert.rejects(svc.updateMe('me', { handle: 'admin' }), BadRequestException);
  });
});

describe('SocialService friend requests', () => {
  it('a reverse pending request auto-accepts instead of creating a second row', async () => {
    const a = makeUser({ id: 'a', handle: 'aaa' });
    const b = makeUser({ id: 'b', handle: 'bbb' });
    const prisma = makePrisma({ users: [a, b] });
    const svc = makeService(prisma);

    assert.deepEqual(await svc.sendRequest('a', 'b'), { relation: 'OUTGOING' });
    // b "requests" a back — implicit accept.
    assert.deepEqual(await svc.sendRequest('b', 'a'), { relation: 'FRIEND' });
    const f = prisma.friendships.get(pair('a', 'b'));
    assert.equal(f?.status, 'ACCEPTED');
    assert.equal(prisma.friendships.size, 1);
  });

  it('users without a handle and blocked pairs are invisible (404)', async () => {
    const prisma = makePrisma({
      users: [
        makeUser({ id: 'me' }),
        makeUser({ id: 'nohandle' }),
        makeUser({ id: 'x', handle: 'xxx' }),
      ],
    });
    prisma.blocks.add('me|x');
    const svc = makeService(prisma);
    await assert.rejects(svc.sendRequest('me', 'nohandle'), NotFoundException);
    await assert.rejects(svc.sendRequest('me', 'x'), NotFoundException);
    await assert.rejects(svc.getUserByHandle('me', 'xxx'), NotFoundException);
  });
});

describe('SocialService invites', () => {
  it('stores only the SHA-256 of the token and accepts once', async () => {
    const prisma = makePrisma({
      users: [makeUser({ id: 'inviter', handle: 'inviter' }), makeUser({ id: 'me', handle: 'me' })],
    });
    const svc = makeService(prisma);
    const { url } = await svc.createInvite('inviter');
    const token = url.split('/invite/')[1]!;
    assert.equal(prisma.invites.has(sha256Hex(token)), true);
    assert.equal(prisma.invites.has(token), false);

    const preview = await svc.previewInvite('me', token);
    assert.equal(preview.handle, 'inviter');
    assert.deepEqual(await svc.acceptInvite('me', token), { relation: 'FRIEND' });
    assert.equal(prisma.friendships.get(pair('me', 'inviter'))?.status, 'ACCEPTED');
  });

  it('rejects self-accept and expired/used-up/unknown tokens', async () => {
    const prisma = makePrisma({ users: [makeUser({ id: 'me', handle: 'me' })] });
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
  it('returns only opted-in users with a handle, excluding self and blocked', async () => {
    const h = (s: string) => sha256Hex(s);
    const users = [
      makeUser({ id: 'me', handle: 'me' }),
      makeUser({ id: 'ok', handle: 'ok', emailLookupHash: h('ok@x.de') }),
      makeUser({
        id: 'optout',
        handle: 'optout',
        emailLookupHash: h('out@x.de'),
        discoverableByEmail: false,
      }),
      makeUser({ id: 'nohandle', emailLookupHash: h('nh@x.de') }),
      makeUser({ id: 'blockee', handle: 'blockee', emailLookupHash: h('b@x.de') }),
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
    const prisma = makePrisma({ users: [makeUser({ id: 'me', handle: 'me' })] });
    const svc = makeService(prisma);
    const submitted = [sha256Hex('a@x.de'), sha256Hex('b@x.de')];
    await svc.matchContacts('me', submitted);
    const stored = [...prisma.users.values()].flatMap((u) => [u.emailLookupHash]);
    for (const hash of submitted) assert.equal(stored.includes(hash), false);
  });
});

describe('SocialService reports', () => {
  it('snapshots handle, name and a copied avatar object', async () => {
    const prisma = makePrisma({
      users: [
        makeUser({ id: 'me', handle: 'me' }),
        makeUser({ id: 'bad', handle: 'bad', name: 'Bad Name', avatarKey: 'avatars/bad/1.jpg' }),
      ],
    });
    const objects = new Map([['avatars/bad/1.jpg', Buffer.from('jpeg-bytes')]]);
    const svc = makeService(prisma, objects);
    await svc.createReport('me', 'bad', ReportReason.INAPPROPRIATE_NAME, 'offensive');
    const report = prisma.reports[0]!;
    assert.equal(report.handleSnapshot, 'bad');
    assert.equal(report.nameSnapshot, 'Bad Name');
    assert.equal(report.avatarKeySnapshot, 'reports/rep-1.jpg');
    // The evidence copy survives the live object being deleted.
    assert.deepEqual(objects.get('reports/rep-1.jpg'), Buffer.from('jpeg-bytes'));
  });

  it('leaves the snapshot null when the copy fails', async () => {
    const prisma = makePrisma({
      users: [
        makeUser({ id: 'me', handle: 'me' }),
        makeUser({ id: 'bad', handle: 'bad', avatarKey: 'avatars/bad/gone.jpg' }),
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
      users: [makeUser({ id: 'me', handle: 'me' }), makeUser({ id: 'x', handle: 'x' })],
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
      users: [makeUser({ id: 'me', handle: 'me' }), makeUser({ id: 'x', handle: 'x' })],
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
      users: [makeUser({ id: 'me', handle: 'me' }), makeUser({ id: 'x', handle: 'x' })],
    });
    const svc = makeService(prisma);
    await svc.sendRequest('me', 'x');
    await svc.acceptRequest('x', 'me');
    seedDuel(prisma, 'me', 'x');

    await svc.createBlock('me', 'x');
    assert.equal(prisma.duels[0]!.status, 'CANCELLED');
  });
});
