import { Injectable, NotFoundException } from '@nestjs/common';
import { logger } from '@luki-fitti/logger';
import { NotificationKind, RaidKind, RaidStatus, TrophyKind } from '@luki-fitti/common/enums';
import { RAID_BOSSES, bossForWeek, raidDamage } from '@luki-fitti/common/raid';
import { berlinDayKey, berlinWeekKey, previousWeekKey, weekBounds } from '@luki-fitti/common/utils';
import type { EffortPointsBreakdown } from '@luki-fitti/common/utils';
import type {
  RaidBossDto,
  RaidDetailDto,
  RaidDto,
  RaidFeedDto,
  RaidFeedHitDto,
  RaidListDto,
  RaidResultDto,
  RaidTopEntryDto,
} from '@luki-fitti/common/schemas';
import { PrismaService } from '../database/prisma.service';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { NotificationService } from '../notifications/notification.service';
import { cardFor, type CardSource } from '../social/relation.util';
import { relationBetween } from '../battle/battle.util';

export interface RaidRow {
  id: string;
  kind: string;
  squadId: string | null;
  bossSlug: string;
  difficulty: string | null;
  weekKey: string;
  startsAt: Date;
  endsAt: Date;
  maxHp: number;
  damage: number;
  phase: number;
  status: string;
  defeatedAt: Date | null;
  finalBlowUserId: string | null;
  squad?: { id: string; name: string } | null;
}

/** Stored alongside the ledger breakdown so raid damage needn't recompute sessions. */
interface StoredBreakdown extends EffortPointsBreakdown {
  pointsByWeakSpot?: Record<string, number>;
  topExercise?: string | null;
}

/** Enrage thresholds as remaining-HP fractions; index = phase - 1. */
const PHASE_THRESHOLDS = [0.75, 0.5, 0.25] as const;
/** Damage cap per user per raid per Berlin day. */
const DAILY_DAMAGE_FACTOR = 2;
const TX_OPTIONS = { maxWait: 10_000, timeout: 60_000 } as const;

const bossPayload = (bossSlug: string) => ({ bossSlug });

