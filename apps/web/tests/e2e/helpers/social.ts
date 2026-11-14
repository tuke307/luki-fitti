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
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import { expect, type Page } from '@playwright/test';
import prisma from '@luki-fitti/database';
import { berlinDayKey, berlinWeekKey, weekBounds } from '@luki-fitti/common/utils';
import { bossForWeek, raidPhaseFor } from '@luki-fitti/common/raid';

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

/** Flips the `apiKeysEnabled` kill switch on the singleton AppSettings row. */
export async function setApiKeysEnabledForE2e(enabled: boolean): Promise<void> {
  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: { apiKeysEnabled: enabled },
    create: { id: 1, apiKeysEnabled: enabled },
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
  const updated = await prisma.raid.update({
    where: { id: raid.id },
    data: { damage: { increment: damage } },
  });
  await prisma.raid.update({
    where: { id: raid.id },
    data: { phase: raidPhaseFor(updated.damage, updated.maxHp) },
  });
  return raid.id;
}

// Mirrors apps/api/src/config/env.config.ts so the signed tokens match whatever
// secret the api under test actually uses (incl. its dev-only fallback).
const ACCESS_TOKEN_EXPIRY_MS = Number(process.env.ACCESS_TOKEN_EXPIRY_MS) || 900000;
const REFRESH_TOKEN_EXPIRY_MS = Number(process.env.REFRESH_TOKEN_EXPIRY_MS) || 7776000000;

const INSECURE_SECRET_VALUES = new Set([
  'your-jwt-secret-key',
  'your-jwt-refresh-secret-key',
  'secret',
  '',
]);

function e2eJwtSecret(envValue: string | undefined, name: string): string {
  const value = (envValue ?? '').trim();
  if (value.length >= 32 && !INSECURE_SECRET_VALUES.has(value)) return value;
  return `dev-only-insecure-${name.toLowerCase()}-do-not-use-in-production`;
}

/**
 * Establishes a real authenticated session for a seeded user without hitting
 * the throttled `POST /api/auth/login` (10 req / 10 min per IP — the suite's
 * repeated form logins exhaust it). Replicates `issueSessionCookies` in the
 * auth controller: an HS512 access token (payload `{ id, email, sid, jti }`),
 * a refresh token whose sha256 hash is stored as a RefreshToken row in the
 * same family (`sid`), and a CSRF token cookie the web client echoes back via
 * the `X-CSRF-Token` header — so `AuthGuard` + `CsrfGuard` accept the session
 * and UI sign-out revokes it like a real one.
 */
export async function signInSeededUser(page: Page, user: SeededSocialUser): Promise<void> {
  const familyId = crypto.randomUUID();
  const accessToken = jwt.sign(
    {
      id: user.id,
      email: user.email,
      sid: familyId,
      jti: randomBytes(16).toString('hex'),
    },
    e2eJwtSecret(process.env.JWT_SECRET, 'JWT_SECRET'),
    { expiresIn: Math.floor(ACCESS_TOKEN_EXPIRY_MS / 1000), algorithm: 'HS512' },
  );
  const refreshToken = jwt.sign(
    { id: user.id, sid: familyId, jti: randomBytes(16).toString('hex') },
    e2eJwtSecret(process.env.JWT_REFRESH_SECRET, 'JWT_REFRESH_SECRET'),
    { expiresIn: Math.floor(REFRESH_TOKEN_EXPIRY_MS / 1000), algorithm: 'HS512' },
  );

  await prisma.refreshToken.create({
    data: {
      token: createHash('sha256').update(refreshToken).digest('hex'),
      userId: user.id,
      familyId,
      deviceLabel: 'web',
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
    },
  });

  const baseUrl = new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000');
  await page.context().addCookies([
    {
      name: 'accessToken',
      value: accessToken,
      url: baseUrl.origin,
      httpOnly: true,
      sameSite: 'Strict',
    },
    {
      name: 'refreshToken',
      value: refreshToken,
      url: baseUrl.origin,
      httpOnly: true,
      sameSite: 'Strict',
    },
    {
      name: 'csrfToken',
      value: randomBytes(24).toString('hex'),
      url: baseUrl.origin,
      httpOnly: false,
      sameSite: 'Strict',
    },
  ]);

  await page.goto('/');
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await expect(page.getByTestId('header-sync-status')).not.toContainText(/Guest/i, {
    timeout: 15_000,
  });
}
