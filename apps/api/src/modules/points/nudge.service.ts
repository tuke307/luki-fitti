import { Injectable } from '@nestjs/common';
import { NotificationKind } from '@luki-fitti/common/enums';
import { berlinDayKey, berlinMidnight, berlinWeekKey, weekBounds } from '@luki-fitti/common/utils';
import { PrismaService } from '../database/prisma.service';
import { SocialAccessService } from '../social/social-access.service';
import { NotificationService } from '../notifications/notification.service';
import { weeklyWorkoutCounts } from './workout-counts.util';

/** Max nudges per (recipient, actor) pair within one league week. */
const NUDGES_PER_PAIR_PER_WEEK = 2;

/**
 * Friend nudges: when user A records a session that pulls them ahead of a
 * friend F in this week's workout count (or grows the lead to two), F gets a
 * FRIEND_PULLED_AHEAD notification. Always best-effort — the caller catches and
 * logs failures so a nudge can never lose the session sync.
 */
@Injectable()
export class NudgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly socialAccess: SocialAccessService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Run after recordSession created a new >0-point ledger entry for `userId`.
   * `entryWeekKey` is that entry's week; nudges only make sense when it is the
   * current Berlin week — a backfill into the previous week never nudges.
   */
  async afterEntry(userId: string, entryWeekKey: string, now = new Date()): Promise<void> {
    const weekKey = berlinWeekKey(now);
    if (entryWeekKey !== weekKey) return;
    const dayKey = berlinDayKey(now);

    const friendships = await this.prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ userAId: userId }, { userBId: userId }] },
      select: { userAId: true, userBId: true },
    });
    const friendIds = friendships.map((f) => (f.userAId === userId ? f.userBId : f.userAId));
    if (friendIds.length === 0) return;

    const week = weekBounds(weekKey);
    const [blocks, counts, trainedToday, paused, goalReached, todayNudges, pairNudges] =
      await Promise.all([
        this.prisma.userBlock.findMany({
          where: {
            OR: [
              { blockerId: userId, blockedId: { in: friendIds } },
              { blockerId: { in: friendIds }, blockedId: userId },
            ],
          },
          select: { blockerId: true, blockedId: true },
        }),
        weeklyWorkoutCounts(this.prisma, weekKey, [userId, ...friendIds]),
        this.prisma.effortPointEntry.findMany({
          where: { userId: { in: friendIds }, dayKey, points: { gt: 0 } },
          select: { userId: true },
          distinct: ['userId'],
        }),
        this.prisma.user.findMany({
          where: { id: { in: friendIds }, socialPaused: true },
          select: { id: true },
        }),
        this.prisma.weeklyScore.findMany({
          where: { weekKey, userId: { in: friendIds }, goalReached: true },
          select: { userId: true },
        }),
        this.prisma.notification.findMany({
          where: {
            kind: NotificationKind.FRIEND_PULLED_AHEAD,
            userId: { in: friendIds },
            createdAt: { gte: berlinMidnight(dayKey) },
          },
          select: { userId: true },
        }),
        this.prisma.notification.findMany({
          where: {
            kind: NotificationKind.FRIEND_PULLED_AHEAD,
            userId: { in: friendIds },
            actorId: userId,
            createdAt: { gte: week.start, lt: week.end },
          },
          select: { userId: true },
        }),
      ]);

    const blockedIds = new Set(
      blocks.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId)),
    );
    const trainedIds = new Set(trainedToday.map((e) => e.userId));
    const pausedIds = new Set(paused.map((u) => u.id));
    const goalIds = new Set(goalReached.map((s) => s.userId));
    const nudgedTodayIds = new Set(todayNudges.map((n) => n.userId));
    const pairCounts = new Map<string, number>();
    for (const n of pairNudges) pairCounts.set(n.userId, (pairCounts.get(n.userId) ?? 0) + 1);

    const after = counts.get(userId) ?? 0;
    const before = after - 1;

    for (const friendId of friendIds) {
      const f = counts.get(friendId) ?? 0;
      const pulledAhead = before <= f && after > f;
      const leadGrewToTwo = after - f >= 2 && before - f < 2;
      if (!pulledAhead && !leadGrewToTwo) continue;
      if (
        blockedIds.has(friendId) ||
        pausedIds.has(friendId) ||
        trainedIds.has(friendId) ||
        goalIds.has(friendId) ||
        nudgedTodayIds.has(friendId) ||
        (pairCounts.get(friendId) ?? 0) >= NUDGES_PER_PAIR_PER_WEEK
      ) {
        continue;
      }
      if (!(await this.socialAccess.isEnabledFor(friendId))) continue;

      await this.notifications.notify(friendId, NotificationKind.FRIEND_PULLED_AHEAD, userId, {
        count: after,
        you: f,
        weekKey,
        url: '/social/friends',
      });
      nudgedTodayIds.add(friendId);
      pairCounts.set(friendId, (pairCounts.get(friendId) ?? 0) + 1);
    }
  }
}
