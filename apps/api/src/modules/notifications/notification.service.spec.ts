import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NotificationKind } from '@luki-fitti/common/enums';
import type { PrismaService } from '../database/prisma.service';
import type { BullMQService } from '../bullmq/bullmq.service';
import type { SocialAccessService } from '../social/social-access.service';
import { NotificationService } from './notification.service';

function makeDeps(opts: { socialPaused?: boolean; rollout?: boolean; pushFriends?: boolean }) {
  const rows: Record<string, unknown>[] = [];
  const jobs: string[] = [];
  const prisma = {
    notification: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `n-${rows.length + 1}`, ...data };
        rows.push(row);
        return row;
      },
    },
    user: {
      findUnique: async () => ({ socialPaused: opts.socialPaused ?? false }),
    },
    userPreferences: {
      findUnique: async () => ({ pushFriends: opts.pushFriends ?? true }),
    },
    pushDevice: {
      findFirst: async () => null,
    },
  };
  const bullmq = {
    addPushJob: async (id: string) => {
      jobs.push(id);
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
    assert.deepEqual(jobs, ['n-1']);
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
    const { svc, rows, jobs } = makeDeps({ pushFriends: false });
    await svc.notify('u1', NotificationKind.FRIEND_REQUEST, 'actor1', {});
    assert.equal(rows.length, 1);
    assert.deepEqual(jobs, []);
  });
});
