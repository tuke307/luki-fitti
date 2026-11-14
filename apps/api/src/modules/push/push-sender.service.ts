import { Injectable, Optional } from '@nestjs/common';
import * as http2 from 'node:http2';
import jwt from 'jsonwebtoken';
import webpush from 'web-push';
import { logger } from '@luki-fitti/logger';
import { NotificationKind, PushPlatform } from '@luki-fitti/common/enums';
import {
  anonymousActorName,
  arenaName,
  raidBossName,
  duelResultMessage,
  duelStandingsMessage,
  leagueEndingMessage,
  pushMessageFor,
  renderPushMessage,
} from '@luki-fitti/common/push-messages';
import { PrismaService } from '../database/prisma.service';
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
  /** One pooled HTTP/2 session per APNs host — Apple asks providers to reuse them. */
  private readonly apnsSessions = new Map<string, http2.ClientHttp2Session>();
  private warnedMissing = new Set<string>();
  private readonly apnsSend: NonNullable<PushSenderDeps['apnsSend']>;
  private readonly webPushSend: NonNullable<PushSenderDeps['webPushSend']>;
  private readonly isApnsConfigured: () => boolean;
  private readonly isWebPushConfigured: () => boolean;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() deps: PushSenderDeps = {},
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
        actor: { select: { handle: true } },
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

    // Display names are friends-only: push text uses @handle, else a locale
    // placeholder (a friend request comes from a non-friend).
    const actorHandle = notification.actor?.handle ?? null;
    const payloadJson = (notification.payload ?? {}) as Record<string, unknown>;
    const payload = {
      kind: notification.kind,
      notificationId: notification.id,
      ...(typeof payloadJson.url === 'string' ? { url: payloadJson.url } : {}),
    };

    // Every device is tried: one transient failure must not starve the rest, and
    // a full retry must not re-push devices that already succeeded. Dead-token
    // deletions count as handled — the job succeeded for those devices.
    let handled = 0;
    let transientFailures = 0;
    for (const device of notification.user.pushDevices) {
      const kind = notification.kind as NotificationKind;
      const template =
        kind === NotificationKind.LEAGUE_ENDING
          ? leagueEndingMessage(payloadJson.inDemotionZone === true, device.locale)
          : kind === NotificationKind.DUEL_STANDINGS
            ? duelStandingsMessage(payloadJson.leading === true, device.locale)
            : kind === NotificationKind.DUEL_RESULT
              ? duelResultMessage(
                  payloadJson.outcome === 'WON'
                    ? 'WON'
                    : payloadJson.outcome === 'TIE'
                      ? 'TIE'
                      : 'LOST',
                  device.locale,
                )
              : pushMessageFor(kind, device.locale);
      const message = renderPushMessage(template, {
        actor: actorHandle ? `@${actorHandle}` : anonymousActorName(device.locale),
        arena: arenaName(String(payloadJson.toArena ?? payloadJson.fromArena ?? ''), device.locale),
        rank: String(payloadJson.rank ?? ''),
        places: String(payloadJson.placesToPromotion ?? ''),
        you: String(payloadJson.you ?? ''),
        them: String(payloadJson.them ?? ''),
        days: String(payloadJson.daysLeft ?? ''),
        count: String(payloadJson.count ?? ''),
        boss: raidBossName(String(payloadJson.bossSlug ?? ''), device.locale),
        squad: String(payloadJson.squadName ?? ''),
        percent: String(payloadJson.percent ?? ''),
      });
      try {
        const outcome =
          device.platform === PushPlatform.APNS
            ? await this.sendApns(device.token, device.apnsSandbox, message, payload, device.id)
            : await this.sendWebPush(device, message, payload);
        if (outcome !== 'skipped') handled += 1;
      } catch (err) {
        transientFailures += 1;
        logger.error(`push to device ${device.id} failed: ${String(err)}`);
      }
    }
    if (handled === 0 && transientFailures > 0) {
      throw new Error(`all ${transientFailures} push deliveries failed`); // BullMQ retries
    }
  }

  /** Tears down pooled APNs HTTP/2 sessions (called on worker shutdown). */
  close(): void {
    for (const session of this.apnsSessions.values()) session.close();
    this.apnsSessions.clear();
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
  ): Promise<'sent' | 'dead' | 'skipped'> {
    if (!this.isApnsConfigured()) {
      this.warnOnce('APNs');
      return 'skipped';
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
      return 'dead';
    }
    if (result.status !== 200) {
      throw new Error(`APNs send failed: status ${result.status} ${result.reason ?? ''}`);
    }
    return 'sent';
  }

  /** Lazily opens (and reuses) one HTTP/2 session per APNs host. */
  private apnsClient(host: string): http2.ClientHttp2Session {
    const cached = this.apnsSessions.get(host);
    if (cached && !cached.closed && !cached.destroyed) return cached;
    const client = http2.connect(host);
    const drop = () => {
      if (this.apnsSessions.get(host) === client) this.apnsSessions.delete(host);
    };
    client.once('close', drop);
    client.once('error', drop);
    client.once('goaway', () => {
      drop();
      client.close();
    });
    this.apnsSessions.set(host, client);
    return client;
  }

  private apnsHttp2Send(args: {
    sandbox: boolean;
    token: string;
    jwt: () => string;
    body: string;
  }): Promise<ApnsResult> {
    const host = args.sandbox ? APNS_SANDBOX_HOST : APNS_PROD_HOST;
    return new Promise((resolve, reject) => {
      const client = this.apnsClient(host);
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
        let reason: string | undefined;
        try {
          reason = (JSON.parse(body) as { reason?: string }).reason;
        } catch {
          reason = undefined;
        }
        resolve({ status, reason });
      });
      req.on('error', (err) => {
        req.close();
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
  ): Promise<'sent' | 'dead' | 'skipped'> {
    if (!this.isWebPushConfigured()) {
      this.warnOnce('Web Push');
      return 'skipped';
    }
    if (!device.p256dh || !device.auth) {
      await this.prisma.pushDevice.delete({ where: { id: device.id } });
      return 'dead';
    }
    try {
      await this.webPushSend({
        endpoint: device.token,
        p256dh: device.p256dh,
        auth: device.auth,
        payload: JSON.stringify({ title: message.title, body: message.body, ...payload }),
      });
      return 'sent';
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await this.prisma.pushDevice.delete({ where: { id: device.id } });
        logger.info(`deleted dead Web Push device ${device.id}`);
        return 'dead';
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
