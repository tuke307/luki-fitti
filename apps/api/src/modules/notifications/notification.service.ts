import { Injectable } from '@nestjs/common';
import { NotificationKind } from '@luki-fitti/common/enums';
import type {
  MarkNotificationsReadDto,
  NotificationDto,
  NotificationListDto,
} from '@luki-fitti/common/schemas';
import {
  PUSH_CAP_EXEMPT_KINDS,
  PUSH_DAILY_CAP,
  notificationCategoryOf,
} from '@luki-fitti/common/notification-categories';
import { renderNotification } from '@luki-fitti/common/push-messages';
import type { Prisma } from '@luki-fitti/database';
import { PrismaService } from '../database/prisma.service';
import { BullMQService } from '../bullmq/bullmq.service';
import { SocialAccessService } from '../social/social-access.service';
import { avatarUrlFor } from '../social/relation.util';
import { quietHoursDelayMs } from './quiet-hours.util';

const PAIR = (a: string, b: string) => (a < b ? ([a, b] as const) : ([b, a] as const));

/** Fallback time zone for the daily-cap day key when no device is registered. */
const DEFAULT_TIME_ZONE = 'Europe/Berlin';

/** `YYYY-MM-DD` of `date` in `timeZone`; invalid zones fall back to Berlin. */
function localDayKey(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return localDayKey(date, DEFAULT_TIME_ZONE);
  }
}

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bullmq: BullMQService,
    private readonly socialAccess: SocialAccessService,
  ) {}

  /**
   * In-app inbox entry, then — when the user's push preferences allow it — a
   * BullMQ push job (delayed to the end of local quiet hours when needed).
   * Paused users and users outside the social rollout get the inbox row but no
   * push. Non-exempt kinds share a daily cap per local delivery day; over the
   * cap the row stays inbox-only.
   */
  async notify(
    userId: string,
    kind: NotificationKind,
    actorId: string | null,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const prefKey = notificationCategoryOf(kind).pref;
    const [user, prefs, rolloutAllowed] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { socialPaused: true } }),
      this.prisma.userPreferences.findUnique({
        where: { userId },
        select: {
          [prefKey]: true,
          pushDisabledKinds: true,
        } as unknown as Prisma.UserPreferencesSelect,
      }),
      this.socialAccess.isEnabledFor(userId),
    ]);

    const exempt = PUSH_CAP_EXEMPT_KINDS.has(kind);
    let pushDayKey: string | null = null;
    let delayMs = 0;
    const disabledKinds = (prefs as { pushDisabledKinds?: NotificationKind[] } | null)
      ?.pushDisabledKinds;
    const enqueue =
      !user?.socialPaused &&
      rolloutAllowed &&
      ((prefs as Record<string, boolean> | null)?.[prefKey] ?? true) &&
      !(disabledKinds ?? []).includes(kind);

    if (enqueue) {
      // Quiet hours use the most recently seen device's time zone; the cap counts
      // by the local delivery day (after the quiet-hours delay).
      const device = await this.prisma.pushDevice.findFirst({
        where: { userId },
        orderBy: { lastSeenAt: 'desc' },
        select: { timeZone: true },
      });
      delayMs = quietHoursDelayMs(new Date(), device?.timeZone);
      if (!exempt) {
        pushDayKey = localDayKey(
          new Date(Date.now() + delayMs),
          device?.timeZone ?? DEFAULT_TIME_ZONE,
        );
        // Best-effort count: races can overshoot the cap by one — acceptable.
        const sentToday = await this.prisma.notification.count({
          where: { userId, pushDayKey },
        });
        if (sentToday >= PUSH_DAILY_CAP) pushDayKey = null;
      }
    }

    const notification = await this.prisma.notification.create({
      data: {
        userId,
        kind,
        actorId,
        payload: payload as Prisma.InputJsonValue,
        // Only rows that actually get a push carry the day key, so the count is
        // "pushes delivered that day" — inbox-only rows and exempt kinds stay null.
        pushDayKey: enqueue && !exempt ? pushDayKey : null,
      },
    });
    if (!enqueue || (!exempt && pushDayKey === null)) return;
    await this.bullmq.addPushJob(notification.id, delayMs);
  }

  async list(
    userId: string,
    cursor?: string,
    limit = 20,
    locale?: 'en' | 'de',
  ): Promise<NotificationListDto> {
    const cursorRow = cursor
      ? await this.prisma.notification.findUnique({ where: { id: cursor } })
      : null;
    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(cursorRow
          ? {
              OR: [
                { createdAt: { lt: cursorRow.createdAt } },
                { createdAt: cursorRow.createdAt, id: { lt: cursorRow.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        actor: { select: { id: true, username: true, avatarKey: true, avatarUpdatedAt: true } },
      },
    });

    const [unreadCount, blocks, resolvedLocale] = await Promise.all([
      this.prisma.notification.count({ where: { userId, readAt: null } }),
      this.prisma.userBlock.findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
      }),
      this.inboxLocale(userId, locale),
    ]);
    const blockedWith = new Set(
      blocks.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId)),
    );

    const items: NotificationDto[] = [];
    for (const n of rows.slice(0, limit)) {
      // BLOCKED actors are dropped entirely — deny by default.
      if (n.actorId && blockedWith.has(n.actorId)) continue;
      const actorUsername = n.actor?.username ?? null;
      const payloadJson = (n.payload ?? {}) as Record<string, unknown>;
      const message = renderNotification(
        n.kind as NotificationKind,
        payloadJson,
        actorUsername,
        resolvedLocale,
      );
      items.push({
        id: n.id,
        kind: n.kind as NotificationKind,
        title: message.title,
        body: message.body,
        actor: actorUsername
          ? {
              userId: n.actor!.id,
              username: actorUsername,
              avatarUrl: avatarUrlFor(n.actor!),
            }
          : null,
        payload: payloadJson,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      });
    }

    const nextCursor = rows.length > limit ? (rows[limit - 1]?.id ?? null) : null;
    return { items, unreadCount, nextCursor };
  }

  /**
   * Inbox text locale: explicit query param, else the profile language when it
   * is en/de, else the most recently seen device locale, else English.
   */
  private async inboxLocale(userId: string, locale?: 'en' | 'de'): Promise<string> {
    if (locale) return locale;
    const prefs = await this.prisma.userPreferences.findUnique({
      where: { userId },
      select: { language: true },
    });
    if (prefs?.language === 'en' || prefs?.language === 'de') return prefs.language;
    const device = await this.prisma.pushDevice.findFirst({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
      select: { locale: true },
    });
    return device?.locale ?? 'en';
  }

  async markRead(userId: string, dto: MarkNotificationsReadDto): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
        ...(dto.all ? {} : { id: { in: dto.ids ?? [] } }),
      },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  /** Pair key helper shared with the social service (friendship row direction). */
  static pair(a: string, b: string): readonly [string, string] {
    return PAIR(a, b);
  }
}
