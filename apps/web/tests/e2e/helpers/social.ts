/**
 * Social e2e helpers: seed verified users and flip the social kill switch
 * straight in the dev database — the seeded admin password isn't part of the
 * repo, so the admin UI can't drive this in tests.
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Same convention as playwright.config.ts; the api env holds DATABASE_URL.
config({ path: resolve(__dirname, '../../.env.local') });
config({ path: resolve(__dirname, '../../../api/.env.local') });

import bcrypt from 'bcrypt';
import prisma from '@luki-fitti/database';
import { berlinDayKey, berlinWeekKey, weekBounds } from '@luki-fitti/common/utils';
import { bossForWeek } from '@luki-fitti/common/raid';

export interface SeededSocialUser {
  id: string;
  email: string;
  password: string;
  name: string;
}

/** Enables `socialEnabled` on the singleton AppSettings row (creates it on fresh DBs). */
export async function enableSocialForE2e(): Promise<void> {
  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: { socialEnabled: true },
    create: { id: 1, socialEnabled: true },
  });
}

/** Creates an already-verified user so the spec can sign in without Mailpit. */
export async function seedSocialUser(
  prefix: string,
  password = 'SocialE2ePass123!',
  handle?: string,
): Promise<SeededSocialUser> {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
  const email = `e2e.social.${prefix}.${unique}@lukifitti.test`;
  const user = await prisma.user.create({
    data: {
      email,
      name: `E2E Social ${prefix}`,
      passwordHash: await bcrypt.hash(password, 10),
      emailVerified: true,
      ...(handle ? { handle, handleChangedAt: new Date() } : {}),
    },
  });
  return { id: user.id, email, password, name: `E2E Social ${prefix}` };
}

/** Forces the league stage mode (AUTO thresholds are impractical to seed for). */
export async function setLeagueStageModeForE2e(
  mode: 'AUTO' | 'FRIENDS' | 'GLOBAL' | 'ARENAS',
): Promise<void> {
  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: { leagueStageMode: mode },
    create: { id: 1, socialEnabled: true, leagueStageMode: mode },
  });
}

/**
 * Seeds one completed session + its EP ledger entry + the weekly score for the
 * current Berlin week, as if the user had just synced a real workout.
 */
export async function seedPointsWeekForE2e(
  userId: string,
  points: number,
  dayKey?: string,
): Promise<string> {
  const weekKey = berlinWeekKey(new Date());
  dayKey ??= berlinDayKey(new Date());
  const session = await prisma.workoutSession.create({
    data: {
      clientSessionId: `e2e-${crypto.randomUUID()}`,
      userId,
      workoutNameSnapshot: 'E2E Seeded Workout',
      status: 'COMPLETED',
      completedAt: new Date(),
      activeDurationSeconds: 3600,
    },
  });
  await prisma.effortPointEntry.create({
    data: {
      userId,
      sessionId: session.id,
      weekKey,
      dayKey,
      points,
      firstPoints: points,
      breakdown: {
        sets: 1,
        warmups: 0,
        prs: 0,
        cardioMinutes: 0,
        stretchMinutes: 0,
        finishBonus: 0,
        droppedSets: 0,
      },
    },
  });
  await prisma.weeklyScore.upsert({
    where: { userId_weekKey: { userId, weekKey } },
    update: { points, rawPoints: points, sessions: 1 },
    create: { userId, weekKey, points, rawPoints: points, sessions: 1, goalBonus: 0 },
  });
  return weekKey;
}

/** Direct ACCEPTED friendship so duel/streak specs skip the request dance. */
export async function seedFriendshipForE2e(userAId: string, userBId: string): Promise<void> {
  const [a, b] = userAId < userBId ? [userAId, userBId] : [userBId, userAId];
  await prisma.friendship.create({
    data: {
      userAId: a,
      userBId: b,
      requestedById: userAId,
      status: 'ACCEPTED',
      acceptedAt: new Date(),
    },
  });
}

/**
 * Completes the ACTIVE duel between two users the way `duels-tick` would:
 * rescored from the EP ledger (per-day cap), winner + trophy writes. There is
 * no e2e job trigger, so this mirrors `DuelService.complete` in the test DB.
 */
