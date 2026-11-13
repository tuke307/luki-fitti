import { Injectable } from '@nestjs/common';
import * as http2 from 'node:http2';
import jwt from 'jsonwebtoken';
import webpush from 'web-push';
import { logger } from '@luki-fitti/logger';
import { NotificationKind, PushPlatform } from '@luki-fitti/common/enums';
import { pushMessageFor, renderPushMessage } from '@luki-fitti/common/push-messages';
import type { PrismaService } from '../database/prisma.service';
import {
  APNS_BUNDLE_ID,
  APNS_KEY_ID,
  APNS_KEY_P8_BASE64,
  APNS_TEAM_ID,
  VAPID_PRIVATE_KEY,
  VAPID_PUBLIC_KEY,
  VAPID_SUBJECT,
} from '../../config/env.config';
import { apnsConfigured, webPushConfigured } from './push-config';

export interface ApnsResult {
  status: number;
  /** APNs `reason` field from the JSON error body, when present. */
  reason?: string;
}

/** Transport seams — tests inject fakes instead of opening HTTP/2 sessions. */
export interface PushSenderDeps {
  /** Config checks, injectable so tests can exercise the configured path. */
  apnsConfigured?: () => boolean;
  webPushConfigured?: () => boolean;
  apnsSend?: (args: {
    sandbox: boolean;
    token: string;
    /** Lazily mints the provider JWT so tests need no real .p8 key. */
    jwt: () => string;
    body: string;
  }) => Promise<ApnsResult>;
  webPushSend?: (args: {
    endpoint: string;
    p256dh: string;
    auth: string;
    payload: string;
  }) => Promise<void>;
}

const APNS_PROD_HOST = 'https://api.push.apple.com';
const APNS_SANDBOX_HOST = 'https://api.sandbox.push.apple.com';
const APNS_JWT_TTL_MS = 50 * 60 * 1000; // APNs tokens are valid 60 min; renew early.

/**
 * Delivers one `Notification` row to every registered device of its user.
 * APNs: HTTP/2 + ES256 provider token (jsonwebtoken). Web Push: `web-push` + VAPID.
 * Dead tokens (APNs 410/BadDeviceToken/Unregistered, Web Push 404/410) are deleted.
 * Lives in the API package so the email-worker can reuse it via the
 * `@luki-fitti/api/services/push-sender.service` export.
 */
@Injectable()
export class PushSenderService {
  private apnsJwt: { token: string; expiresAt: number } | null = null;
  private warnedMissing = new Set<string>();
  private readonly apnsSend: NonNullable<PushSenderDeps['apnsSend']>;
  private readonly webPushSend: NonNullable<PushSenderDeps['webPushSend']>;
  private readonly isApnsConfigured: () => boolean;
  private readonly isWebPushConfigured: () => boolean;

  constructor(
    private readonly prisma: PrismaService,
    deps: PushSenderDeps = {},
  ) {
    this.apnsSend = deps.apnsSend ?? ((args) => this.apnsHttp2Send(args));
    this.webPushSend = deps.webPushSend ?? ((args) => this.webPushSendDefault(args));
    this.isApnsConfigured = deps.apnsConfigured ?? apnsConfigured;
    this.isWebPushConfigured = deps.webPushConfigured ?? webPushConfigured;
  }

