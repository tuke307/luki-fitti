import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NotificationKind } from '@luki-fitti/common/enums';
import { PUSH_DAILY_CAP } from '@luki-fitti/common/notification-categories';
import type { PrismaService } from '../database/prisma.service';
import type { BullMQService } from '../bullmq/bullmq.service';
import type { SocialAccessService } from '../social/social-access.service';
import { NotificationService } from './notification.service';
import { quietHoursDelayMs } from './quiet-hours.util';

interface FakeOpts {
  socialPaused?: boolean;
  rollout?: boolean;
  prefs?: Record<string, unknown> | null;
  device?: { timeZone?: string; locale?: string } | null;
  /** pushDayKey counts already stored for the delivery day. */
  sentToday?: number;
  existing?: Record<string, unknown>[];
}

function makeDeps(opts: FakeOpts) {
  const rows: Record<string, unknown>[] = [...(opts.existing ?? [])];
  const jobs: { id: string; delayMs: number }[] = [];
  const prisma = {
    notification: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `n-${rows.length + 1}`, ...data };
        rows.push(row);
        return row;
      },
      count: async ({ where }: { where: Record<string, unknown> }) => {
        if ('readAt' in where) {
          return rows.filter((r) => r.readAt == null && r.userId === where.userId).length;
        }
        if ('pushDayKey' in where) {
          return rows.filter((r) => r.userId === where.userId && r.pushDayKey === where.pushDayKey)
            .length;
        }
        return 0;
      },
      findMany: async ({ where, take }: { where: Record<string, unknown>; take: number }) =>
        rows
          .filter((r) => r.userId === where.userId)
          .slice()
          .sort(
            (a, b) =>
              (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime() ||
              String(b.id).localeCompare(String(a.id)),
          )
          .slice(0, take)
          .map((r) => ({ actor: null, ...r })),
      findUnique: async () => null,
    },
    user: {
      findUnique: async () => ({ socialPaused: opts.socialPaused ?? false }),
    },
    userPreferences: {
      findUnique: async () =>
        opts.prefs === null ? null : { pushFriends: true, pushDisabledKinds: [], ...opts.prefs },
    },
    pushDevice: {
      findFirst: async () => opts.device ?? null,
    },
    userBlock: {
      findMany: async () => [],
    },
  };
  const bullmq = {
    addPushJob: async (id: string, delayMs = 0) => {
      jobs.push({ id, delayMs });
    },
  };
  const socialAccess = { isEnabledFor: async () => opts.rollout ?? true };
  const svc = new NotificationService(
    prisma as unknown as PrismaService,
    bullmq as unknown as BullMQService,
    socialAccess as unknown as SocialAccessService,
  );
  return { svc, rows, jobs };
}

describe('NotificationService.notify push gating', () => {
  it('always writes the inbox row and enqueues push when allowed', async () => {
    const { svc, rows, jobs } = makeDeps({});
    await svc.notify('u1', NotificationKind.FRIEND_REQUEST, 'actor1', { url: '/x' });
    assert.equal(rows.length, 1);
    assert.deepEqual(
      jobs.map((j) => j.id),
      ['n-1'],
    );
  });

  it('enqueues no push for a paused user but keeps the inbox row', async () => {
    const { svc, rows, jobs } = makeDeps({ socialPaused: true });
    await svc.notify('u1', NotificationKind.FRIEND_REQUEST, 'actor1', {});
    assert.equal(rows.length, 1);
    assert.deepEqual(jobs, []);
  });

  it('enqueues no push outside the rollout (beta gating) but keeps the inbox row', async () => {
    const { svc, rows, jobs } = makeDeps({ rollout: false });
    await svc.notify('u1', NotificationKind.FRIEND_ACCEPTED, 'actor1', {});
    assert.equal(rows.length, 1);
    assert.deepEqual(jobs, []);
  });

  it('respects the per-category push preference', async () => {
    const { svc, rows, jobs } = makeDeps({ prefs: { pushFriends: false } });
    await svc.notify('u1', NotificationKind.FRIEND_REQUEST, 'actor1', {});
    assert.equal(rows.length, 1);
    assert.deepEqual(jobs, []);
  });
});

