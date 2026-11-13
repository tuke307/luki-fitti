import { Injectable } from '@nestjs/common';
import { NotificationKind } from '@luki-fitti/common/enums';
import type {
  MarkNotificationsReadDto,
  NotificationDto,
  NotificationListDto,
} from '@luki-fitti/common/schemas';
import type { Prisma } from '@luki-fitti/database';
import { PrismaService } from '../database/prisma.service';
import { BullMQService } from '../bullmq/bullmq.service';
import { SocialAccessService } from '../social/social-access.service';
import { avatarUrlFor } from '../social/relation.util';
import { quietHoursDelayMs } from './quiet-hours.util';

/** NotificationKind → UserPreferences push toggle that gates the push job. */
const KIND_PREF: Record<
  NotificationKind,
  'pushFriends' | 'pushLeagues' | 'pushDuels' | 'pushStreaks'
> = {
  [NotificationKind.FRIEND_REQUEST]: 'pushFriends',
  [NotificationKind.FRIEND_ACCEPTED]: 'pushFriends',
  [NotificationKind.LEAGUE_PROMOTED]: 'pushLeagues',
  [NotificationKind.LEAGUE_DEMOTED]: 'pushLeagues',
  [NotificationKind.LEAGUE_ENDING]: 'pushLeagues',
  [NotificationKind.DUEL_INVITE]: 'pushDuels',
  [NotificationKind.DUEL_ACCEPTED]: 'pushDuels',
  [NotificationKind.DUEL_STANDINGS]: 'pushDuels',
  [NotificationKind.DUEL_RESULT]: 'pushDuels',
  [NotificationKind.STREAK_INVITE]: 'pushStreaks',
  [NotificationKind.STREAK_STARTED]: 'pushStreaks',
  [NotificationKind.STREAK_REMINDER]: 'pushStreaks',
  [NotificationKind.STREAK_FROZEN]: 'pushStreaks',
  [NotificationKind.STREAK_BROKEN]: 'pushStreaks',
};

const PAIR = (a: string, b: string) => (a < b ? ([a, b] as const) : ([b, a] as const));

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bullmq: BullMQService,
    private readonly socialAccess: SocialAccessService,
  ) {}

  /**
   * In-app inbox entry, then — when the user's push category allows it — a BullMQ
   * push job (delayed to the end of local quiet hours when needed). Paused users
   * and users outside the social rollout get the inbox row but no push.
   */
  async notify(
    userId: string,
    kind: NotificationKind,
    actorId: string | null,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const notification = await this.prisma.notification.create({
      data: { userId, kind, actorId, payload: payload as Prisma.InputJsonValue },
    });

    const [user, prefs, rolloutAllowed] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { socialPaused: true } }),
      this.prisma.userPreferences.findUnique({
        where: { userId },
        select: { [KIND_PREF[kind]]: true },
      }),
      this.socialAccess.isEnabledFor(userId),
    ]);
    if (user?.socialPaused || !rolloutAllowed) return;
    const allowed = (prefs as Record<string, boolean> | null)?.[KIND_PREF[kind]] ?? true;
    if (!allowed) return;

    // Quiet hours use the most recently seen device's time zone.
    const device = await this.prisma.pushDevice.findFirst({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
      select: { timeZone: true },
    });
    const delayMs = quietHoursDelayMs(new Date(), device?.timeZone);
    await this.bullmq.addPushJob(notification.id, delayMs);
  }

  async list(userId: string, cursor?: string, limit = 20): Promise<NotificationListDto> {
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
        actor: { select: { id: true, handle: true, avatarKey: true, avatarUpdatedAt: true } },
      },
    });

    const [unreadCount, blocks] = await Promise.all([
      this.prisma.notification.count({ where: { userId, readAt: null } }),
      this.prisma.userBlock.findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
      }),
    ]);
    const blockedWith = new Set(
      blocks.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId)),
    );

    const items: NotificationDto[] = [];
    for (const n of rows.slice(0, limit)) {
      // BLOCKED actors are dropped entirely — deny by default.
      if (n.actorId && blockedWith.has(n.actorId)) continue;
      items.push({
        id: n.id,
        kind: n.kind as NotificationKind,
        actor: n.actor?.handle
          ? {
              userId: n.actor.id,
              handle: n.actor.handle,
              avatarUrl: avatarUrlFor(n.actor),
            }
          : null,
        payload: (n.payload ?? {}) as Record<string, unknown>,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      });
    }

    const nextCursor = rows.length > limit ? (rows[limit - 1]?.id ?? null) : null;
    return { items, unreadCount, nextCursor };
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
