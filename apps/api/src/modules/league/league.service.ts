import { Injectable } from '@nestjs/common';
import { logger } from '@luki-fitti/logger';
import { Arena, LeagueOutcome, LeagueStage, NotificationKind } from '@luki-fitti/common/enums';
import { berlinWeekKey, previousWeekKey, weekBounds } from '@luki-fitti/common/utils';
import type {
  Arena as DbArena,
  LeagueOutcome as DbOutcome,
  LeagueStage as DbStage,
} from '@luki-fitti/database';
import type {
  AdminLeaguePreviewDto,
  LeagueCurrentDto,
  LeagueFriendRowDto,
  LeagueHistoryEntryDto,
  LeagueMemberDto,
  LeaguePendingResultDto,
  LeagueZone,
} from '@luki-fitti/common/schemas';
import { Prisma } from '@luki-fitti/database';
import { PrismaService } from '../database/prisma.service';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { NotificationService } from '../notifications/notification.service';
import { StreakService } from '../battle/streak.service';
import { cardFor, resolveRelation, type CardSource } from '../social/relation.util';
import {
  ARENA_ORDER,
  LEAGUE_INACTIVE_WEEKS_LIMIT,
  arenaStep,
  computeArenaBuckets,
  outcomeCounts,
  outcomeFor,
  selectStage,
  zoneFor,
} from './league.util';

/** Models touched inside league transactions; satisfied by PrismaService and a tx client. */
type Tx = Pick<
  PrismaService,
  | 'leagueWeek'
  | 'leagueCohort'
  | 'leagueMembership'
  | 'weeklyScore'
  | 'user'
  | '$queryRaw'
  | '$executeRaw'
>;

interface RankedMember {
  userId: string;
  arenaAtStart: Arena;
  points: number;
  rank: number;
}

interface ScoreRow {
  userId: string;
  weekKey: string;
  points: number;
  updatedAt: Date;
}

/**
 * League weeks, cohorts and the weekly rollover. All writes happen lazily or in
 * the rollover transaction; the read routes only project existing rows.
 */
