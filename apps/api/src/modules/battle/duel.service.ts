import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { logger } from '@luki-fitti/logger';
import { DuelStatus, NotificationKind } from '@luki-fitti/common/enums';
import { addBerlinDays, berlinDayKey, berlinMidnight } from '@luki-fitti/common/utils';
import type {
  DuelDetailDto,
  DuelItemDto,
  DuelListDto,
  DuelOutcome,
} from '@luki-fitti/common/schemas';
import type { Duel as DbDuel } from '@luki-fitti/database';
import { PrismaService } from '../database/prisma.service';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { NotificationService } from '../notifications/notification.service';
import { cardBetween, dayKeyDiff, relationBetween } from './battle.util';

/** PENDING + ACTIVE duels one user may be part of. */
const MAX_DUELS_PER_USER = 3;
/** Unanswered challenges expire after 48 h. */
const INVITE_TTL_MS = 48 * 60 * 60 * 1000;
const RECENT_LIMIT = 10;

/** Models touched inside duel transactions; satisfied by PrismaService and a tx client. */
type Tx = Pick<PrismaService, 'duel' | 'effortPointEntry' | 'trophy'>;

const OPEN_STATUSES: DuelStatus[] = [DuelStatus.PENDING, DuelStatus.ACTIVE];
const ACTIVE_PAIR = { status: { in: OPEN_STATUSES } };