@Injectable()
export class RaidService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appSettings: AppSettingsService,
    private readonly notifications: NotificationService,
  ) {}

  /** GET /raids/bosses — the roster for the squad boss picker. */
  bosses(): RaidBossDto[] {
    return RAID_BOSSES.map(({ slug, name, lore, weakTo }) => ({ slug, name, lore, weakTo }));
  }

  /** GET /raids/current — lazily spawns this week's community raid if missing. */
  async current(userId: string): Promise<RaidListDto> {
    const settings = await this.appSettings.get();
    const weekKey = berlinWeekKey(new Date());

    let community: RaidRow | null = (await this.prisma.raid.findFirst({
      where: { kind: 'COMMUNITY', weekKey },
      include: { squad: { select: { id: true, name: true } } },
    })) as RaidRow | null;
    if (!community) {
      community = (await this.spawnCommunityRaid(weekKey, settings)) ?? null;
      if (!community) {
        community = (await this.prisma.raid.findFirst({
          where: { kind: 'COMMUNITY', weekKey },
          include: { squad: { select: { id: true, name: true } } },
        })) as RaidRow | null;
      }
    }

    const [squads, pending] = await Promise.all([
      this.prisma.raid.findMany({
        where: { kind: 'SQUAD', weekKey, squad: { members: { some: { userId } } } },
        include: { squad: { select: { id: true, name: true } } },
      }),
      this.pendingResults(userId),
    ]);

    return {
      community: community ? await this.dto(community as RaidRow, userId) : null,
      squads: await Promise.all(squads.map((r) => this.dto(r as RaidRow, userId))),
      pendingResults: pending,
    };
  }

  /** Finished raids the user hit and has not seen the result of yet. */
  private async pendingResults(userId: string): Promise<RaidResultDto[]> {
    const hits = await this.prisma.raidHit.findMany({
      where: { userId, damage: { gt: 0 }, raid: { status: { in: ['DEFEATED', 'ESCAPED'] } } },
      include: {
        raid: { select: { id: true, status: true, bossSlug: true, finalBlowUserId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const results: RaidResultDto[] = [];
    const seenRaid = new Set<string>();
    for (const hit of hits) {
      const raid = hit.raid;
      if (seenRaid.has(raid.id)) continue;
      seenRaid.add(raid.id);
      const seen = await this.prisma.raidParticipantSeen.findUnique({
        where: { raidId_userId: { raidId: raid.id, userId } },
      });
      if (seen) continue;
      const boss = RAID_BOSSES.find((b) => b.slug === raid.bossSlug);
      const crown = await this.prisma.trophy.findFirst({
        where: { userId, kind: TrophyKind.RAID_CROWN, refId: raid.id },
      });
      const you = await this.userDamage(raid.id, userId);
      results.push({
        raidId: raid.id,
        outcome: raid.status === 'DEFEATED' ? 'DEFEATED' : 'ESCAPED',
        bossSlug: raid.bossSlug,
        bossName: boss?.name.en ?? raid.bossSlug,
        crownRank: crown?.tier ? Number(crown.tier) : null,
        finalBlow: raid.finalBlowUserId === userId,
        you,
      });
    }
    return results;
  }

  /** GET /raids/:id — detail with top dealers and the caller's own standing. */
  async detail(userId: string, raidId: string): Promise<RaidDetailDto> {
    const raid = await this.prisma.raid.findUnique({
      where: { id: raidId },
      include: { squad: { select: { id: true, name: true } } },
    });
    if (!raid) throw new NotFoundException('Raid not found');
    await this.assertSquadAccess(userId, raid as RaidRow);

    const grouped = await this.prisma.raidHit.groupBy({
      by: ['userId'],
      where: { raidId, damage: { gt: 0 } },
      _sum: { damage: true },
      orderBy: { _sum: { damage: 'desc' } },
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: grouped.map((g) => g.userId) } },
      select: { id: true, handle: true, name: true, avatarKey: true, avatarUpdatedAt: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    // Ranked list, filtered per viewer (blocked users never surface).
    const ranked: RaidTopEntryDto[] = [];
    for (const g of grouped) {
      const user = byId.get(g.userId);
      if (!user?.handle) continue;
      const relation = await relationBetween(this.prisma, userId, g.userId);
      if (relation === 'BLOCKED') continue;
      ranked.push({ card: cardFor(user, relation), damage: g._sum.damage ?? 0, rank: 0 });
    }
    ranked.forEach((entry, i) => (entry.rank = i + 1));

    const you = ranked.find((e) => e.card.userId === userId) ?? null;
    const trophyCount = await this.prisma.trophy.count({ where: { userId, refId: raidId } });

    return {
      ...(await this.dto(raid as RaidRow, userId)),
      top: ranked.slice(0, 5),
      you: {
        damage: you?.damage ?? 0,
        rank: you?.rank ?? null,
        trophies: trophyCount,
      },
    };
  }

  /** GET /raids/:id/feed — newest hits; workout content is friends/self only. */
  async feed(userId: string, raidId: string, cursor?: string): Promise<RaidFeedDto> {
    const raid = await this.prisma.raid.findUnique({
      where: { id: raidId },
      include: { squad: { select: { id: true } } },
    });
    if (!raid) throw new NotFoundException('Raid not found');
    await this.assertSquadAccess(userId, raid as RaidRow);

    const cursorRow = cursor
      ? await this.prisma.raidHit.findUnique({ where: { id: cursor } })
      : null;
    const hits = await this.prisma.raidHit.findMany({
      where: {
        raidId,
        damage: { gt: 0 },
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
      take: 21,
      include: {
        user: {
          select: { id: true, handle: true, name: true, avatarKey: true, avatarUpdatedAt: true },
        },
      },
    });

    const items: RaidFeedHitDto[] = [];
    for (const hit of hits) {
      const user = hit.user as CardSource;
      if (!user.handle) continue;
      const relation = await relationBetween(this.prisma, userId, user.id);
      if (relation === 'BLOCKED') continue;
      items.push({
        card: cardFor(user, relation),
        damage: hit.damage,
        weakSpotDamage: hit.weakSpotDamage,
        topExercise: relation === 'SELF' || relation === 'FRIEND' ? hit.topExercise : null,
        at: hit.createdAt.toISOString(),
      });
      if (items.length >= 20) break;
    }
    const nextCursor = hits.length > 20 ? (hits[19]?.id ?? null) : null;
    return { items, nextCursor };
  }

  /** POST /raids/:id/seen — the result celebration is shown once per participant. */
  async markSeen(userId: string, raidId: string): Promise<{ seen: true }> {
    const raid = await this.prisma.raid.findUnique({ where: { id: raidId } });
    if (!raid) throw new NotFoundException('Raid not found');
    await this.assertSquadAccess(userId, raid as RaidRow);
    await this.prisma.raidParticipantSeen.upsert({
      where: { raidId_userId: { raidId, userId } },
      update: {},
      create: { raidId, userId },
    });
    return { seen: true };
  }

  /**
   * Applies a freshly synced session's EP to every ACTIVE raid the user takes
   * part in (community + their squads), honouring the weekly window and the
   * per-user-per-day cap. Called best-effort from PointsService.recordSession.
   */
  async applySession(userId: string, sessionId: string): Promise<void> {
    const settings = await this.appSettings.get();
    if (!settings.raidsEnabled || !settings.socialEnabled) return;
    const [entry, session] = await Promise.all([
      this.prisma.effortPointEntry.findUnique({ where: { sessionId } }),
      this.prisma.workoutSession.findUnique({
        where: { id: sessionId },
        select: { completedAt: true },
      }),
    ]);
    if (!entry || entry.points <= 0 || !session?.completedAt) return;
    const completedAt = session.completedAt;
    const stored = (entry.breakdown ?? {}) as unknown as StoredBreakdown;
    const weakSpot = stored.pointsByWeakSpot ?? {};

    const raids = await this.prisma.raid.findMany({
      where: {
        status: 'ACTIVE',
        startsAt: { lte: completedAt },
        endsAt: { gt: completedAt },
        OR: [{ kind: 'COMMUNITY' }, { kind: 'SQUAD', squad: { members: { some: { userId } } } }],
      },
    });

    const dayKey = berlinDayKey(completedAt);
    const dayCap = DAILY_DAMAGE_FACTOR * settings.epDailyCap;
    for (const raid of raids) {
      const boss = RAID_BOSSES.find((b) => b.slug === raid.bossSlug);
      if (!boss) continue;
      const weakBonus = boss.weakTo.reduce((sum, w) => sum + (weakSpot[w] ?? 0), 0);
      const raw = raidDamage(entry.points, weakSpot, boss);
      const { applied, defeated } = await this.applyHit(
        raid.id,
        userId,
        sessionId,
        raw,
        weakBonus,
        stored.topExercise ?? null,
        dayKey,
        dayCap,
      );
      if (applied > 0) {
        await this.postHitNotifications(raid as RaidRow, defeated);
      }
    }
  }

  /**
   * Deletes a session's hits and refunds the damage — unless the raid is already
   * DEFEATED (defeat is final). Called best-effort from PointsService.removeSession.
   */
  async removeSession(userId: string, sessionId: string): Promise<void> {
    const hits = await this.prisma.raidHit.findMany({
      where: { sessionId, userId },
      include: { raid: { select: { id: true, status: true } } },
    });
    for (const hit of hits) {
      await this.prisma
        .$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Raid" WHERE id = ${hit.raidId} FOR UPDATE`;
          const raid = await tx.raid.findUnique({ where: { id: hit.raidId } });
          await tx.raidHit.delete({ where: { id: hit.id } });
          if (raid && raid.status !== 'DEFEATED') {
            await tx.raid.update({
              where: { id: hit.raidId },
              data: { damage: Math.max(0, raid.damage - hit.damage) },
            });
          }
        }, TX_OPTIONS)
        .catch((err) => logger.warn(`raid hit removal failed: ${String(err)}`));
    }
  }

  /**
   * Weekly rollover step (called from LeagueService.rollover after streaks):
   * escapes last week's unfinished raids, then spawns the new community raid.
   */
  async rollover(currentWeek: string): Promise<void> {
    const settings = await this.appSettings.get();
    const { start } = weekBounds(currentWeek);

    const expired = await this.prisma.raid.findMany({
      where: { status: 'ACTIVE', endsAt: { lte: start } },
    });
    for (const raid of expired) {
      await this.prisma.raid.update({ where: { id: raid.id }, data: { status: 'ESCAPED' } });
      const participants = await this.participantIds(raid.id);
      for (const userId of participants) {
        await this.notify(userId, NotificationKind.RAID_ESCAPED, null, {
          ...bossPayload(raid.bossSlug),
          url: '/social/raids',
        });
      }
    }

    await this.spawnCommunityRaid(currentWeek, settings);
  }

  /**
   * Creates the week's community raid (idempotent via the partial unique index)
   * and notifies every eligible user active in the last 4 closed weeks.
   * Returns the created raid, or null when it already existed.
   */
  async spawnCommunityRaid(
    weekKey: string,
    settings?: Awaited<ReturnType<AppSettingsService['get']>>,
  ): Promise<RaidRow | null> {
    const resolved = settings ?? (await this.appSettings.get());
    const boss = bossForWeek(weekKey);
    const { start, end } = weekBounds(weekKey);

    const closedWeeks = [1, 2, 3, 4].map((i) => {
      let key = weekKey;
      for (let j = 0; j < i; j++) key = previousWeekKey(key);
      return key;
    });
    const active = await this.prisma.weeklyScore.findMany({
      where: { weekKey: { in: closedWeeks }, points: { gt: 0 } },
      select: { userId: true },
      distinct: ['userId'],
    });
    const candidates = await this.prisma.user.findMany({
      where: {
        id: { in: active.map((a) => a.userId) },
        handle: { not: null },
        socialPaused: false,
      },
      select: { id: true },
    });
    const eligible = candidates.filter(
      (u) => resolved.socialBetaUserIds.length === 0 || resolved.socialBetaUserIds.includes(u.id),
    );
    const maxHp = Math.max(resolved.raidMinHp, eligible.length * resolved.raidHpPerActiveUser);

    try {
      const raid = await this.prisma.raid.create({
        data: {
          kind: 'COMMUNITY',
          bossSlug: boss.slug,
          weekKey,
          startsAt: start,
          endsAt: end,
          maxHp,
        },
        include: { squad: { select: { id: true, name: true } } },
      });
      for (const user of eligible) {
        await this.notify(user.id, NotificationKind.RAID_SPAWNED, null, {
          ...bossPayload(boss.slug),
          url: '/social/raids',
        });
      }
      return raid as RaidRow;
    } catch (err) {
      // Concurrent spawn (lazy + rollover): the unique index picks one winner.
      logger.warn(`community raid spawn skipped for ${weekKey}: ${String(err)}`);
      return null;
    }
  }

  // ── internals ────────────────────────────────────────────────────────────

  /**
   * Inserts/updates the hit inside a raid-row lock, applies the damage delta,
   * advances phase and marks defeat. Returns the applied damage plus whether
   * this hit landed the final blow.
   */
  private async applyHit(
    raidId: string,
    userId: string,
    sessionId: string,
    rawDamage: number,
    weakSpotDamage: number,
    topExercise: string | null,
    dayKey: string,
    dayCap: number,
  ): Promise<{ applied: number; defeated: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Raid" WHERE id = ${raidId} FOR UPDATE`;
      const raid = await tx.raid.findUnique({ where: { id: raidId } });
      if (!raid || raid.status !== 'ACTIVE') return { applied: 0, defeated: false };

      const [existing, dayUsed] = await Promise.all([
        tx.raidHit.findUnique({ where: { raidId_sessionId: { raidId, sessionId } } }),
        tx.raidHit.aggregate({
          where: { raidId, userId, dayKey },
          _sum: { damage: true },
        }),
      ]);
      // A re-sync can only lower the hit (min with the first computed value).
      const uncapped = existing ? Math.min(existing.firstDamage, rawDamage) : rawDamage;
      const alreadyUsed = (dayUsed._sum.damage ?? 0) - (existing?.damage ?? 0);
      const capped = Math.min(uncapped, Math.max(0, dayCap - alreadyUsed));
      const delta = capped - (existing?.damage ?? 0);
      if (existing) {
        await tx.raidHit.update({
          where: { id: existing.id },
          data: { damage: capped, weakSpotDamage, topExercise },
        });
      } else {
        await tx.raidHit.create({
          data: {
            raidId,
            userId,
            sessionId,
            damage: capped,
            firstDamage: uncapped,
            weakSpotDamage,
            topExercise,
            dayKey,
          },
        });
      }
      const damage = raid.damage + delta;
      const phase = PHASE_THRESHOLDS.filter(
        (t) => raid.maxHp - damage <= raid.maxHp * (1 - t),
      ).length;
      const defeated = damage >= raid.maxHp;
      await tx.raid.update({
        where: { id: raidId },
        data: {
          damage,
          phase: Math.max(raid.phase, phase),
          ...(defeated
            ? { status: 'DEFEATED', defeatedAt: new Date(), finalBlowUserId: userId }
            : {}),
        },
      });
      return { applied: capped, defeated };
    }, TX_OPTIONS);
  }

  /** Post-commit side effects of a hit: phase pushes + defeat processing. */
  private async postHitNotifications(raid: RaidRow, defeated: boolean): Promise<void> {
    const fresh = await this.prisma.raid.findUnique({ where: { id: raid.id } });
    if (!fresh) return;
    if (defeated) {
      await this.processDefeat(fresh.id);
      return;
    }
    const newPhases = fresh.phase - raid.phase;
    if (newPhases > 0) {
      const participants = await this.participantIds(fresh.id);
      const percent = (PHASE_THRESHOLDS[fresh.phase - 1] ?? 0) * 100;
      for (const userId of participants) {
        await this.notify(userId, NotificationKind.RAID_PHASE, null, {
          ...bossPayload(fresh.bossSlug),
          percent,
          url: '/social/raids',
        });
      }
    }
  }

  /**
   * Defeat side effects, idempotent via trophy uniqueness: RAID_DEFEATED for
   * every participant, RAID_CROWN for the top 3 (ties by earliest last hit),
   * RAID_FINAL_BLOW for the closer, plus the RAID_DEFEATED push.
   */
  private async processDefeat(raidId: string): Promise<void> {
    const raid = await this.prisma.raid.findUnique({ where: { id: raidId } });
    if (!raid) return;
    const grouped = await this.prisma.raidHit.groupBy({
      by: ['userId'],
      where: { raidId, damage: { gt: 0 } },
      _sum: { damage: true },
      _max: { createdAt: true },
      orderBy: [{ _sum: { damage: 'desc' } }, { _max: { createdAt: 'asc' } }],
    });
    const participants = grouped.map((g) => g.userId);
    const awards: Array<{ userId: string; kind: TrophyKind; tier?: string }> = participants.map(
      (userId) => ({ userId, kind: TrophyKind.RAID_DEFEATED }),
    );
    grouped.slice(0, 3).forEach((g, i) => {
      awards.push({ userId: g.userId, kind: TrophyKind.RAID_CROWN, tier: String(i + 1) });
    });
    if (raid.finalBlowUserId) {
      awards.push({ userId: raid.finalBlowUserId, kind: TrophyKind.RAID_FINAL_BLOW });
    }
    await this.prisma.trophy.createMany({
      data: awards.map((a) => ({
        userId: a.userId,
        kind: a.kind,
        refId: raidId,
        tier: a.tier ?? null,
      })),
      skipDuplicates: true,
    });
    for (const userId of participants) {
      await this.notify(userId, NotificationKind.RAID_DEFEATED, null, {
        ...bossPayload(raid.bossSlug),
        url: '/social/raids',
      });
    }
  }

  /** Users with at least one damaging hit on the raid. */
  private async participantIds(raidId: string): Promise<string[]> {
    const grouped = await this.prisma.raidHit.groupBy({
      by: ['userId'],
      where: { raidId, damage: { gt: 0 } },
    });
    return grouped.map((g) => g.userId);
  }

  private async userDamage(raidId: string, userId: string): Promise<number> {
    const agg = await this.prisma.raidHit.aggregate({
      where: { raidId, userId },
      _sum: { damage: true },
    });
    return agg._sum.damage ?? 0;
  }

  /** Squad raids are members-only; community raids are open to everyone social. */
  private async assertSquadAccess(userId: string, raid: RaidRow): Promise<void> {
    if ((raid.kind as RaidKind) !== 'SQUAD') return;
    const member = await this.prisma.squadMember.findUnique({
      where: { squadId_userId: { squadId: raid.squadId!, userId } },
    });
    if (!member) throw new NotFoundException('Raid not found');
  }

  /** Raid → API shape, including the viewer-scoped final-blow card. */
  async dto(raid: RaidRow, viewerId: string): Promise<RaidDto> {
    let finalBlow: RaidDto['finalBlow'] = null;
    if (raid.finalBlowUserId) {
      const user = await this.prisma.user.findUnique({
        where: { id: raid.finalBlowUserId },
        select: { id: true, handle: true, name: true, avatarKey: true, avatarUpdatedAt: true },
      });
      if (user?.handle) {
        const relation = await relationBetween(this.prisma, viewerId, user.id);
        if (relation !== 'BLOCKED') finalBlow = cardFor(user, relation);
      }
    }
    return {
      id: raid.id,
      kind: raid.kind as RaidKind,
      squad: raid.squad ?? null,
      bossSlug: raid.bossSlug,
      difficulty: (raid.difficulty as RaidDto['difficulty']) ?? null,
      weekKey: raid.weekKey,
      endsAt: raid.endsAt.toISOString(),
      maxHp: raid.maxHp,
      damage: raid.damage,
      phase: raid.phase,
      status: raid.status as RaidStatus,
      defeatedAt: raid.defeatedAt?.toISOString() ?? null,
      finalBlow,
    };
  }

  /** Notification write that never breaks the caller's flow. */
  private async notify(
    userId: string,
    kind: NotificationKind,
    actorId: string | null,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.notifications
      .notify(userId, kind, actorId, payload)
      .catch((err) => logger.warn(`raid notification ${kind} failed: ${String(err)}`));
  }
}
