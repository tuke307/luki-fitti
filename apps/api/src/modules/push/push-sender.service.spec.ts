import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaService } from '../database/prisma.service';
import { PushSenderService, type ApnsResult } from './push-sender.service';

interface Device {
  id: string;
  platform: 'APNS' | 'WEBPUSH';
  token: string;
  p256dh: string | null;
  auth: string | null;
  apnsSandbox: boolean;
  locale: string;
}

function makePrisma(devices: Device[]) {
  const deleted: string[] = [];
  const prisma = {
    deleted,
    notification: {
      findUnique: async () => ({
        id: 'n1',
        kind: 'FRIEND_REQUEST',
        payload: { url: '/social/friends' },
        actor: { handle: 'lukas', name: 'Lukas Meier' },
        user: { pushDevices: devices },
      }),
    },
    pushDevice: {
      delete: async ({ where }: { where: { id: string } }) => {
        deleted.push(where.id);
      },
    },
  };
  return prisma;
}

function sender(
  prisma: ReturnType<typeof makePrisma>,
  deps: {
    apnsConfigured?: boolean;
    webPushConfigured?: boolean;
    apnsSend?: (args: { token: string }) => Promise<ApnsResult>;
    webPushSend?: (args: { endpoint: string; payload: string }) => Promise<void>;
  },
) {
  return new PushSenderService(prisma as unknown as PrismaService, {
    apnsConfigured: () => deps.apnsConfigured ?? false,
    webPushConfigured: () => deps.webPushConfigured ?? false,
    apnsSend: deps.apnsSend as never,
    webPushSend: deps.webPushSend as never,
  });
}

const apnsDevice = (id: string): Device => ({
  id,
  platform: 'APNS',
  token: `apns-${id}`,
  p256dh: null,
  auth: null,
  apnsSandbox: false,
  locale: 'en',
});

const webDevice = (id: string): Device => ({
  id,
  platform: 'WEBPUSH',
  token: `https://push.example/${id}`,
  p256dh: 'p',
  auth: 'a',
  apnsSandbox: false,
  locale: 'de',
});

describe('PushSenderService dead-token cleanup', () => {
  it('deletes the device on APNs 410, BadDeviceToken and Unregistered', async () => {
    for (const result of [
      { status: 410 },
      { status: 400, reason: 'BadDeviceToken' },
      { status: 410, reason: 'Unregistered' },
    ]) {
      const prisma = makePrisma([apnsDevice('d1')]);
      const svc = sender(prisma, {
        apnsConfigured: true,
        apnsSend: async () => result,
      });
      await svc.sendNotification('n1');
      assert.deepEqual(prisma.deleted, ['d1'], JSON.stringify(result));
    }
  });

  it('keeps the device and throws on other APNs failures', async () => {
    const prisma = makePrisma([apnsDevice('d1')]);
    const svc = sender(prisma, {
      apnsConfigured: true,
      apnsSend: async () => ({ status: 400, reason: 'BadCollapseId' }),
    });
    await assert.rejects(svc.sendNotification('n1'));
    assert.deepEqual(prisma.deleted, []);
  });

  it('skips APNs silently when the channel is not configured', async () => {
    const prisma = makePrisma([apnsDevice('d1')]);
    let called = false;
    const svc = sender(prisma, {
      apnsConfigured: false,
      apnsSend: async () => {
        called = true;
        return { status: 200 };
      },
    });
    await svc.sendNotification('n1');
    assert.equal(called, false);
    assert.deepEqual(prisma.deleted, []);
  });

  it('deletes the device on Web Push 404/410, keeps it on other errors', async () => {
    for (const statusCode of [404, 410]) {
      const prisma = makePrisma([webDevice('d1')]);
      const svc = sender(prisma, {
        webPushConfigured: true,
        webPushSend: async () => {
          throw Object.assign(new Error('gone'), { statusCode });
        },
      });
      await svc.sendNotification('n1');
      assert.deepEqual(prisma.deleted, ['d1']);
    }

    const prisma2 = makePrisma([webDevice('d2')]);
    const svc2 = sender(prisma2, {
      webPushConfigured: true,
      webPushSend: async () => {
        throw Object.assign(new Error('server error'), { statusCode: 500 });
      },
    });
    await assert.rejects(svc2.sendNotification('n1'));
    assert.deepEqual(prisma2.deleted, []);
  });

  it('does not throw when one device fails transiently but another succeeds', async () => {
    const prisma = makePrisma([webDevice('ok'), webDevice('flaky')]);
    const svc = sender(prisma, {
      webPushConfigured: true,
      webPushSend: async ({ endpoint }) => {
        if (endpoint.includes('flaky')) {
          throw Object.assign(new Error('server error'), { statusCode: 500 });
        }
      },
    });
    await svc.sendNotification('n1'); // no retry: 'ok' would otherwise be pushed twice
    assert.deepEqual(prisma.deleted, []);
  });

  it('throws only when every device failed transiently', async () => {
    const prisma = makePrisma([webDevice('a'), webDevice('b')]);
    const svc = sender(prisma, {
      webPushConfigured: true,
      webPushSend: async () => {
        throw Object.assign(new Error('timeout'), { statusCode: 500 });
      },
    });
    await assert.rejects(svc.sendNotification('n1'));
    assert.deepEqual(prisma.deleted, []);
  });

  it('a dead-token deletion counts as handled, not a failure', async () => {
    const prisma = makePrisma([webDevice('dead'), webDevice('flaky')]);
    const svc = sender(prisma, {
      webPushConfigured: true,
      webPushSend: async ({ endpoint }) => {
        if (endpoint.includes('dead')) {
          throw Object.assign(new Error('gone'), { statusCode: 410 });
        }
        throw Object.assign(new Error('server error'), { statusCode: 500 });
      },
    });
    await svc.sendNotification('n1');
    assert.deepEqual(prisma.deleted, ['dead']);
  });

  it('uses @handle in push text and never the display name', async () => {
    const prisma = makePrisma([webDevice('d1')]);
    let sentBody = '';
    const svc = sender(prisma, {
      webPushConfigured: true,
      webPushSend: async ({ payload }) => {
        sentBody = payload;
      },
    });
    await svc.sendNotification('n1');
    assert.match(sentBody, /@lukas/);
    assert.doesNotMatch(sentBody, /Lukas Meier/);
  });

  it('deletes web devices missing keys without calling the transport', async () => {
    const prisma = makePrisma([{ ...webDevice('d1'), p256dh: null }]);
    let called = false;
    const svc = sender(prisma, {
      webPushConfigured: true,
      webPushSend: async () => {
        called = true;
      },
    });
    await svc.sendNotification('n1');
    assert.equal(called, false);
    assert.deepEqual(prisma.deleted, ['d1']);
  });
});