@Injectable()
export class LeagueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appSettings: AppSettingsService,
    private readonly notifications: NotificationService,
    private readonly streaks: StreakService,
  ) {}

  /**
   * Lazily creates the LeagueWeek row (stage + arena buckets) on first access.
   * Safe under concurrency via upsert; also used by the rollover job.
   */
  async ensureWeek(weekKey: string, tx: Tx | PrismaService = this.prisma) {
    const existing = await tx.leagueWeek.findUnique({ where: { weekKey } });
    if (existing) return existing;
    const shape = await this.computeWeekShape(weekKey, tx);
    return tx.leagueWeek.upsert({
      where: { weekKey },
      update: {},
      create: {
        weekKey,
        stage: shape.stage as DbStage,
        activeUsers: shape.activeUsers,
        buckets:
          shape.buckets === undefined ? Prisma.JsonNull : (shape.buckets as Prisma.InputJsonValue),
      },
    });
  }

  /** Stage + activeUsers + buckets for a week, from the previous week's scores. */
  private async computeWeekShape(
    weekKey: string,
    tx: Tx | PrismaService,
  ): Promise<{
    stage: LeagueStage;
    activeUsers: number;
    buckets: Record<Arena, number> | undefined;
  }> {
    const settings = await this.appSettings.get();
    const prevKey = previousWeekKey(weekKey);
    const activePerArena = settings.socialEnabled
      ? await this.activeArenaCounts(prevKey, settings.socialBetaUserIds, tx)
      : ({} as Record<Arena, number>);
    const activeUsers = ARENA_ORDER.reduce((sum, a) => sum + (activePerArena[a] ?? 0), 0);
    const stage = selectStage(
      settings.leagueStageMode,
      activeUsers,
      settings.leagueStage2MinUsers,
      settings.leagueStage3MinUsers,
    );
    return {
      stage,
      activeUsers,
      buckets: stage === LeagueStage.ARENAS ? computeArenaBuckets(activePerArena) : undefined,
    };
  }

  /** Counts of eligible users with points > 0 last week, grouped by arena. */
  private async activeArenaCounts(
    weekKey: string,
    betaUserIds: string[],
    tx: Tx | PrismaService,
  ): Promise<Record<Arena, number>> {
    const rows = await tx.$queryRaw<Array<{ arena: Arena; n: bigint }>>`
      SELECT u."arena" AS arena, COUNT(DISTINCT ws."userId")::bigint AS n
      FROM "WeeklyScore" ws
      JOIN "User" u ON u."id" = ws."userId"
      WHERE ws."weekKey" = ${weekKey}
        AND ws."points" > 0
        AND u."handle" IS NOT NULL
        AND u."socialPaused" = false
        AND (cardinality(${betaUserIds}::text[]) = 0 OR u."id" = ANY(${betaUserIds}::text[]))
      GROUP BY u."arena"
    `;
    const counts = {} as Record<Arena, number>;
    for (const arena of ARENA_ORDER) counts[arena] = 0;
    for (const row of rows) counts[row.arena as Arena] = Number(row.n);
    return counts;
  }

  /**
   * Places a user into a cohort of `weekKey` under a per-bucket advisory lock so
   * concurrent first-pointers can neither overflow a cohort nor duplicate the
   * membership. No-op for FRIENDS weeks and existing members.
   */
  async ensurePlaced(userId: string, weekKey: string): Promise<void> {
    const week = await this.ensureWeek(weekKey);
    if ((week.stage as LeagueStage) === LeagueStage.FRIENDS) return;
    const settings = await this.appSettings.get();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { arena: true },
    });
    if (!user) return;

    const buckets =
      (week.stage as LeagueStage) === LeagueStage.ARENAS
        ? ((week.buckets ?? {}) as Record<Arena, number>)
        : null;
    const bucket = buckets ? (buckets[user.arena as Arena] ?? 0) : null;
    const lockKey = `${weekKey}:${bucket ?? -1}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const existing = await tx.leagueMembership.findUnique({
        where: { userId_weekKey: { userId, weekKey } },
      });
      if (existing) return;

      let cohort = await tx.leagueCohort.findFirst({
        where: { weekKey, bucket },
        orderBy: { createdAt: 'desc' },
      });
      if (cohort) {
        const size = await tx.leagueMembership.count({ where: { cohortId: cohort.id } });
        if (size >= settings.leagueCohortSize) cohort = null;
      }
      cohort ??= await tx.leagueCohort.create({ data: { weekKey, bucket } });
      await tx.leagueMembership.create({
        data: { cohortId: cohort.id, userId, weekKey, arenaAtStart: user.arena },
      });
    });
  }

  /**
   * Weekly rollover: closes the previous Berlin week once (idempotent via
   * closedAt), ranks every cohort, writes final rank/points/outcome on the
   * memberships plus arena moves, applies the inactivity sweep, then prepares
   * the next week and notifies movers. Friend-streak evaluation runs afterwards
   * and does not depend on leagues being enabled.
   */
  async rollover(): Promise<void> {
    const settings = await this.appSettings.get();
    const now = new Date();
    const currentWeek = berlinWeekKey(now);
    if (settings.leaguesEnabled) {
      await this.closeAndPrepareWeeks(now, currentWeek, settings);
    }
    // Streaks count even when leagues are off — every week before the current
    // one counts as closed for evaluation.
    if (settings.streaksEnabled && settings.socialEnabled) {
      await this.streaks.evaluateClosedWeeks(currentWeek);
    }
  }

  /**
   * Closes every still-open league week (idempotent via closedAt), then creates
   * the new week and sends the collected outcome notifications.
   */
  private async closeAndPrepareWeeks(
    now: Date,
    currentWeek: string,
    settings: { socialBetaUserIds: string[]; socialEnabled: boolean },
  ): Promise<void> {
    const prevKey = previousWeekKey(currentWeek);

    // Close every week that is still open (usually just the previous one, but
    // a worker outage can leave several), oldest first, each in its own
    // transaction. The previous week is ensured even when its row is missing.
    const unclosed = await this.prisma.leagueWeek.findMany({
      where: { closedAt: null, weekKey: { lt: currentWeek } },
      orderBy: { weekKey: 'asc' },
      select: { weekKey: true },
    });
    const keysToClose = [...new Set([...unclosed.map((w) => w.weekKey), prevKey])].sort();

    const notify: Array<{
      userId: string;
      kind: NotificationKind;
      payload: Record<string, unknown>;
    }> = [];
    let closedAny = false;
    for (const [index, weekKey] of keysToClose.entries()) {
      const isLatest = index === keysToClose.length - 1;
      closedAny =
        (await this.closeWeek(weekKey, now, settings, isLatest ? notify : [])) || closedAny;
    }
    if (!closedAny) return;
    await this.ensureWeek(currentWeek);
    for (const n of notify) {
      await this.notifications
        .notify(n.userId, n.kind, null, n.payload)
        .catch((err) => logger.warn(`league outcome notification failed: ${String(err)}`));
    }
  }

  /**
   * Closes one open week: ranks cohorts, writes outcomes and arena moves,
   * sweeps inactivity, sets closedAt — all in one long-running transaction.
   * Outcome notifications for the week are appended to `notify`.
   */
  private async closeWeek(
    prevKey: string,
    now: Date,
    settings: { socialBetaUserIds: string[]; socialEnabled: boolean },
    notify: Array<{ userId: string; kind: NotificationKind; payload: Record<string, unknown> }>,
  ): Promise<boolean> {
    return this.prisma.$transaction(
      async (tx) => {
        let week = await tx.leagueWeek.findUnique({ where: { weekKey: prevKey } });
        if (week?.closedAt) return false;
        week ??= await this.ensureWeek(prevKey, tx);

        const scores = await tx.weeklyScore.findMany({ where: { weekKey: prevKey } });
        const scoreMap = new Map(scores.map((s) => [s.userId, s]));

        if ((week.stage as LeagueStage) !== LeagueStage.FRIENDS) {
          const cohorts = await tx.leagueCohort.findMany({
            where: { weekKey: prevKey },
            include: { members: true },
          });
          for (const cohort of cohorts) {
            const ranked = rankMembers(
              cohort.members.map((m) => ({
                userId: m.userId,
                arenaAtStart: m.arenaAtStart as Arena,
                points: scoreMap.get(m.userId)?.points ?? 0,
                updatedAt: scoreMap.get(m.userId)?.updatedAt ?? new Date(0),
              })),
            );
            const n = ranked.length;
            for (const member of ranked) {
              // 0-point members rank but earn no outcome (INACTIVE).
              const outcome =
                member.points <= 0
                  ? null
                  : outcomeFor(week.stage as LeagueStage, member.arenaAtStart, member.rank, n);
              const arenaAfter =
                outcome === LeagueOutcome.PROMOTED
                  ? arenaStep(member.arenaAtStart, 1)
                  : outcome === LeagueOutcome.DEMOTED
                    ? arenaStep(member.arenaAtStart, -1)
                    : member.arenaAtStart;
              await tx.leagueMembership.updateMany({
                where: { cohortId: cohort.id, userId: member.userId },
                data: {
                  finalPoints: member.points,
                  finalRank: member.rank,
                  outcome: outcome as DbOutcome | null,
                },
              });
              if (arenaAfter !== member.arenaAtStart) {
                await tx.user.update({
                  where: { id: member.userId },
                  data: { arena: arenaAfter as DbArena },
                });
              }
              if (outcome === LeagueOutcome.PROMOTED || outcome === LeagueOutcome.DEMOTED) {
                notify.push({
                  userId: member.userId,
                  kind:
                    outcome === LeagueOutcome.PROMOTED
                      ? NotificationKind.LEAGUE_PROMOTED
                      : NotificationKind.LEAGUE_DEMOTED,
                  payload: {
                    weekKey: prevKey,
                    fromArena: member.arenaAtStart,
                    toArena: arenaAfter,
                    rank: member.rank,
                  },
                });
              }
            }
          }
          await this.applyInactivitySweep(tx, prevKey, scoreMap, settings);
        }
        await tx.leagueWeek.update({ where: { weekKey: prevKey }, data: { closedAt: now } });
        return true;
      },
      // Ranking + per-member writes can exceed the 5 s default timeout.
      { maxWait: 10_000, timeout: 120_000 },
    );
  }

  /**
   * GLOBAL/ARENAS only: eligible users without a membership in the closed week
   * get leagueInactiveWeeks += 1; at the limit the arena drops one step and the
   * counter resets. Week members always reset to 0.
   */
  private async applyInactivitySweep(
    tx: Tx,
    weekKey: string,
    scoreMap: Map<string, ScoreRow>,
    settings: { socialBetaUserIds: string[]; socialEnabled: boolean },
  ): Promise<void> {
    if (!settings.socialEnabled) return;
    const beta = settings.socialBetaUserIds;
    const eligible = await tx.user.findMany({
      where: {
        handle: { not: null },
        socialPaused: false,
        ...(beta.length > 0 ? { id: { in: beta } } : {}),
      },
      select: { id: true, arena: true, leagueInactiveWeeks: true },
    });
    const memberIds = new Set(
      (
        await tx.leagueMembership.findMany({
          where: { weekKey },
          select: { userId: true },
        })
      ).map((m) => m.userId),
    );

    const resetIds: string[] = [];
    const missed: string[] = [];
    const demoted: Array<{ id: string; arena: Arena }> = [];
    for (const user of eligible) {
      if (memberIds.has(user.id)) {
        if (user.leagueInactiveWeeks > 0) resetIds.push(user.id);
      } else if (user.leagueInactiveWeeks + 1 >= LEAGUE_INACTIVE_WEEKS_LIMIT) {
        demoted.push({ id: user.id, arena: arenaStep(user.arena as Arena, -1) });
      } else {
        missed.push(user.id);
      }
    }
    if (resetIds.length > 0) {
      await tx.user.updateMany({
        where: { id: { in: resetIds } },
        data: { leagueInactiveWeeks: 0 },
      });
    }
    if (missed.length > 0) {
      await tx.user.updateMany({
        where: { id: { in: missed } },
        data: { leagueInactiveWeeks: { increment: 1 } },
      });
    }
    for (const user of demoted) {
      await tx.user.update({
        where: { id: user.id },
        data: { arena: user.arena as DbArena, leagueInactiveWeeks: 0 },
      });
    }
  }

  /**
   * Sunday-evening jobs: the league ending warning plus the friend-streak
   * reminder, each gated by its own feature flag.
   */
  async reminder(): Promise<void> {
    const settings = await this.appSettings.get();
    const weekKey = berlinWeekKey(new Date());
    if (settings.leaguesEnabled) {
      await this.leagueReminder(weekKey);
    }
    // Sunday-evening streak nudge, independent of the league week shape.
    if (settings.streaksEnabled && settings.socialEnabled) {
      await this.streaks.remind(weekKey);
    }
  }

  /**
   * Sunday-evening warning: members within two ranks of the promotion line or
   * inside the demotion zone get LEAGUE_ENDING, at most once per user per week.
   */
  private async leagueReminder(weekKey: string): Promise<void> {
    const week = await this.prisma.leagueWeek.findUnique({ where: { weekKey } });
    if (!week || (week.stage as LeagueStage) === LeagueStage.FRIENDS || week.closedAt) return;

    const weekStart = new Date(`${weekKey}T00:00:00.000Z`);
    const cohorts = await this.prisma.leagueCohort.findMany({
      where: { weekKey },
      include: { members: true },
    });
    const scores = await this.prisma.weeklyScore.findMany({ where: { weekKey } });
    const scoreMap = new Map(scores.map((s) => [s.userId, s]));

    for (const cohort of cohorts) {
      const ranked = rankMembers(
        cohort.members.map((m) => ({
          userId: m.userId,
          arenaAtStart: m.arenaAtStart as Arena,
          points: scoreMap.get(m.userId)?.points ?? 0,
          updatedAt: scoreMap.get(m.userId)?.updatedAt ?? new Date(0),
        })),
      );
      const n = ranked.length;
      const { promoteCount, demoteCount } = outcomeCounts(week.stage as LeagueStage, n);
      for (const member of ranked) {
        const nearPromote =
          promoteCount > 0 &&
          member.arenaAtStart !== Arena.TITAN &&
          member.rank > promoteCount &&
          member.rank <= promoteCount + 2;
        const inDemote =
          demoteCount > 0 && member.arenaAtStart !== Arena.BRONZE && member.rank > n - demoteCount;
        if (!nearPromote && !inDemote) continue;
        const already = await this.prisma.notification.findFirst({
          where: {
            userId: member.userId,
            kind: NotificationKind.LEAGUE_ENDING,
            createdAt: { gte: weekStart },
          },
          select: { id: true },
        });
        if (already) continue;
        const payload = inDemote
          ? { weekKey, inDemotionZone: true }
          : { weekKey, placesToPromotion: member.rank - promoteCount };
        await this.notifications
          .notify(member.userId, NotificationKind.LEAGUE_ENDING, null, payload)
          .catch((err) => logger.warn(`league reminder notification failed: ${String(err)}`));
      }
    }
  }

  /** GET /league/current — the viewer's arena cohort for the open week. */
  async current(userId: string): Promise<LeagueCurrentDto> {
    const weekKey = berlinWeekKey(new Date());
    const week = await this.ensureWeek(weekKey);
    const [user, pendingResult] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { arena: true } }),
      this.pendingResult(userId, weekKey),
    ]);

    const dto: LeagueCurrentDto = {
      weekKey,
      stage: week.stage as LeagueStage,
      endsAt: weekBounds(weekKey).end.toISOString(),
      arena: user.arena as Arena,
      cohort: null,
      pendingResult,
    };
    if ((week.stage as LeagueStage) === LeagueStage.FRIENDS) return dto;

    const membership = await this.prisma.leagueMembership.findUnique({
      where: { userId_weekKey: { userId, weekKey } },
      include: { cohort: { include: { members: true } } },
    });
    if (!membership) return dto;

    const scores = await this.prisma.weeklyScore.findMany({ where: { weekKey } });
    const scoreMap = new Map(scores.map((s) => [s.userId, s]));
    const ranked = rankMembers(
      membership.cohort.members.map((m) => ({
        userId: m.userId,
        arenaAtStart: m.arenaAtStart as Arena,
        points: scoreMap.get(m.userId)?.points ?? 0,
        updatedAt: scoreMap.get(m.userId)?.updatedAt ?? new Date(0),
      })),
    );
    const n = ranked.length;
    const { promoteCount, demoteCount } = outcomeCounts(week.stage as LeagueStage, n);
    const members = await this.memberDtos(userId, ranked, week.stage as LeagueStage);
    dto.cohort = { members, promoteCount, demoteCount };
    return dto;
  }

  /** Latest closed membership whose result the client has not shown yet. */
  private async pendingResult(
    userId: string,
    currentWeekKey: string,
  ): Promise<LeaguePendingResultDto | null> {
    const membership = await this.prisma.leagueMembership.findFirst({
      where: {
        userId,
        weekKey: { lt: currentWeekKey },
        resultSeenAt: null,
        outcome: { not: null },
      },
      orderBy: { weekKey: 'desc' },
    });
    if (!membership || membership.outcome === null) return null;
    const arenaAtStart = membership.arenaAtStart as Arena;
    const outcome = membership.outcome as LeagueOutcome;
    const toArena =
      outcome === LeagueOutcome.PROMOTED
        ? arenaStep(arenaAtStart, 1)
        : outcome === LeagueOutcome.DEMOTED
          ? arenaStep(arenaAtStart, -1)
          : arenaAtStart;
    return {
      weekKey: membership.weekKey,
      outcome,
      fromArena: arenaAtStart,
      toArena,
      rank: membership.finalRank ?? 0,
      points: membership.finalPoints ?? 0,
    };
  }

  /** GET /league/friends — friends (+ self) ranked by the week's points. */
  async friendsLeaderboard(
    userId: string,
    weekKey?: string,
  ): Promise<{ entries: LeagueFriendRowDto[] }> {
    const key = weekKey ?? berlinWeekKey(new Date());
    const friendships = await this.prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ userAId: userId }, { userBId: userId }] },
      select: { userAId: true, userBId: true },
    });
    const ids = friendships.map((f) => (f.userAId === userId ? f.userBId : f.userAId));
    ids.push(userId);

    const [scores, users] = await Promise.all([
      this.prisma.weeklyScore.findMany({ where: { weekKey: key, userId: { in: ids } } }),
      this.prisma.user.findMany({
        where: { id: { in: ids }, handle: { not: null } },
        select: { id: true, handle: true, name: true, avatarKey: true, avatarUpdatedAt: true },
      }),
    ]);
    const scoreMap = new Map(scores.map((s) => [s.userId, s]));
    const ranked = users
      .map((u) => ({
        userId: u.id,
        points: scoreMap.get(u.id)?.points ?? 0,
        updatedAt: scoreMap.get(u.id)?.updatedAt ?? new Date(0),
      }))
      .sort((a, b) => b.points - a.points || a.updatedAt.getTime() - b.updatedAt.getTime());

    const cards = await this.cardsFor(userId, users);
    return {
      entries: ranked
        .filter((r) => cards.has(r.userId))
        .map((r, i) => ({
          rank: i + 1,
          card: cards.get(r.userId)!,
          points: r.points,
          isSelf: r.userId === userId,
        })),
    };
  }

  /** GET /league/history — the viewer's last 12 closed-week memberships. */
  async history(userId: string): Promise<{ entries: LeagueHistoryEntryDto[] }> {
    const currentWeek = berlinWeekKey(new Date());
    const memberships = await this.prisma.leagueMembership.findMany({
      where: { userId, weekKey: { lt: currentWeek } },
      orderBy: { weekKey: 'desc' },
      take: 12,
    });
    return {
      entries: memberships.map((m) => ({
        weekKey: m.weekKey,
        arena: m.arenaAtStart as Arena,
        rank: m.finalRank ?? 0,
        outcome: m.outcome as LeagueOutcome | null,
        points: m.finalPoints ?? 0,
      })),
    };
  }

  /** POST /league/results/:weekKey/seen — the celebration was shown. */
  async markResultSeen(userId: string, weekKey: string): Promise<{ updated: number }> {
    const result = await this.prisma.leagueMembership.updateMany({
      where: { userId, weekKey, resultSeenAt: null },
      data: { resultSeenAt: new Date() },
    });
    return { updated: result.count };
  }

  /**
   * Admin dry-run: the stage/buckets the next rollover would pick for the new
   * week plus the projected outcomes of the currently open week. Writes nothing.
   */
  async adminPreview(): Promise<AdminLeaguePreviewDto> {
    const now = new Date();
    const nextKey = berlinWeekKey(weekBounds(berlinWeekKey(now)).end);
    const shape = await this.computeWeekShape(nextKey, this.prisma);

    const openKey = berlinWeekKey(now);
    const openWeek = await this.prisma.leagueWeek.findUnique({ where: { weekKey: openKey } });
    let openWeekOutcomes: AdminLeaguePreviewDto['openWeekOutcomes'] = null;
    if (openWeek && (openWeek.stage as LeagueStage) !== LeagueStage.FRIENDS) {
      const cohorts = await this.prisma.leagueCohort.findMany({
        where: { weekKey: openKey },
        include: { members: true },
      });
      openWeekOutcomes = {
        weekKey: openKey,
        cohorts: cohorts.map((cohort) => {
          const n = cohort.members.length;
          const { promoteCount, demoteCount } = outcomeCounts(openWeek.stage as LeagueStage, n);
          return { bucket: cohort.bucket, promoteCount, demoteCount, size: n };
        }),
      };
    }

    return {
      nextWeekKey: nextKey,
      stage: shape.stage,
      activeUsers: shape.activeUsers,
      buckets: shape.buckets ?? null,
      openWeekOutcomes,
    };
  }

  /** Maps ranked members to response rows with privacy-aware cards + zones. */
  private async memberDtos(
    viewerId: string,
    ranked: RankedMember[],
    stage: LeagueStage,
  ): Promise<LeagueMemberDto[]> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: ranked.map((m) => m.userId) }, handle: { not: null } },
      select: { id: true, handle: true, name: true, avatarKey: true, avatarUpdatedAt: true },
    });
    const cards = await this.cardsFor(viewerId, users);
    const n = ranked.length;
    const zoneOf = (m: RankedMember): LeagueZone => zoneFor(stage, m.arenaAtStart, m.rank, n);
    // Members who are blocked from the viewer drop out of the viewer's list but
    // keep their rank (ranks are computed over the full cohort).
    return ranked
      .filter((m) => cards.has(m.userId))
      .map((m) => ({
        rank: m.rank,
        card: cards.get(m.userId)!,
        points: m.points,
        isSelf: m.userId === viewerId,
        zone: zoneOf(m),
      }));
  }

  /**
   * Batch-computes cards for a set of users: one friendship query and one block
   * query for the viewer, then cardFor per relation (deny-by-default).
   */
  private async cardsFor(
    viewerId: string,
    users: CardSource[],
  ): Promise<Map<string, ReturnType<typeof cardFor>>> {
    const ids = users.map((u) => u.id);
    const [friendships, blocks] = await Promise.all([
      this.prisma.friendship.findMany({
        where: { OR: [{ userAId: viewerId }, { userBId: viewerId }] },
        select: { userAId: true, userBId: true, status: true, requestedById: true },
      }),
      this.prisma.userBlock.findMany({
        where: {
          OR: [
            { blockerId: viewerId, blockedId: { in: ids } },
            { blockedId: viewerId, blockerId: { in: ids } },
          ],
        },
        select: { blockerId: true, blockedId: true },
      }),
    ]);
    const friends = new Map(
      friendships.map((f) => [f.userAId === viewerId ? f.userBId : f.userAId, f]),
    );
    const blocked = new Set(
      blocks.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId)),
    );
    const cards = new Map<string, ReturnType<typeof cardFor>>();
    for (const user of users) {
      if (!user.handle) continue;
      const friendship = friends.get(user.id);
      const relation = resolveRelation(viewerId, user.id, {
        friendship: friendship
          ? {
              status: friendship.status as 'PENDING' | 'ACCEPTED',
              requestedById: friendship.requestedById,
            }
          : null,
        blocked: blocked.has(user.id),
      });
      if (relation === 'BLOCKED') continue;
      cards.set(user.id, cardFor(user, relation));
    }
    return cards;
  }
}

/** Points desc; ties go to whoever reached their score first. */
function rankMembers(
  members: Array<{ userId: string; arenaAtStart: Arena; points: number; updatedAt: Date }>,
): RankedMember[] {
  return [...members]
    .sort(
      (a, b) =>
        b.points - a.points ||
        a.updatedAt.getTime() - b.updatedAt.getTime() ||
        a.userId.localeCompare(b.userId),
    )
    .map((m, i) => ({
      userId: m.userId,
      arenaAtStart: m.arenaAtStart,
      points: m.points,
      rank: i + 1,
    }));
}