  async sendNotification(notificationId: string): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: {
        actor: { select: { handle: true, name: true } },
        user: {
          select: {
            pushDevices: true,
          },
        },
      },
    });
    if (!notification) {
      logger.warn(`push job for unknown notification ${notificationId} — dropping`);
      return;
    }

    const actorName = notification.actor?.handle ?? notification.actor?.name ?? 'Someone';
    const payload = {
      kind: notification.kind,
      notificationId: notification.id,
      ...(typeof (notification.payload as Record<string, unknown>)?.url === 'string'
        ? { url: (notification.payload as Record<string, unknown>).url }
        : {}),
    };

    for (const device of notification.user.pushDevices) {
      const message = renderPushMessage(
        pushMessageFor(notification.kind as NotificationKind, device.locale),
        actorName,
      );
      try {
        if (device.platform === PushPlatform.APNS) {
          await this.sendApns(device.token, device.apnsSandbox, message, payload, device.id);
        } else {
          await this.sendWebPush(device, message, payload);
        }
      } catch (err) {
        logger.error(`push to device ${device.id} failed: ${String(err)}`);
        throw err; // BullMQ retries (3 attempts)
      }
    }
  }

  private warnOnce(channel: string): void {
    if (this.warnedMissing.has(channel)) return;
    this.warnedMissing.add(channel);
    logger.warn(`${channel} push is not configured — skipping those devices`);
  }

  // ── APNs ───────────────────────────────────────────────────────────────────

  private apnsProviderJwt(): string {
    const now = Date.now();
    if (this.apnsJwt && this.apnsJwt.expiresAt > now) return this.apnsJwt.token;
    const key = Buffer.from(APNS_KEY_P8_BASE64, 'base64');
    const token = jwt.sign({}, key, {
      algorithm: 'ES256',
      issuer: APNS_TEAM_ID,
      header: { alg: 'ES256', kid: APNS_KEY_ID },
    });
    this.apnsJwt = { token, expiresAt: now + APNS_JWT_TTL_MS };
    return token;
  }

  private async sendApns(
    token: string,
    sandbox: boolean,
    message: { title: string; body: string },
    payload: Record<string, unknown>,
    deviceId: string,
  ): Promise<void> {
    if (!this.isApnsConfigured()) {
      this.warnOnce('APNs');
      return;
    }
    const result = await this.apnsSend({
      sandbox,
      token,
      jwt: () => this.apnsProviderJwt(),
      body: JSON.stringify({
        aps: {
          alert: { title: message.title, body: message.body },
          sound: 'default',
          'mutable-content': 1,
        },
        ...payload,
      }),
    });
    if (
      result.status === 410 ||
      result.reason === 'BadDeviceToken' ||
      result.reason === 'Unregistered'
    ) {
      await this.prisma.pushDevice.delete({ where: { id: deviceId } });
      logger.info(`deleted dead APNs device ${deviceId}`);
    } else if (result.status !== 200) {
      throw new Error(`APNs send failed: status ${result.status} ${result.reason ?? ''}`);
    }
  }

  private apnsHttp2Send(args: {
    sandbox: boolean;
    token: string;
    jwt: () => string;
    body: string;
  }): Promise<ApnsResult> {
    const host = args.sandbox ? APNS_SANDBOX_HOST : APNS_PROD_HOST;
    return new Promise((resolve, reject) => {
      const client = http2.connect(host);
      client.on('error', (err) => {
        client.close();
        reject(err);
      });
      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${args.token}`,
        authorization: `bearer ${args.jwt()}`,
        'apns-topic': APNS_BUNDLE_ID,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': '0',
        'content-type': 'application/json',
      });
      let status = 0;
      let body = '';
      req.on('response', (headers) => {
        status = Number(headers[':status'] ?? 0);
      });
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf8');
      });
      req.on('end', () => {
        client.close();
        let reason: string | undefined;
        try {
          reason = (JSON.parse(body) as { reason?: string }).reason;
        } catch {
          reason = undefined;
        }
        resolve({ status, reason });
      });
      req.on('error', (err) => {
        client.close();
        reject(err);
      });
      req.end(args.body);
    });
  }

  // ── Web Push ─────────────────────────────────────────────────────────────

  private async sendWebPush(
    device: { id: string; token: string; p256dh: string | null; auth: string | null },
    message: { title: string; body: string },
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!this.isWebPushConfigured()) {
      this.warnOnce('Web Push');
      return;
    }
    if (!device.p256dh || !device.auth) {
      await this.prisma.pushDevice.delete({ where: { id: device.id } });
      return;
    }
    try {
      await this.webPushSend({
        endpoint: device.token,
        p256dh: device.p256dh,
        auth: device.auth,
        payload: JSON.stringify({ title: message.title, body: message.body, ...payload }),
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await this.prisma.pushDevice.delete({ where: { id: device.id } });
        logger.info(`deleted dead Web Push device ${device.id}`);
        return;
      }
      throw err;
    }
  }

  private async webPushSendDefault(args: {
    endpoint: string;
    p256dh: string;
    auth: string;
    payload: string;
  }): Promise<void> {
    await webpush.sendNotification(
      { endpoint: args.endpoint, keys: { p256dh: args.p256dh, auth: args.auth } },
      args.payload,
      {
        vapidDetails: {
          subject: VAPID_SUBJECT,
          publicKey: VAPID_PUBLIC_KEY,
          privateKey: VAPID_PRIVATE_KEY,
        },
      },
    );
  }
}