@Injectable()
export class DuelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appSettings: AppSettingsService,
    private readonly notifications: NotificationService,
  ) {}

  // ── Challenge lifecycle ────────────────────────────────────────────────────

  /** POST /duels — friends only, max 3 open duels per user, one per pair. */
  async challenge(challengerId: string, opponentId: string): Promise<DuelItemDto> {
    if (challengerId === opponentId) {
      throw new BadRequestException('Cannot duel yourself');
    }
    const [relation, opponent] = await Promise.all([
      relationBetween(this.prisma, challengerId, opponentId),
      this.prisma.user.findUnique({
        where: { id: opponentId },
        select: { id: true, handle: true, name: true, avatarKey: true, avatarUpdatedAt: true },
      }),
    ]);
    if (relation !== 'FRIEND' || !opponent?.handle) {
      throw new NotFoundException('Duels are for friends');
    }

    const [mine, pair] = await Promise.all([
      this.prisma.duel.count({
        where: {
          ...ACTIVE_PAIR,
          OR: [{ challengerId }, { opponentId: challengerId }],
        },
      }),
      this.prisma.duel.findFirst({
        where: {
          ...ACTIVE_PAIR,
          OR: [
            { challengerId, opponentId },
            { challengerId: opponentId, opponentId: challengerId },
          ],
        },
        select: { id: true },
      }),
    ]);
    if (mine >= MAX_DUELS_PER_USER) {
      throw new ConflictException('Duel limit reached');
    }
    if (pair) throw new ConflictException('You already have a duel with this friend');

    const duel = await this.prisma.duel.create({
      data: { challengerId, opponentId },
    });
    await this.notify(opponentId, NotificationKind.DUEL_INVITE, challengerId, {
      duelId: duel.id,
      url: '/social/duels',
    });
    return this.itemFor(challengerId, duel);
  }

  /**
   * Opponent accepts: the duel runs for the next 7 Berlin days starting
   * tomorrow. The status guard makes a double-accept a no-op-ish 404.
   */
  async accept(userId: string, duelId: string): Promise<DuelItemDto> {
    const duel = await this.participantDuel(userId, duelId);
    if (duel.opponentId !== userId || duel.status !== DuelStatus.PENDING) {
      throw new NotFoundException('No pending challenge');
    }
    if (duel.createdAt.getTime() < Date.now() - INVITE_TTL_MS) {
      await this.prisma.duel.updateMany({
        where: { id: duel.id, status: DuelStatus.PENDING },
        data: { status: DuelStatus.EXPIRED, respondedAt: new Date() },
      });
      throw new NotFoundException('Challenge expired');
    }
    if ((await relationBetween(this.prisma, duel.challengerId, duel.opponentId)) !== 'FRIEND') {
      throw new NotFoundException('Duels are for friends');
    }

    const startDayKey = addBerlinDays(berlinDayKey(new Date()), 1);
    const endDayKey = addBerlinDays(startDayKey, 7);
    const accepted = await this.prisma.duel.updateMany({
      where: { id: duel.id, status: DuelStatus.PENDING },
      data: {
        status: DuelStatus.ACTIVE,
        respondedAt: new Date(),
        startDayKey,
        endDayKey,
        startsAt: berlinMidnight(startDayKey),
        endsAt: berlinMidnight(endDayKey),
      },
    });
    if (accepted.count === 0) throw new NotFoundException('No pending challenge');

    await this.notify(duel.challengerId, NotificationKind.DUEL_ACCEPTED, userId, {
      duelId: duel.id,
      url: '/social/duels',
    });
    return this.itemFor(userId, { ...duel, status: DuelStatus.ACTIVE, startDayKey, endDayKey });
  }

  /** Opponent declines — silent for the challenger. */
  async decline(userId: string, duelId: string): Promise<void> {
    const duel = await this.participantDuel(userId, duelId);
    if (duel.opponentId !== userId || duel.status !== DuelStatus.PENDING) {
      throw new NotFoundException('No pending challenge');
    }
    await this.prisma.duel.update({
      where: { id: duel.id },
      data: { status: DuelStatus.DECLINED, respondedAt: new Date() },
    });
  }

  /** Challenger withdraws a still-pending challenge — silent. */
  async cancel(userId: string, duelId: string): Promise<void> {
    const duel = await this.participantDuel(userId, duelId);
    if (duel.challengerId !== userId || duel.status !== DuelStatus.PENDING) {
      throw new NotFoundException('No pending challenge');
    }
    await this.prisma.duel.update({
      where: { id: duel.id },
      data: { status: DuelStatus.CANCELLED, respondedAt: new Date() },
    });
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  /** GET /duels — active, incoming/outgoing challenges, recent results. */
  async list(userId: string): Promise<DuelListDto> {
    const duels = await this.prisma.duel.findMany({
      where: { OR: [{ challengerId: userId }, { opponentId: userId }] },
      orderBy: { createdAt: 'desc' },
    });

    const active: DuelItemDto[] = [];
    const incoming: DuelItemDto[] = [];
    const outgoing: DuelItemDto[] = [];
    const recent: DuelItemDto[] = [];
    let pendingResult: DuelItemDto | null = null;

    for (const duel of duels) {
      const item = await this.itemFor(userId, duel);
      if (item.status === DuelStatus.ACTIVE) active.push(item);
      else if (item.status === DuelStatus.PENDING) {
        (duel.opponentId === userId ? incoming : outgoing).push(item);
      } else if (item.status === DuelStatus.COMPLETED) {
        if (recent.length < RECENT_LIMIT) recent.push(item);
        if (!pendingResult && item.seenAt === null) pendingResult = item;
      }
    }
    return { active, incoming, outgoing, recent, pendingResult };
  }

  /** GET /duels/:id — participants only; adds the per-day scores. */
  async detail(userId: string, duelId: string): Promise<DuelDetailDto> {
    const duel = await this.participantDuel(userId, duelId);
    const item = await this.itemFor(userId, duel);
    const days: DuelDetailDto['days'] = [];
    if (duel.startDayKey && duel.endDayKey) {
      const cap = (await this.appSettings.get()).epDailyCap;
      const [mine, theirs] = await Promise.all([
        this.dayPoints(duel.challengerId, duel.startDayKey, duel.endDayKey, cap),
        this.dayPoints(duel.opponentId, duel.startDayKey, duel.endDayKey, cap),
      ]);
      const mineMap = new Map(mine.map((d) => [d.dayKey, d.points]));
      const theirsMap = new Map(theirs.map((d) => [d.dayKey, d.points]));
      const keys = [...new Set([...mineMap.keys(), ...theirsMap.keys()])].sort();
      const iAmChallenger = duel.challengerId === userId;
      for (const dayKey of keys) {
        const c = mineMap.get(dayKey) ?? 0;
        const o = theirsMap.get(dayKey) ?? 0;
        days.push({ dayKey, you: iAmChallenger ? c : o, them: iAmChallenger ? o : c });
      }
    }
    return { ...item, days };
  }

  /** POST /duels/:id/seen — the caller's result celebration was shown. */
  async markSeen(userId: string, duelId: string): Promise<{ updated: number }> {
    const duel = await this.participantDuel(userId, duelId);
    const result = await this.prisma.duel.updateMany({
      where: {
        id: duel.id,
        ...(duel.challengerId === userId ? { challengerSeenAt: null } : { opponentSeenAt: null }),
      },
      data:
        duel.challengerId === userId
          ? { challengerSeenAt: new Date() }
          : { opponentSeenAt: new Date() },
    });
    return { updated: result.count };
  }

  // ── Scoring ───────────────────────────────────────────────────────────────

  /**
   * Σ over days in [startDayKey, endDayKey) of min(epDailyCap, that day's EP).
   * No weekly goal bonus — duels only count capped daily points.
   */
  private async dayPoints(
    userId: string,
    startDayKey: string,
    endDayKey: string,
    dailyCap: number,
    tx: Pick<Tx, 'effortPointEntry'> = this.prisma,
  ): Promise<Array<{ dayKey: string; points: number }>> {
    const entries = await tx.effortPointEntry.findMany({
      where: { userId, dayKey: { gte: startDayKey, lt: endDayKey } },
      select: { dayKey: true, points: true },
    });
    const perDay = new Map<string, number>();
    for (const e of entries) perDay.set(e.dayKey, (perDay.get(e.dayKey) ?? 0) + e.points);
    return [...perDay.entries()]
      .map(([dayKey, points]) => ({ dayKey, points: Math.min(points, dailyCap) }))
      .sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  }

  private async rescore(
    duel: Pick<DbDuel, 'id' | 'challengerId' | 'opponentId' | 'startDayKey' | 'endDayKey'>,
    dailyCap: number,
    tx: Pick<Tx, 'effortPointEntry'> = this.prisma,
  ): Promise<{ challengerPoints: number; opponentPoints: number }> {
    if (!duel.startDayKey || !duel.endDayKey) {
      return { challengerPoints: 0, opponentPoints: 0 };
    }
    const sum = async (userId: string) =>
      (await this.dayPoints(userId, duel.startDayKey!, duel.endDayKey!, dailyCap, tx)).reduce(
        (s, d) => s + d.points,
        0,
      );
    const [challengerPoints, opponentPoints] = await Promise.all([
      sum(duel.challengerId),
      sum(duel.opponentId),
    ]);
    return { challengerPoints, opponentPoints };
  }

  /**
   * Points hook: recomputes both sides of the user's ACTIVE duels. Called
   * best-effort from PointsService after every session record/removal.
   */
  async recomputeForUser(userId: string): Promise<void> {
    const duels = await this.prisma.duel.findMany({
      where: { status: DuelStatus.ACTIVE, OR: [{ challengerId: userId }, { opponentId: userId }] },
    });
    if (duels.length === 0) return;
    const cap = (await this.appSettings.get()).epDailyCap;
    for (const duel of duels) {
      const scores = await this.rescore(duel, cap);
      await this.prisma.duel.update({ where: { id: duel.id }, data: scores });
    }
  }

  // ── Scheduled jobs ────────────────────────────────────────────────────────

  /** `duels-tick` (every 15 min): expire stale challenges, finish ended duels. */
  async tick(): Promise<void> {
    const settings = await this.appSettings.get();
    if (!settings.duelsEnabled) return;
    const now = new Date();
    await this.prisma.duel.updateMany({
      where: {
        status: DuelStatus.PENDING,
        createdAt: { lt: new Date(now.getTime() - INVITE_TTL_MS) },
      },
      data: { status: DuelStatus.EXPIRED, respondedAt: now },
    });

    const due = await this.prisma.duel.findMany({
      where: { status: DuelStatus.ACTIVE, endsAt: { lte: now } },
    });
    for (const duel of due) {
      await this.complete(duel).catch((err) =>
        logger.error(`duel ${duel.id} completion failed: ${String(err)}`),
      );
    }
  }

  /**
   * Completes one ACTIVE duel in a transaction: final recompute, winner and
   * trophy writes. Idempotent via the status guard; notifications go out after
   * the commit so a retry cannot double-notify.
   */
  private async complete(duel: DbDuel): Promise<void> {
    const cap = (await this.appSettings.get()).epDailyCap;
    const result = await this.prisma.$transaction(
      async (tx) => {
        const scores = await this.rescore(duel, cap, tx);
        const isTie = scores.challengerPoints === scores.opponentPoints;
        const winnerId = isTie
          ? null
          : scores.challengerPoints > scores.opponentPoints
            ? duel.challengerId
            : duel.opponentId;

        const closed = await tx.duel.updateMany({
          where: { id: duel.id, status: DuelStatus.ACTIVE },
          data: { status: DuelStatus.COMPLETED, ...scores, winnerId, isTie },
        });
        if (closed.count === 0) return null;

        // Ties award both sides — except a 0–0, which earns nobody a trophy.
        const winners = isTie
          ? scores.challengerPoints > 0
            ? [duel.challengerId, duel.opponentId]
            : []
          : [winnerId!];
        for (const userId of winners) {
          await tx.trophy.upsert({
            where: {
              userId_kind_refId: { userId, kind: 'DUEL_WIN', refId: duel.id },
            },
            create: { userId, kind: 'DUEL_WIN', refId: duel.id },
            update: {},
          });
        }
        return scores;
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
    if (!result) return;

    for (const [recipient, other, you, them, outcome] of [
      [
        duel.challengerId,
        duel.opponentId,
        result.challengerPoints,
        result.opponentPoints,
        result.challengerPoints === result.opponentPoints
          ? 'TIE'
          : result.challengerPoints > result.opponentPoints
            ? 'WON'
            : 'LOST',
      ],
      [
        duel.opponentId,
        duel.challengerId,
        result.opponentPoints,
        result.challengerPoints,
        result.opponentPoints === result.challengerPoints
          ? 'TIE'
          : result.opponentPoints > result.challengerPoints
            ? 'WON'
            : 'LOST',
      ],
    ] as const) {
      await this.notify(recipient, NotificationKind.DUEL_RESULT, other, {
        duelId: duel.id,
        outcome: outcome as DuelOutcome,
        you,
        them,
        url: '/social/duels',
      });
    }
  }

  /** `duels-standings` (daily 19:00 Berlin): one push per user per duel per day. */
  async standings(): Promise<void> {
    const settings = await this.appSettings.get();
    if (!settings.duelsEnabled) return;
    const today = berlinDayKey(new Date());
    const duels = await this.prisma.duel.findMany({
      where: {
        status: DuelStatus.ACTIVE,
        // lastStandingsDayKey guards re-runs; day one is quiet — nothing to report yet.
        NOT: [{ lastStandingsDayKey: today }, { startDayKey: today }],
      },
    });
    if (duels.length === 0) return;
    const cap = settings.epDailyCap;

    for (const duel of duels) {
      if (!duel.endDayKey) continue;
      const daysLeft = Math.max(0, dayKeyDiff(today, duel.endDayKey));
      const marked = await this.prisma.duel.updateMany({
        where: { id: duel.id, status: DuelStatus.ACTIVE, NOT: { lastStandingsDayKey: today } },
        data: { lastStandingsDayKey: today },
      });
      if (marked.count === 0) continue;

      const scores = await this.rescore(duel, cap);
      await this.prisma.duel.update({ where: { id: duel.id }, data: scores });
      for (const [recipient, other, you, them] of [
        [duel.challengerId, duel.opponentId, scores.challengerPoints, scores.opponentPoints],
        [duel.opponentId, duel.challengerId, scores.opponentPoints, scores.challengerPoints],
      ] as const) {
        await this.notify(recipient, NotificationKind.DUEL_STANDINGS, other, {
          duelId: duel.id,
          you,
          them,
          daysLeft,
          leading: you > them,
          url: '/social/duels',
        });
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Loads a duel the user participates in; everyone else gets a 404. */
  private async participantDuel(userId: string, duelId: string): Promise<DbDuel> {
    const duel = await this.prisma.duel.findFirst({
      where: { id: duelId, OR: [{ challengerId: userId }, { opponentId: userId }] },
    });
    if (!duel) throw new NotFoundException('Duel not found');
    return duel;
  }

  /** Projects a duel row into the caller-perspective list item. */
  private async itemFor(userId: string, duel: DbDuel): Promise<DuelItemDto> {
    const iAmChallenger = duel.challengerId === userId;
    const opponentId = iAmChallenger ? duel.opponentId : duel.challengerId;
    const opponent = await this.prisma.user.findUnique({
      where: { id: opponentId },
      select: { id: true, handle: true, name: true, avatarKey: true, avatarUpdatedAt: true },
    });
    const card = opponent
      ? ((await cardBetween(this.prisma, userId, opponent)) ?? {
          userId: opponent.id,
          handle: opponent.handle ?? '',
          avatarUrl: null,
        })
      : { userId: opponentId, handle: '', avatarUrl: null };

    let outcome: DuelOutcome | null = null;
    if (duel.status === DuelStatus.COMPLETED) {
      outcome = duel.isTie ? 'TIE' : duel.winnerId === userId ? 'WON' : 'LOST';
    }
    const today = berlinDayKey(new Date());
    const daysLeft =
      duel.status === DuelStatus.ACTIVE && duel.endDayKey
        ? Math.max(0, dayKeyDiff(today, duel.endDayKey))
        : null;

    return {
      id: duel.id,
      status: duel.status as DuelStatus,
      opponent: card,
      you: iAmChallenger ? duel.challengerPoints : duel.opponentPoints,
      them: iAmChallenger ? duel.opponentPoints : duel.challengerPoints,
      daysLeft,
      outcome,
      seenAt: (iAmChallenger ? duel.challengerSeenAt : duel.opponentSeenAt)?.toISOString() ?? null,
      startDayKey: duel.startDayKey,
      endDayKey: duel.endDayKey,
      createdAt: duel.createdAt.toISOString(),
    };
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
      .catch((err) => logger.warn(`duel notification ${kind} failed: ${String(err)}`));
  }
}
