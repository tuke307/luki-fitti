import { Injectable } from '@nestjs/common';
import {
  computeSessionEffortPoints,
  type EffortPointsBreakdown,
  type EffortPointsSessionInput,
} from '@luki-fitti/common/utils';
import { berlinDayKey, berlinWeekKey, previousWeekKey } from '@luki-fitti/common/utils';
import { LeagueStage, SessionStatus } from '@luki-fitti/common/enums';
import type { PointsWeekDto } from '@luki-fitti/common/schemas';
import type { Prisma } from '@luki-fitti/database';
import { PrismaService } from '../database/prisma.service';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { SocialAccessService } from '../social/social-access.service';
import { LeagueService } from '../league/league.service';

/** Sessions older than this at sync time never earn points. */
const SYNC_WINDOW_MS = 72 * 60 * 60 * 1000;
/** completedAt may be at most this far in the future (clock skew). */
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

@Injectable()
export class PointsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appSettings: AppSettingsService,
    private readonly socialAccess: SocialAccessService,
    private readonly leagues: LeagueService,
  ) {}

  /**
   * Converts a synced COMPLETED session into (or updates) its EffortPointEntry
   * and recomputes the week's WeeklyScore. Resyncs can only ever lower points
   * (min of first and latest computed value). Called from SessionService for
   * every sync whose result is COMPLETED; callers treat it as best-effort.
   */
  async recordSession(userId: string, sessionId: string): Promise<void> {
    const [settings, enabled, session] = await Promise.all([
      this.appSettings.get(),
      this.socialAccess.isEnabledFor(userId),
      this.prisma.workoutSession.findUnique({
        where: { id: sessionId },
        include: { exercises: { include: { sets: true } } },
      }),
    ]);
    if (!settings.leaguesEnabled || !enabled) return;
    if (!session || session.status !== SessionStatus.COMPLETED || !session.completedAt) return;
    // Imported sessions never earn league points.
    if (session.sourceDevice === 'IMPORT') return;

    const now = new Date();
    const completedAt = session.completedAt;
    // Anti-cheat: future-dated or too-late syncs earn nothing; a kept existing
    // entry stays untouched.
    if (completedAt.getTime() > now.getTime() + MAX_FUTURE_SKEW_MS) return;
    if (now.getTime() - completedAt.getTime() > SYNC_WINDOW_MS) return;

    const weekKey = berlinWeekKey(completedAt);
    const currentWeek = berlinWeekKey(now);
    if (weekKey !== currentWeek) {
      // Backfill is only allowed into the previous week while it is still open.
      if (weekKey !== previousWeekKey(currentWeek)) return;
      const prev = await this.prisma.leagueWeek.findUnique({ where: { weekKey } });
      if (prev?.closedAt) return;
    }

    const input: EffortPointsSessionInput = {
      status: session.status,
      sessionType: session.sessionType,
      sourceDevice: session.sourceDevice,
      activeDurationSeconds: session.activeDurationSeconds,
      totalStretchSeconds: session.totalStretchSeconds,
      completedAt: completedAt.toISOString(),
      exercises: session.exercises.map((ex) => ({
        exerciseTypeSnapshot: ex.exerciseTypeSnapshot,
        sets: ex.sets.map((s) => ({
          setType: s.setType,
          completed: s.completed,
          completedAt: s.completedAt?.toISOString() ?? null,
          isPersonalRecord: s.isPersonalRecord,
          durationSeconds: s.durationSeconds,
        })),
      })),
    };
    const { total, breakdown } = computeSessionEffortPoints(input);
    const dayKey = berlinDayKey(completedAt);

    const previousScore = await this.prisma.weeklyScore.findUnique({
      where: { userId_weekKey: { userId, weekKey } },
      select: { points: true },
    });
    const existing = await this.prisma.effortPointEntry.findUnique({ where: { sessionId } });
    if (existing) {
      await this.prisma.effortPointEntry.update({
        where: { id: existing.id },
        data: {
          dayKey,
          firstPoints: Math.min(existing.firstPoints, total),
          points: Math.min(existing.firstPoints, total),
          breakdown: breakdown as unknown as Prisma.InputJsonValue,
        },
      });
    } else {
      await this.prisma.effortPointEntry.create({
        data: {
          userId,
          sessionId,
          weekKey,
          dayKey,
          points: total,
          firstPoints: total,
          breakdown: breakdown as unknown as Prisma.InputJsonValue,
        },
      });
    }

    await this.recomputeWeeklyScore(userId, weekKey);

    // First points of the week → lazy cohort placement (eligible users only,
    // stages with cohorts).
    if ((previousScore?.points ?? 0) === 0 && total > 0) {
      const week = await this.leagues.ensureWeek(weekKey);
      if (
        week.stage !== LeagueStage.FRIENDS &&
        (await this.socialAccess.isEligibleForLeagues(userId))
      ) {
        await this.leagues.ensurePlaced(userId, weekKey);
      }
    }
  }

  /**
   * Removes a session's entry (if any) and recomputes the week. Must run while
   * the session row still exists so the entry's weekKey can be read.
   */
  async removeSession(userId: string, sessionId: string): Promise<void> {
    const entry = await this.prisma.effortPointEntry.findUnique({ where: { sessionId } });
    if (!entry || entry.userId !== userId) return;
    await this.prisma.effortPointEntry.delete({ where: { id: entry.id } });
    await this.recomputeWeeklyScore(userId, entry.weekKey);
  }

  /**
   * WeeklyScore = Σ over dayKey of min(epDailyCap, day points) + goalBonus
   * (epWeeklyGoalBonus when the number of entries with points > 0 reaches the
   * user's weeklyGoalSessions). rawPoints keeps the uncapped total.
   */
  async recomputeWeeklyScore(userId: string, weekKey: string): Promise<void> {
    const [settings, prefs, entries] = await Promise.all([
      this.appSettings.get(),
      this.prisma.userPreferences.findUnique({
        where: { userId },
        select: { weeklyGoalSessions: true },
      }),
      this.prisma.effortPointEntry.findMany({ where: { userId, weekKey } }),
    ]);

    const perDay = new Map<string, number>();
    let rawPoints = 0;
    for (const entry of entries) {
      rawPoints += entry.points;
      perDay.set(entry.dayKey, (perDay.get(entry.dayKey) ?? 0) + entry.points);
    }
    let points = 0;
    for (const dayPoints of perDay.values()) {
      points += Math.min(dayPoints, settings.epDailyCap);
    }
    const goalBonus =
      entries.filter((e) => e.points > 0).length >= (prefs?.weeklyGoalSessions ?? 4)
        ? settings.epWeeklyGoalBonus
        : 0;
    points += goalBonus;

    await this.prisma.weeklyScore.upsert({
      where: { userId_weekKey: { userId, weekKey } },
      update: { points, rawPoints, sessions: entries.length, goalBonus },
      create: { userId, weekKey, points, rawPoints, sessions: entries.length, goalBonus },
    });
  }

  /** GET /points/week — transparent per-day and per-session breakdown. */
  async getWeek(userId: string, weekKey?: string): Promise<PointsWeekDto> {
    const key = weekKey ?? berlinWeekKey(new Date());
    const [settings, prefs, score, entries] = await Promise.all([
      this.appSettings.get(),
      this.prisma.userPreferences.findUnique({
        where: { userId },
        select: { weeklyGoalSessions: true },
      }),
      this.prisma.weeklyScore.findUnique({ where: { userId_weekKey: { userId, weekKey: key } } }),
      this.prisma.effortPointEntry.findMany({
        where: { userId, weekKey: key },
        orderBy: { createdAt: 'asc' },
        include: { session: { select: { workoutNameSnapshot: true } } },
      }),
    ]);

    const perDay = new Map<string, number>();
    for (const entry of entries) {
      perDay.set(entry.dayKey, (perDay.get(entry.dayKey) ?? 0) + entry.points);
    }
    const days = [...perDay.entries()].map(([dayKey, points]) => ({
      dayKey,
      points,
      capped: Math.min(points, settings.epDailyCap),
    }));

    const weeklyGoal = prefs?.weeklyGoalSessions ?? 4;
    const done = entries.filter((e) => e.points > 0).length;
    const goalBonus = done >= weeklyGoal ? settings.epWeeklyGoalBonus : 0;

    return {
      weekKey: key,
      points: score?.points ?? days.reduce((sum, d) => sum + d.capped, goalBonus),
      rawPoints: score?.rawPoints ?? entries.reduce((sum, e) => sum + e.points, 0),
      dailyCap: settings.epDailyCap,
      days,
      sessions: entries.map((e) => ({
        sessionId: e.sessionId,
        workoutName: e.session?.workoutNameSnapshot ?? '',
        points: e.points,
        breakdown: e.breakdown as unknown as EffortPointsBreakdown,
      })),
      goal: { target: weeklyGoal, done, bonus: goalBonus },
    };
  }
}