export async function completeDuelForE2e(userAId: string, userBId: string): Promise<string> {
  const duel = await prisma.duel.findFirstOrThrow({
    where: {
      status: 'ACTIVE',
      OR: [
        { challengerId: userAId, opponentId: userBId },
        { challengerId: userBId, opponentId: userAId },
      ],
    },
  });
  const cap = 600; // epDailyCap default; mirrors AppSettings seeded for e2e
  const sum = async (userId: string) => {
    const entries = await prisma.effortPointEntry.findMany({
      where: { userId, dayKey: { gte: duel.startDayKey!, lt: duel.endDayKey! } },
      select: { dayKey: true, points: true },
    });
    const byDay = new Map<string, number>();
    for (const e of entries) byDay.set(e.dayKey, (byDay.get(e.dayKey) ?? 0) + e.points);
    return [...byDay.values()].reduce((s, p) => s + Math.min(p, cap), 0);
  };
  const challengerPoints = await sum(duel.challengerId);
  const opponentPoints = await sum(duel.opponentId);
  const isTie = challengerPoints === opponentPoints;
  const winnerId = isTie
    ? null
    : challengerPoints > opponentPoints
      ? duel.challengerId
      : duel.opponentId;
  await prisma.duel.update({
    where: { id: duel.id },
    data: { status: 'COMPLETED', challengerPoints, opponentPoints, winnerId, isTie },
  });
  const winners = isTie
    ? challengerPoints > 0
      ? [duel.challengerId, duel.opponentId]
      : []
    : [winnerId!];
  for (const userId of winners) {
    await prisma.trophy.upsert({
      where: { userId_kind_refId: { userId, kind: 'DUEL_WIN', refId: duel.id } },
      create: { userId, kind: 'DUEL_WIN', refId: duel.id },
      update: {},
    });
  }
  return duel.id;
}

/** Puts every given user into one GLOBAL cohort for the current week. */
export async function seedGlobalCohortForE2e(userIds: string[]): Promise<string> {
  const weekKey = berlinWeekKey(new Date());
  // The week row may already exist (lazily created as FRIENDS); force the stage.
  await prisma.leagueWeek.upsert({
    where: { weekKey },
    update: { stage: 'GLOBAL' },
    create: { weekKey, stage: 'GLOBAL', activeUsers: userIds.length },
  });
  const cohort = await prisma.leagueCohort.create({ data: { weekKey, bucket: null } });
  for (const userId of userIds) {
    await prisma.leagueMembership.create({
      data: { cohortId: cohort.id, userId, weekKey, arenaAtStart: 'BRONZE' },
    });
  }
  return weekKey;
}

/** Enables `raidsEnabled` alongside social on the singleton AppSettings row. */
export async function enableRaidsForE2e(): Promise<void> {
  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: { raidsEnabled: true },
    create: { id: 1, socialEnabled: true, raidsEnabled: true },
  });
}

/**
 * Seeds the current week's ACTIVE community raid with one hit by the user, as
 * if they had just finished a workout against it.
 */
export async function seedCommunityRaidForE2e(userId: string, damage = 120): Promise<string> {
  const weekKey = berlinWeekKey(new Date());
  const { start, end } = weekBounds(weekKey);
  const bossSlug = bossForWeek(weekKey).slug;
  const existing = await prisma.raid.findFirst({
    where: { kind: 'COMMUNITY', weekKey },
  });
  const raid =
    existing ??
    (await prisma.raid.create({
      data: {
        kind: 'COMMUNITY',
        bossSlug,
        weekKey,
        startsAt: start,
        endsAt: end,
        maxHp: 2000,
      },
    }));
  const session = await prisma.workoutSession.create({
    data: {
      clientSessionId: `e2e-raid-${crypto.randomUUID()}`,
      userId,
      workoutNameSnapshot: 'E2E Raid Workout',
      status: 'COMPLETED',
      completedAt: new Date(),
      activeDurationSeconds: 1800,
    },
  });
  await prisma.raidHit.create({
    data: {
      raidId: raid.id,
      userId,
      sessionId: session.id,
      damage,
      firstDamage: damage,
      weakSpotDamage: 0,
      dayKey: berlinDayKey(new Date()),
    },
  });
  await prisma.raid.update({
    where: { id: raid.id },
    data: { damage: { increment: damage } },
  });
  return raid.id;
}