describe('NotificationService.notify daily cap', () => {
  const counted = (rows: Record<string, unknown>[]) =>
    rows.filter((r) => typeof r.pushDayKey === 'string');

  it('stamps non-exempt pushes with the local delivery day', async () => {
    const { svc, rows, jobs } = makeDeps({ device: { timeZone: 'Europe/Berlin' } });
    await svc.notify('u1', NotificationKind.RAID_DEFEATED, null, {});
    assert.equal(jobs.length, 1);
    // The key is the local day the push lands — during quiet hours that is the
    // next morning, so the push counts against tomorrow's cap.
    const delayMs = quietHoursDelayMs(new Date(), 'Europe/Berlin');
    const expected = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(
      new Date(Date.now() + delayMs),
    );
    assert.equal(rows[0]!.pushDayKey, expected);
  });

  it('stops pushing after the cap but keeps inbox rows', async () => {
    const existing = Array.from({ length: PUSH_DAILY_CAP }, (_, i) => ({
      id: `old-${i}`,
      userId: 'u1',
      kind: NotificationKind.RAID_SPAWNED,
      pushDayKey: new Date().toISOString().slice(0, 10),
      createdAt: new Date(),
    }));
    // The fake day key must match the computed one: same local day in Berlin.
    const { svc, rows, jobs } = makeDeps({
      existing,
      device: { timeZone: 'Europe/Berlin' },
    });
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(
      new Date(),
    );
    for (const r of rows) r.pushDayKey = today;
    await svc.notify('u1', NotificationKind.RAID_DEFEATED, null, {});
    assert.equal(jobs.length, 0);
    assert.equal(rows.length, PUSH_DAILY_CAP + 1);
    assert.equal(rows.at(-1)!.pushDayKey, null);
  });

  it('lets exempt kinds bypass the cap without consuming it', async () => {
    const { svc, rows, jobs } = makeDeps({ device: { timeZone: 'Europe/Berlin' } });
    for (let i = 0; i < PUSH_DAILY_CAP + 2; i++) {
      await svc.notify('u1', NotificationKind.FRIEND_REQUEST, 'a', {});
    }
    assert.equal(jobs.length, PUSH_DAILY_CAP + 2);
    assert.equal(counted(rows).length, 0);
    // ...and the cap is still untouched for counted kinds.
    for (let i = 0; i < PUSH_DAILY_CAP; i++) {
      await svc.notify('u1', NotificationKind.RAID_DEFEATED, null, {});
    }
    assert.equal(jobs.length, PUSH_DAILY_CAP + 2 + PUSH_DAILY_CAP);
    const over = await svc.notify('u1', NotificationKind.RAID_ESCAPED, null, {});
    assert.equal(jobs.length, PUSH_DAILY_CAP + 2 + PUSH_DAILY_CAP);
    assert.equal(rows.length, PUSH_DAILY_CAP + 2 + PUSH_DAILY_CAP + 1);
    assert.equal(rows.at(-1)!.pushDayKey, null);
    void over;
  });

  it('skips a disabled kind but keeps the inbox row', async () => {
    const { svc, rows, jobs } = makeDeps({
      prefs: { pushDisabledKinds: [NotificationKind.RAID_PHASE] },
    });
    await svc.notify('u1', NotificationKind.RAID_PHASE, null, {});
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.pushDayKey, null);
    assert.deepEqual(jobs, []);
    // Other kinds of the same category still go through.
    await svc.notify('u1', NotificationKind.RAID_DEFEATED, null, {});
    assert.equal(jobs.length, 1);
  });

  it('category off wins over kind on', async () => {
    const { svc, rows, jobs } = makeDeps({
      prefs: { pushRaids: false, pushDisabledKinds: [] },
    });
    await svc.notify('u1', NotificationKind.RAID_PHASE, null, {});
    assert.equal(rows.length, 1);
    assert.deepEqual(jobs, []);
  });
});

describe('NotificationService.list', () => {
  it('renders title/body per requested locale', async () => {
    const { svc } = makeDeps({
      existing: [
        {
          id: 'n-1',
          userId: 'u1',
          kind: NotificationKind.DUEL_INVITE,
          actorId: 'a1',
          payload: {},
          createdAt: new Date(),
          readAt: null,
        },
      ],
    });
    const en = await svc.list('u1', undefined, 20, 'en');
    // The notification id seeds the variant, so assert membership, not a fixed line.
    assert.ok(
      ['Duel challenge', "You've been called out", '1v1 incoming'].includes(en.items[0]!.title),
    );
    assert.doesNotMatch(en.items[0]!.body, /\{/);
    const de = await svc.list('u1', undefined, 20, 'de');
    assert.ok(
      ['Duell-Herausforderung', 'Du wurdest herausgefordert', '1 gegen 1'].includes(
        de.items[0]!.title,
      ),
    );
  });

  it('falls back to the profile language, then the device locale', async () => {
    const { svc } = makeDeps({
      prefs: { language: 'de' },
      existing: [
        {
          id: 'n-1',
          userId: 'u1',
          kind: NotificationKind.FRIEND_REQUEST,
          payload: {},
          createdAt: new Date(),
        },
      ],
    });
    const deTitles = ['Freundschaftsanfrage', 'Jemand hat dich bemerkt', 'Neuer Rivale'];
    const res = await svc.list('u1', undefined, 20);
    assert.ok(deTitles.includes(res.items[0]!.title));

    const { svc: svc2 } = makeDeps({
      prefs: { language: 'system' },
      device: { locale: 'de' },
      existing: [
        {
          id: 'n-1',
          userId: 'u1',
          kind: NotificationKind.FRIEND_REQUEST,
          payload: {},
          createdAt: new Date(),
        },
      ],
    });
    const res2 = await svc2.list('u1', undefined, 20);
    assert.ok(deTitles.includes(res2.items[0]!.title));
  });
});
