import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { logger } from '@luki-fitti/logger';
import { FriendStreakStatus, NotificationKind } from '@luki-fitti/common/enums';
import { berlinWeekKey, nextWeekKey } from '@luki-fitti/common/utils';
import type { FriendStreakDto, StreakListDto } from '@luki-fitti/common/schemas';
import type { FriendStreak as DbStreak, Friendship } from '@luki-fitti/database';
import { PrismaService } from '../database/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { cardBetween, relationBetween } from './battle.util';

/** A kept week banks progress; every 4 consecutive kept weeks earns a freeze. */
const FREEZE_EVERY_WEEKS = 4;
const MAX_FREEZES = 2;

type StreakWithFriendship = DbStreak & { friendship: Friendship };

/** Prisma unique-constraint violation (P2002). */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}

const pairKey = (a: string, b: string) => (a < b ? ([a, b] as const) : ([b, a] as const));

@Injectable()
export class StreakService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** POST /streaks — friends only, at most one streak per friendship. */
  async invite(userId: string, friendId: string): Promise<FriendStreakDto> {
    if (userId === friendId) throw new NotFoundException('Streaks are for friends');
    const relation = await relationBetween(this.prisma, userId, friendId);
    if (relation !== 'FRIEND') throw new NotFoundException('Streaks are for friends');

    const [a, b] = pairKey(userId, friendId);
    const friendship = await this.prisma.friendship.findUniqueOrThrow({
      where: { userAId_userBId: { userAId: a, userBId: b } },
    });
    let streak: DbStreak;
    try {
      streak = await this.prisma.friendStreak.create({
        data: {
          friendshipId: friendship.id,
          status: FriendStreakStatus.PENDING,
          requestedById: userId,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('You already have a streak with this friend');
      }
      throw err;
    }
    await this.notify(friendId, NotificationKind.STREAK_INVITE, userId, {
      streakId: streak.id,
      url: '/social/friends',
    });
    return this.dtoFor(userId, { ...streak, friendship });
  }

  /** POST /streaks/:id/accept — the invited side turns it ACTIVE for this week. */
  async accept(userId: string, streakId: string): Promise<FriendStreakDto> {
    const streak = await this.participantStreak(userId, streakId);
    if (streak.status !== FriendStreakStatus.PENDING || streak.requestedById === userId) {
      throw new NotFoundException('No pending streak invite');
    }
    const updated = await this.prisma.friendStreak.update({
      where: { id: streak.id },
      data: { status: FriendStreakStatus.ACTIVE, startedWeekKey: berlinWeekKey(new Date()) },
    });
    await this.notify(streak.requestedById, NotificationKind.STREAK_STARTED, userId, {
      streakId: streak.id,
      url: '/social/friends',
    });
    return this.dtoFor(userId, { ...updated, friendship: streak.friendship });
  }

  /** DELETE /streaks/:id — either side ends it; silent. */
  async end(userId: string, streakId: string): Promise<void> {
    const streak = await this.participantStreak(userId, streakId);
    await this.prisma.friendStreak.delete({ where: { id: streak.id } });
  }

  /** GET /streaks — active streaks plus invites in both directions. */
  async list(userId: string): Promise<StreakListDto> {
    const streaks = await this.prisma.friendStreak.findMany({
      where: { friendship: { OR: [{ userAId: userId }, { userBId: userId }] } },
      include: { friendship: true },
      orderBy: { createdAt: 'desc' },
    });
    const active: FriendStreakDto[] = [];
    const incoming: FriendStreakDto[] = [];
    const outgoing: FriendStreakDto[] = [];
    for (const streak of streaks) {
      const dto = await this.dtoFor(userId, streak);
      if (streak.status === FriendStreakStatus.ACTIVE) active.push(dto);
      else if (streak.requestedById === userId) outgoing.push(dto);
      else incoming.push(dto);
    }
    return { active, incoming, outgoing };
  }

  // ── Weekly jobs ───────────────────────────────────────────────────────────

  /**
   * Runs inside the Monday league rollover — after the week-closing loop, and
   * even when leagues are off: every week strictly before `currentWeekKey` is
   * closed for streak purposes. One transaction per streak; notifications go
   * out after the commit.
   */
  async evaluateClosedWeeks(currentWeekKey: string): Promise<void> {
    const streaks = await this.prisma.friendStreak.findMany({
      where: { status: FriendStreakStatus.ACTIVE },
      include: { friendship: true },
    });
    for (const streak of streaks) {
      await this.evaluateStreak(streak, currentWeekKey).catch((err) =>
        logger.error(`streak ${streak.id} evaluation failed: ${String(err)}`),
      );
    }
  }

  private async evaluateStreak(
    streak: StreakWithFriendship,
    currentWeekKey: string,
  ): Promise<void> {
    if (!streak.startedWeekKey) return;
    const pending: string[] = [];
    for (let w = streak.startedWeekKey; w < currentWeekKey; w = nextWeekKey(w)) {
      if (!streak.lastEvaluatedWeekKey || w > streak.lastEvaluatedWeekKey) pending.push(w);
    }
    if (pending.length === 0) return;

    const notify: Array<{ userId: string; kind: NotificationKind; actorId: string }> = [];
    await this.prisma.$transaction(
      async (tx) => {
        // Re-read inside the transaction: another run may have evaluated already.
        const fresh = await tx.friendStreak.findUnique({ where: { id: streak.id } });
        if (!fresh || fresh.status !== FriendStreakStatus.ACTIVE) return;
        const [a, b] = [streak.friendship.userAId, streak.friendship.userBId];
        const scores = await tx.weeklyScore.findMany({
          where: { userId: { in: [a, b] }, weekKey: { in: pending } },
          select: { userId: true, weekKey: true, goalReached: true },
        });
        const reached = new Set(
          scores.filter((s) => s.goalReached).map((s) => `${s.userId}:${s.weekKey}`),
        );

        let { count, longest, freezes, weeksSinceFreeze, lastEvaluatedWeekKey } = fresh;
        for (const w of pending) {
          // Weeks before the streak started or already evaluated are skipped.
          if (lastEvaluatedWeekKey && w <= lastEvaluatedWeekKey) continue;
          const both = reached.has(`${a}:${w}`) && reached.has(`${b}:${w}`);
          if (both) {
            count += 1;
            longest = Math.max(longest, count);
            weeksSinceFreeze += 1;
            if (weeksSinceFreeze >= FREEZE_EVERY_WEEKS) {
              freezes = Math.min(freezes + 1, MAX_FREEZES);
              weeksSinceFreeze = 0;
            }
          } else if (freezes > 0) {
            freezes -= 1; // count kept — the freeze absorbs the missed week
            for (const userId of [a, b]) {
              notify.push({
                userId,
                kind: NotificationKind.STREAK_FROZEN,
                actorId: userId === a ? b : a,
              });
            }
          } else {
            count = 0;
            weeksSinceFreeze = 0;
            for (const userId of [a, b]) {
              notify.push({
                userId,
                kind: NotificationKind.STREAK_BROKEN,
                actorId: userId === a ? b : a,
              });
            }
          }
          lastEvaluatedWeekKey = w;
        }

        await tx.friendStreak.update({
          where: { id: streak.id },
          data: { count, longest, freezes, weeksSinceFreeze, lastEvaluatedWeekKey },
        });
      },
      { maxWait: 10_000, timeout: 60_000 },
    );

    for (const n of notify) {
      await this.notify(n.userId, n.kind, n.actorId, {
        streakId: streak.id,
        url: '/social/friends',
      });
    }
  }

  /**
   * Sunday-evening nudge: partners of a ≥1-week streak who have not reached
   * their goal this week get one push, at most once per streak per week.
   */
  async remind(currentWeekKey: string): Promise<void> {
    const streaks = await this.prisma.friendStreak.findMany({
      where: {
        status: FriendStreakStatus.ACTIVE,
        count: { gte: 1 },
        NOT: { lastReminderWeekKey: currentWeekKey },
      },
      include: { friendship: true },
    });
    for (const streak of streaks) {
      const marked = await this.prisma.friendStreak.updateMany({
        where: { id: streak.id, NOT: { lastReminderWeekKey: currentWeekKey } },
        data: { lastReminderWeekKey: currentWeekKey },
      });
      if (marked.count === 0) continue;

      const [a, b] = [streak.friendship.userAId, streak.friendship.userBId];
      const scores = await this.prisma.weeklyScore.findMany({
        where: { userId: { in: [a, b] }, weekKey: currentWeekKey },
        select: { userId: true, goalReached: true },
      });
      const reached = new Set(scores.filter((s) => s.goalReached).map((s) => s.userId));
      for (const userId of [a, b]) {
        if (reached.has(userId)) continue;
        await this.notify(userId, NotificationKind.STREAK_REMINDER, userId === a ? b : a, {
          streakId: streak.id,
          count: streak.count,
          url: '/social/friends',
        });
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Loads a streak the user participates in; everyone else gets a 404. */
  private async participantStreak(userId: string, streakId: string): Promise<StreakWithFriendship> {
    const streak = await this.prisma.friendStreak.findFirst({
      where: {
        id: streakId,
        friendship: { OR: [{ userAId: userId }, { userBId: userId }] },
      },
      include: { friendship: true },
    });
    if (!streak) throw new NotFoundException('Streak not found');
    return streak;
  }

  /** Entries with points > 0 this week — the streak goal counter. */
  private async sessionsDone(userId: string, weekKey: string): Promise<number> {
    return this.prisma.effortPointEntry.count({
      where: { userId, weekKey, points: { gt: 0 } },
    });
  }

  private async dtoFor(userId: string, streak: StreakWithFriendship): Promise<FriendStreakDto> {
    const friendId =
      streak.friendship.userAId === userId ? streak.friendship.userBId : streak.friendship.userAId;
    const [friend, weekKey] = [await this.friendUser(friendId), berlinWeekKey(new Date())];
    const card = friend
      ? ((await cardBetween(this.prisma, userId, friend)) ?? {
          userId: friend.id,
          handle: friend.handle ?? '',
          avatarUrl: null,
        })
      : { userId: friendId, handle: '', avatarUrl: null };

    const [youDone, themDone, youPrefs, themPrefs] = await Promise.all([
      this.sessionsDone(userId, weekKey),
      this.sessionsDone(friendId, weekKey),
      this.prisma.userPreferences.findUnique({
        where: { userId },
        select: { weeklyGoalSessions: true },
      }),
      this.prisma.userPreferences.findUnique({
        where: { userId: friendId },
        select: { weeklyGoalSessions: true },
      }),
    ]);

    return {
      id: streak.id,
      status: streak.status as FriendStreakStatus,
      friend: card,
      count: streak.count,
      longest: streak.longest,
      freezes: streak.freezes,
      thisWeek: {
        you: { done: youDone, target: youPrefs?.weeklyGoalSessions ?? 4 },
        them: { done: themDone, target: themPrefs?.weeklyGoalSessions ?? 4 },
      },
    };
  }

  private async friendUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, handle: true, name: true, avatarKey: true, avatarUpdatedAt: true },
    });
  }

  /** Notification write that never breaks the caller's flow. */
  private async notify(
    userId: string,
    kind: NotificationKind,
    actorId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.notifications
      .notify(userId, kind, actorId, payload)
      .catch((err) => logger.warn(`streak notification ${kind} failed: ${String(err)}`));
  }
}
