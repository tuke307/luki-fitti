import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { NotificationKind, RaidDifficulty, TrophyKind } from '@luki-fitti/common/enums';
import { berlinDayKey, berlinWeekKey, previousWeekKey, weekBounds } from '@luki-fitti/common/utils';
import { bossForWeek, raidDamage, RAID_BOSSES } from '@luki-fitti/common/raid';
import type { AppSettingsService } from '../app-settings/app-settings.service';
import type { NotificationService } from '../notifications/notification.service';
import type { PrismaService } from '../database/prisma.service';
import { RaidService, type RaidRow } from './raid.service';
import { SquadService } from './squad.service';

// ─────────────────────────────────────────────────────────────────────────────
// In-memory fake prisma covering the raid/squad code paths
// ─────────────────────────────────────────────────────────────────────────────

let seq = 0;
const nid = () => `id-${++seq}`;

interface Hit {
  id: string;
  raidId: string;
  userId: string;
  sessionId: string;
  damage: number;
  firstDamage: number;
  weakSpotDamage: number;
  topExercise: string | null;
  dayKey: string;
  createdAt: Date;
}

function makeState() {
  const users = new Map<
    string,
    {
      id: string;
      handle: string | null;
      name: string | null;
      avatarKey: null;
      avatarUpdatedAt: null;
      socialPaused: boolean;
    }
  >();
  const addUser = (id: string, handle: string | null = `@${id}`) => {
    users.set(id, {
      id,
      handle,
      name: `Name ${id}`,
      avatarKey: null,
      avatarUpdatedAt: null,
      socialPaused: false,
    });
  };
  return {
    users,
    addUser,
    raids: [] as Array<RaidRow & { squad?: { id: string; name: string } | null }>,
    hits: [] as Hit[],
    seen: [] as Array<{ raidId: string; userId: string }>,
    trophies: [] as Array<{ userId: string; kind: string; refId: string; tier: string | null }>,
    scores: [] as Array<{ userId: string; weekKey: string; points: number }>,
    friendships: [] as Array<{
      userAId: string;
      userBId: string;
      status: string;
      requestedById: string;
    }>,
    blocks: [] as Array<{ blockerId: string; blockedId: string }>,
    squads: [] as Array<{ id: string; name: string; createdById: string }>,
    members: [] as Array<{ squadId: string; userId: string; role: string; joinedAt: Date }>,
    invites: [] as Array<{
      id: string;
      squadId: string;
      invitedId: string;
      invitedById: string;
      createdAt: Date;
    }>,
    entries: new Map<
      string,
      { sessionId: string; userId: string; points: number; breakdown: unknown }
    >(),
    sessions: new Map<string, { completedAt: Date }>(),
    notifications: [] as Array<{
      userId: string;
      kind: NotificationKind;
      payload: Record<string, unknown>;
    }>,
  };
}
type State = ReturnType<typeof makeState>;

const match = (row: Record<string, unknown>, where: Record<string, unknown> = {}): boolean =>
  Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Record<string, unknown>[]).some((w) => match(row, w));
    if (key === 'AND') return (cond as Record<string, unknown>[]).every((w) => match(row, w));
    if (key === 'raid') {
      const raid = (row as { raid?: Record<string, unknown> }).raid;
      return raid ? match(raid, cond as Record<string, unknown>) : false;
    }
    if (key === 'squad') return true; // nested squad filter handled by callers
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>;
      const v = row[key];
      if ('gt' in c) return (v as number) > (c.gt as number);
      if ('gte' in c) return (v as Date | number) >= (c.gte as Date | number);
      if ('lt' in c) return (v as Date | number) < (c.lt as Date | number);
      if ('lte' in c) return (v as Date | number) <= (c.lte as Date | number);
      if ('in' in c) return (c.in as unknown[]).includes(v);
      if ('not' in c) return c.not === null ? v !== null : v !== c.not;
      if ('some' in c) return true; // squad member filter handled by callers
      return true;
    }
    return row[key] === cond;
  });

function makePrisma(state: State): PrismaService {
  const prisma: Record<string, unknown> = {
    raid: {
      findFirst: async ({
        where,
        include,
      }: {
        where: Record<string, unknown>;
        include?: unknown;
      }) =>
        state.raids.filter((r) => match(r as unknown as Record<string, unknown>, where))[0] ?? null,
      findUnique: async ({ where }: { where: { id?: string } }) => {
        const row = state.raids.find((r) => r.id === where.id);
        return row ? { ...row } : null;
      },
      findMany: async ({ where }: { where?: Record<string, unknown> }) => {
        let rows = state.raids.filter((r) =>
          match(r as unknown as Record<string, unknown>, where ?? {}),
        );
        // emulate the squad-member OR branch in applySession
        const or = (where?.OR as Record<string, unknown>[] | undefined) ?? null;
        if (or) {
          rows = state.raids.filter(
            (r) =>
              match(r as unknown as Record<string, unknown>, where ?? {}) ||
              or.some((w) => matchRaidForApply(r, w, state)),
          );
        }
        return rows.map((r) => ({ ...r }));
      },
      create: async ({ data, include }: { data: Record<string, unknown>; include?: unknown }) => {
        if (
          data.kind === 'COMMUNITY' &&
          state.raids.some((r) => r.kind === 'COMMUNITY' && r.weekKey === data.weekKey)
        ) {
          throw new Error('unique constraint failed');
        }
        if (
          state.raids.some(
            (r) =>
              r.kind === data.kind &&
              r.weekKey === data.weekKey &&
              r.squadId === (data.squadId ?? null),
          )
        ) {
          throw new Error('unique constraint failed');
        }
        const raid = {
          id: nid(),
          kind: data.kind,
          squadId: data.squadId ?? null,
          bossSlug: data.bossSlug,
          difficulty: data.difficulty ?? null,
          weekKey: data.weekKey,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          maxHp: data.maxHp,
          damage: 0,
          phase: 0,
          status: 'ACTIVE',
          defeatedAt: null,
          finalBlowUserId: null,
          squad: data.squadId
            ? (state.squads
                .filter((s) => s.id === data.squadId)
                .map((s) => ({ id: s.id, name: s.name }))[0] ?? null)
            : null,
        } as State['raids'][number];
        state.raids.push(raid);
        return raid;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const raid = state.raids.find((r) => r.id === where.id);
        if (!raid) throw new Error('not found');
        Object.assign(raid, data);
        return raid;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const rows = state.raids.filter((r) =>
          match(r as unknown as Record<string, unknown>, where),
        );
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
    },
    raidHit: {
      findUnique: async ({
        where,
        include,
      }: {
        where: { id?: string; raidId_sessionId?: { raidId: string; sessionId: string } };
        include?: { raid?: { select: { id: true; status: true } } };
      }) => {
        const hit = where.raidId_sessionId
          ? state.hits.find(
              (h) =>
                h.raidId === where.raidId_sessionId!.raidId &&
                h.sessionId === where.raidId_sessionId!.sessionId,
            )
          : state.hits.find((h) => h.id === where.id);
        if (!hit) return null;
        const raid = state.raids.find((r) => r.id === hit.raidId);
        return include?.raid ? { ...hit, raid } : hit;
      },
      findMany: async ({
        where,
        include,
        orderBy,
      }: {
        where?: Record<string, unknown>;
        include?: { user?: unknown; raid?: unknown };
        orderBy?: unknown;
      }) =>
        state.hits
          .filter((h) => match(hitRow(h, state), where ?? {}))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((h) => {
            const out: Record<string, unknown> = { ...h };
            if (include?.user) out.user = state.users.get(h.userId) ?? null;
            if (include?.raid) out.raid = state.raids.find((r) => r.id === h.raidId) ?? null;
            return out;
          }),
      findFirst: async ({
        where,
        orderBy,
      }: {
        where?: Record<string, unknown>;
        orderBy?: unknown;
      }) =>
        state.hits
          .filter((h) => match(hitRow(h, state), where ?? {}))
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const hit = { id: nid(), createdAt: new Date(), ...data } as Hit;
        state.hits.push(hit);
        return hit;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const hit = state.hits.find((h) => h.id === where.id);
        if (!hit) throw new Error('not found');
        Object.assign(hit, data);
        return hit;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        state.hits = state.hits.filter((h) => h.id !== where.id);
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        state.hits = state.hits.filter((h) => !match(hitRow(h, state), where));
      },
      aggregate: async ({
        where,
        _sum,
      }: {
        where: Record<string, unknown>;
        _sum: { damage: true };
      }) => ({
        _sum: {
          damage: state.hits
            .filter((h) => match(hitRow(h, state), where))
            .reduce((s, h) => s + h.damage, 0),
        },
      }),
      groupBy: async ({
        by,
        where,
        _sum,
        _max,
        orderBy,
      }: {
        by: string[];
        where?: Record<string, unknown>;
        _sum?: { damage: true };
        _max?: { createdAt: true };
        orderBy?: unknown;
      }) => {
        const groups = new Map<string, { userId: string; damage: number; latest: Date }>();
        for (const h of state.hits.filter((x) => match(hitRow(x, state), where ?? {}))) {
          const g = groups.get(h.userId) ?? { userId: h.userId, damage: 0, latest: h.createdAt };
          g.damage += h.damage;
          if (h.createdAt > g.latest) g.latest = h.createdAt;
          groups.set(h.userId, g);
        }
        return [...groups.values()]
          .sort((a, b) => b.damage - a.damage || a.latest.getTime() - b.latest.getTime())
          .map((g) => ({
            userId: g.userId,
            _sum: { damage: g.damage },
            _max: { createdAt: g.latest },
          }));
      },
      count: async ({ where }: { where: Record<string, unknown> }) =>
        state.hits.filter((h) => match(hitRow(h, state), where)).length,
    },
    raidParticipantSeen: {
      findUnique: async ({
        where,
      }: {
        where: { raidId_userId: { raidId: string; userId: string } };
      }) =>
        state.seen.find(
          (s) => s.raidId === where.raidId_userId.raidId && s.userId === where.raidId_userId.userId,
        ) ?? null,
      upsert: async ({
        where,
        create,
      }: {
        where: { raidId_userId: { raidId: string; userId: string } };
        create: { raidId: string; userId: string };
      }) => {
        if (
          !state.seen.some(
            (s) =>
              s.raidId === where.raidId_userId.raidId && s.userId === where.raidId_userId.userId,
          )
        ) {
          state.seen.push({ raidId: create.raidId, userId: create.userId });
        }
      },
    },
    trophy: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.trophies.find((t) => match(t as unknown as Record<string, unknown>, where)) ?? null,
      count: async ({ where }: { where: Record<string, unknown> }) =>
        state.trophies.filter((t) => match(t as unknown as Record<string, unknown>, where)).length,
      createMany: async ({
        data,
        skipDuplicates,
      }: {
        data: Array<{ userId: string; kind: string; refId: string; tier: string | null }>;
        skipDuplicates?: boolean;
      }) => {
        let count = 0;
        for (const t of data) {
          const dup = state.trophies.some(
            (x) => x.userId === t.userId && x.kind === t.kind && x.refId === t.refId,
          );
          if (dup && skipDuplicates) continue;
          state.trophies.push({ ...t });
          count += 1;
        }
        return { count };
      },
    },
    weeklyScore: {
      findMany: async ({
        where,
        distinct,
      }: {
        where: Record<string, unknown>;
        distinct?: string[];
      }) => {
        const seen = new Set<string>();
        return state.scores
          .filter((s) => match(s as unknown as Record<string, unknown>, where))
          .filter((s) => (seen.has(s.userId) ? false : (seen.add(s.userId), true)))
          .map((s) => ({ userId: s.userId }));
      },
    },
    user: {
      findUnique: async ({ where, select }: { where: { id: string }; select?: unknown }) =>
        state.users.get(where.id) ?? null,
      findMany: async ({ where }: { where?: Record<string, unknown> }) =>
        [...state.users.values()].filter((u) =>
          match(u as unknown as Record<string, unknown>, where ?? {}),
        ),
    },
    squad: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.squads.find((s) => s.id === where.id) ?? null,
      create: async ({
        data,
      }: {
        data: {
          name: string;
          createdById: string;
          members: { create: { userId: string; role: string } };
        };
      }) => {
        const squad = { id: nid(), name: data.name, createdById: data.createdById };
        state.squads.push(squad);
        const m = data.members.create;
        state.members.push({
          squadId: squad.id,
          userId: m.userId,
          role: m.role,
          joinedAt: new Date(),
        });
        return {
          ...squad,
          members: state.members
            .filter((x) => x.squadId === squad.id)
            .map((x) => ({ ...x, user: state.users.get(x.userId) })),
        };
      },
      update: async ({ where, data }: { where: { id: string }; data: { name?: string } }) => {
        const squad = state.squads.find((s) => s.id === where.id);
        if (!squad) throw new Error('not found');
        Object.assign(squad, data);
        return squad;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        state.squads = state.squads.filter((s) => s.id !== where.id);
        state.members = state.members.filter((m) => m.squadId !== where.id);
        state.raids = state.raids.filter((r) => r.squadId !== where.id);
      },
    },
    squadMember: {
      findUnique: async ({
        where,
      }: {
        where: { squadId_userId: { squadId: string; userId: string } };
      }) =>
        state.members.find(
          (m) =>
            m.squadId === where.squadId_userId.squadId && m.userId === where.squadId_userId.userId,
        ) ?? null,
      findFirst: async ({
        where,
        orderBy,
      }: {
        where: Record<string, unknown>;
        orderBy?: unknown;
      }) =>
        state.members
          .filter((m) => match(m as unknown as Record<string, unknown>, where))
          .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0] ?? null,
      findMany: async ({
        where,
        include,
        orderBy,
      }: {
        where?: Record<string, unknown>;
        include?: { squad?: unknown; user?: unknown };
        orderBy?: unknown;
      }) =>
        state.members
          .filter((m) => match(m as unknown as Record<string, unknown>, where ?? {}))
          .map((m) => {
            const out: Record<string, unknown> = { ...m };
            if (include?.squad) {
              const squad = state.squads.find((s) => s.id === m.squadId);
              out.squad = squad
                ? {
                    ...squad,
                    members: state.members
                      .filter((x) => x.squadId === squad.id)
                      .map((x) => ({ ...x, user: state.users.get(x.userId) })),
                  }
                : null;
            }
            if (include?.user) out.user = state.users.get(m.userId) ?? null;
            return out;
          }),
      count: async ({ where }: { where: Record<string, unknown> }) =>
        state.members.filter((m) => match(m as unknown as Record<string, unknown>, where)).length,
      create: async ({ data }: { data: { squadId: string; userId: string; role: string } }) => {
        const member = { ...data, joinedAt: new Date(Date.now() + seq) };
        state.members.push(member);
        return member;
      },
      update: async ({
        where,
        data,
      }: {
        where: { squadId_userId: { squadId: string; userId: string } };
        data: Record<string, unknown>;
      }) => {
        const member = state.members.find(
          (m) =>
            m.squadId === where.squadId_userId.squadId && m.userId === where.squadId_userId.userId,
        );
        if (!member) throw new Error('not found');
        Object.assign(member, data);
        return member;
      },
      delete: async ({
        where,
      }: {
        where: { squadId_userId: { squadId: string; userId: string } };
      }) => {
        state.members = state.members.filter(
          (m) =>
            !(
              m.squadId === where.squadId_userId.squadId && m.userId === where.squadId_userId.userId
            ),
        );
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        state.members = state.members.filter(
          (m) => !match(m as unknown as Record<string, unknown>, where),
        );
      },
    },
    squadInvite: {
      findUnique: async ({
        where,
      }: {
        where: { squadId_invitedId: { squadId: string; invitedId: string } };
      }) =>
        state.invites.find(
          (i) =>
            i.squadId === where.squadId_invitedId.squadId &&
            i.invitedId === where.squadId_invitedId.invitedId,
        ) ?? null,
      findMany: async ({
        where,
        include,
        orderBy,
      }: {
        where?: Record<string, unknown>;
        include?: unknown;
        orderBy?: unknown;
      }) =>
        state.invites
          .filter((i) => match(i as unknown as Record<string, unknown>, where ?? {}))
          .map((i) => ({
            ...i,
            squad: state.squads.find((s) => s.id === i.squadId) ?? null,
            invitedBy: state.users.get(i.invitedById) ?? null,
          })),
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { squadId_invitedId: { squadId: string; invitedId: string } };
        create: { squadId: string; invitedId: string; invitedById: string };
        update: { invitedById: string; createdAt: Date };
      }) => {
        const existing = state.invites.find(
          (i) =>
            i.squadId === where.squadId_invitedId.squadId &&
            i.invitedId === where.squadId_invitedId.invitedId,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const invite = { id: nid(), ...create, createdAt: new Date() };
        state.invites.push(invite);
        return invite;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        state.invites = state.invites.filter((i) => i.id !== where.id);
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        state.invites = state.invites.filter(
          (i) => !match(i as unknown as Record<string, unknown>, where),
        );
      },
    },
    friendship: {
      findUnique: async ({
        where,
      }: {
        where: { userAId_userBId: { userAId: string; userBId: string } };
      }) =>
        state.friendships.find(
          (f) =>
            f.userAId === where.userAId_userBId.userAId &&
            f.userBId === where.userAId_userBId.userBId,
        ) ?? null,
    },
    userBlock: {
      count: async ({
        where,
      }: {
        where: { OR: Array<{ blockerId: string; blockedId: string }> };
      }) =>
        state.blocks.filter((b) =>
          where.OR.some((w) => b.blockerId === w.blockerId && b.blockedId === w.blockedId),
        ).length,
    },
    effortPointEntry: {
      findUnique: async ({ where }: { where: { sessionId: string } }) =>
        state.entries.get(where.sessionId) ?? null,
    },
    workoutSession: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.sessions.get(where.id) ?? null,
    },
    $queryRaw: async () => [],
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };

  return prisma as unknown as PrismaService;
}

function matchRaidForApply(
  raid: State['raids'][number],
  where: Record<string, unknown>,
  state: State,
): boolean {
  if (where.kind && raid.kind !== where.kind) return false;
  const some = (where.squad as { members?: { some?: { userId?: string } } } | undefined)?.members
    ?.some;
  if (some?.userId) {
    return state.members.some((m) => m.squadId === raid.squadId && m.userId === some.userId);
  }
  return true;
}

function hitRow(hit: Hit, state: State): Record<string, unknown> {
  return { ...hit, raid: state.raids.find((r) => r.id === hit.raidId) };
}

// ─────────────────────────────────────────────────────────────────────────────

const SETTINGS: Partial<AppSettingsService['get'] extends () => Promise<infer T> ? T : never> = {};

function makeSettings(overrides: Record<string, unknown> = {}): AppSettingsService {
  return {
    get: async () => ({
      socialEnabled: true,
      socialBetaUserIds: [],
      raidsEnabled: true,
      raidHpPerActiveUser: 400,
      raidMinHp: 2000,
      epDailyCap: 600,
      ...overrides,
    }),
  } as unknown as AppSettingsService;
}

function makeNotifications(state: State): NotificationService {
  return {
    notify: async (
      userId: string,
      kind: NotificationKind,
      _actor: string | null,
      payload: Record<string, unknown>,
    ) => {
      state.notifications.push({ userId, kind, payload });
    },
  } as unknown as NotificationService;
}

function seedRaid(
  state: State,
  overrides: Partial<State['raids'][number]> = {},
): State['raids'][number] {
  const weekKey = overrides.weekKey ?? berlinWeekKey(new Date());
  const { start, end } = weekBounds(weekKey);
  const raid = {
    id: nid(),
    kind: 'COMMUNITY',
    squadId: null,
    bossSlug: overrides.bossSlug ?? bossForWeek(weekKey).slug,
    difficulty: null,
    weekKey,
    startsAt: start,
    endsAt: end,
    maxHp: 1000,
    damage: 0,
    phase: 0,
    status: 'ACTIVE',
    defeatedAt: null,
    finalBlowUserId: null,
    squad: null,
    ...overrides,
  } as State['raids'][number];
  state.raids.push(raid);
  return raid;
}

/** Register an entry + session so applySession picks them up. */
function seedSession(
  state: State,
  sessionId: string,
  userId: string,
  points: number,
  weakSpot: Record<string, number>,
  completedAt: Date,
): void {
  state.entries.set(sessionId, {
    sessionId,
    userId,
    points,
    breakdown: { pointsByWeakSpot: weakSpot, topExercise: 'Bench Press' },
  });
  state.sessions.set(sessionId, { completedAt });
}

describe('raid helpers (common)', () => {
  it('rotates weekly through the roster', () => {
    assert.equal(bossForWeek('2026-01-05').slug, RAID_BOSSES[0]!.slug);
    assert.equal(bossForWeek('2026-01-12').slug, RAID_BOSSES[1]!.slug);
    assert.equal(bossForWeek('2026-03-02').slug, RAID_BOSSES[0]!.slug); // +8 weeks
  });

  it('counts weak-spot points twice', () => {
    const boss = RAID_BOSSES.find((b) => b.slug === 'chest-hydra')!;
    assert.equal(raidDamage(100, { CHEST: 20, BACK: 50 }, boss), 120);
    assert.equal(raidDamage(100, {}, boss), 100);
  });
});

describe('RaidService', () => {
  const setup = (settings: Record<string, unknown> = {}) => {
    const state = makeState();
    for (const u of ['u1', 'u2', 'u3', 'stranger']) state.addUser(u);
    const prisma = makePrisma(state);
    const svc = new RaidService(prisma, makeSettings(settings), makeNotifications(state));
    return { state, prisma, svc };
  };

  it('spawns the community raid with HP = max(minHp, active×perUser)', async () => {
    const { state, svc } = setup();
    const weekKey = berlinWeekKey(new Date());
    const prev = [1, 2, 3, 4].map((i) => {
      let k = weekKey;
      for (let j = 0; j < i; j++) k = previousWeekKey(k);
      return k;
    });
    // two eligible users active in the last 4 weeks (u3 has no score, stranger paused)
    state.scores.push({ userId: 'u1', weekKey: prev[0]!, points: 100 });
    state.scores.push({ userId: 'u2', weekKey: prev[2]!, points: 50 });
    state.users.get('stranger')!.socialPaused = true;
    const raid = await svc.spawnCommunityRaid(weekKey);
    assert.ok(raid);
    assert.equal(raid!.maxHp, 2000); // 2×400 < min 2000
    assert.equal(raid!.bossSlug, bossForWeek(weekKey).slug);
    const spawned = state.notifications.filter((n) => n.kind === NotificationKind.RAID_SPAWNED);
    assert.deepEqual(spawned.map((n) => n.userId).sort(), ['u1', 'u2']);
  });

  it('scales HP above the floor and is idempotent', async () => {
    const { state, svc } = setup();
    const weekKey = berlinWeekKey(new Date());
    for (let i = 0; i < 10; i++) {
      state.addUser(`a${i}`);
      state.scores.push({ userId: `a${i}`, weekKey: previousWeekKey(weekKey), points: 10 });
    }
    const raid = await svc.spawnCommunityRaid(weekKey);
    assert.equal(raid?.maxHp, 4000);
    // Second spawn hits the unique index and returns null.
    assert.equal(await svc.spawnCommunityRaid(weekKey), null);
    assert.equal(state.raids.length, 1);
  });

  it('current lazily spawns when the week has no raid yet', async () => {
    const { state, svc } = setup();
    const out = await svc.current('u1');
    assert.ok(out.community);
    assert.equal(out.community.weekKey, berlinWeekKey(new Date()));
  });

  it('applySession adds damage with the weak-spot bonus and writes the hit', async () => {
    const { state, svc } = setup();
    const boss = RAID_BOSSES.find((b) => b.slug === 'leg-day-titan')!;
    const raid = seedRaid(state, { bossSlug: boss.slug, maxHp: 10000 });
    seedSession(state, 's1', 'u1', 100, { QUADRICEPS: 40 }, new Date());
    await svc.applySession('u1', 's1');
    const hit = state.hits[0]!;
    assert.equal(hit.damage, 140);
    assert.equal(hit.weakSpotDamage, 40);
    assert.equal(state.raids[0]!.damage, 140);
  });

  it('caps per-user damage per day at 2× epDailyCap', async () => {
    const { state, svc } = setup();
    seedRaid(state, { maxHp: 100000 });
    const today = new Date();
    seedSession(state, 's1', 'u1', 600, {}, today);
    seedSession(state, 's2', 'u1', 600, {}, today);
    seedSession(state, 's3', 'u1', 600, {}, today);
    await svc.applySession('u1', 's1');
    await svc.applySession('u1', 's2');
    await svc.applySession('u1', 's3');
    const mine = state.hits.filter((h) => h.userId === 'u1');
    assert.equal(
      mine.reduce((s, h) => s + h.damage, 0),
      1200,
    ); // 2×600 cap
  });

  it('a re-sync can only lower the hit', async () => {
    const { state, svc } = setup();
    const raid = seedRaid(state, { maxHp: 10000 });
    const today = new Date();
    seedSession(state, 's1', 'u1', 100, {}, today);
    await svc.applySession('u1', 's1');
    state.entries.get('s1')!.points = 300; // resync claims more
    await svc.applySession('u1', 's1');
    assert.equal(state.hits[0]!.damage, 100);
    state.entries.get('s1')!.points = 40; // resync lowers
    await svc.applySession('u1', 's1');
    assert.equal(state.hits[0]!.damage, 40);
    assert.equal(state.raids[0]!.damage, 40);
  });

  it('removeSession refunds damage unless the raid is defeated', async () => {
    const { state, svc } = setup();
    seedRaid(state, { maxHp: 10000 });
    const today = new Date();
    seedSession(state, 's1', 'u1', 100, {}, today);
    await svc.applySession('u1', 's1');
    await svc.removeSession('u1', 's1');
    assert.equal(state.raids[0]!.damage, 0);
    assert.equal(state.hits.length, 0);

    // defeated raid keeps its damage
    const raid2 = seedRaid(state, { id: 'r2', kind: 'SQUAD', squadId: 'sq1', maxHp: 50 });
    seedSession(state, 's9', 'u1', 100, {}, today);
    await svc.applySession('u1', 's9');
    assert.equal(raid2.status, 'DEFEATED');
    const before = raid2.damage;
    await svc.removeSession('u1', 's9');
    assert.equal(raid2.damage, before);
  });

  it('crossing 100% marks defeat, the final blow and trophies once', async () => {
    const { state, svc } = setup();
    const raid = seedRaid(state, { maxHp: 200 });
    const today = new Date();
    seedSession(state, 's1', 'u1', 80, {}, today);
    seedSession(state, 's2', 'u2', 150, {}, today);
    await svc.applySession('u1', 's1');
    await svc.applySession('u2', 's2');
    assert.equal(raid.status, 'DEFEATED');
    assert.equal(raid.finalBlowUserId, 'u2');
    const kinds = (u: string) =>
      state.trophies
        .filter((t) => t.userId === u)
        .map((t) => t.kind)
        .sort();
    assert.deepEqual(kinds('u1'), [TrophyKind.RAID_CROWN, TrophyKind.RAID_DEFEATED].sort());
    assert.deepEqual(
      kinds('u2'),
      [TrophyKind.RAID_DEFEATED, TrophyKind.RAID_CROWN, TrophyKind.RAID_FINAL_BLOW].sort(),
    );
    assert.equal(state.trophies.find((t) => t.kind === TrophyKind.RAID_CROWN)?.tier, '1');
    const defeated = state.notifications.filter((n) => n.kind === NotificationKind.RAID_DEFEATED);
    assert.deepEqual(defeated.map((n) => n.userId).sort(), ['u1', 'u2']);
  });

  it('crowns the top three by damage', async () => {
    const { state, svc } = setup();
    seedRaid(state, { maxHp: 1000 });
    const today = new Date();
    seedSession(state, 's1', 'u1', 500, {}, today);
    seedSession(state, 's2', 'u2', 300, {}, today);
    seedSession(state, 's3', 'u3', 200, {}, today);
    seedSession(state, 's4', 'stranger', 10, {}, today);
    await svc.applySession('u1', 's1');
    await svc.applySession('u2', 's2');
    await svc.applySession('u3', 's3');
    await svc.applySession('stranger', 's4');
    const crowns = state.trophies.filter((t) => t.kind === TrophyKind.RAID_CROWN);
    assert.deepEqual(crowns.map((c) => `${c.userId}:${c.tier}`).sort(), ['u1:1', 'u2:2', 'u3:3']);
  });

  it('fires each phase notification once', async () => {
    const { state, svc } = setup();
    const raid = seedRaid(state, { maxHp: 400 });
    const today = new Date();
    // phase 1 at >25% damage dealt (75% left): 100; phase 2 at 50% dealt: 200
    seedSession(state, 's1', 'u1', 120, {}, today);
    await svc.applySession('u1', 's1');
    assert.equal(raid.phase, 1);
    assert.equal(
      state.notifications.filter((n) => n.kind === NotificationKind.RAID_PHASE).length,
      1,
    );
    seedSession(state, 's2', 'u1', 90, {}, today);
    await svc.applySession('u1', 's2'); // 210 total → phase 2
    assert.equal(raid.phase, 2);
    const phases = state.notifications.filter((n) => n.kind === NotificationKind.RAID_PHASE);
    assert.equal(phases.length, 2);
  });

  it('notifies only the transaction that crosses a phase', async () => {
    const { state, svc } = setup();
    seedRaid(state, { maxHp: 1000 });
    const today = new Date();
    seedSession(state, 's1', 'u1', 260, {}, today);
    await svc.applySession('u1', 's1'); // phase 0 → 1
    seedSession(state, 's2', 'u1', 40, {}, today);
    await svc.applySession('u1', 's2'); // stays in phase 1
    const phases = state.notifications.filter((n) => n.kind === NotificationKind.RAID_PHASE);
    assert.equal(phases.length, 1);
    assert.equal(phases[0]!.payload.percent, 75);
  });

  it('sends one push for the highest phase when a hit jumps two', async () => {
    const { state, svc } = setup();
    const raid = seedRaid(state, { maxHp: 1000 });
    const today = new Date();
    seedSession(state, 's1', 'u1', 600, {}, today);
    await svc.applySession('u1', 's1'); // phase 0 → 2 in one hit
    assert.equal(raid.phase, 2);
    const phases = state.notifications.filter((n) => n.kind === NotificationKind.RAID_PHASE);
    assert.equal(phases.length, 1);
    assert.equal(phases[0]!.payload.percent, 50);
  });

  it('applies league-style eligibility: community hits need a handle and no pause', async () => {
    const { state, svc } = setup();
    const raid = seedRaid(state, { maxHp: 10000 });
    state.addUser('nohandle', null);
    state.addUser('paused');
    state.users.get('paused')!.socialPaused = true;
    const today = new Date();
    seedSession(state, 's1', 'nohandle', 100, {}, today);
    seedSession(state, 's2', 'paused', 100, {}, today);
    seedSession(state, 's3', 'u1', 100, {}, today);
    await svc.applySession('nohandle', 's1');
    await svc.applySession('paused', 's2');
    await svc.applySession('u1', 's3');
    assert.equal(raid.damage, 100);
    assert.deepEqual(
      state.hits.map((h) => h.userId),
      ['u1'],
    );
  });

  it('squad hits need a handle but not the pause check', async () => {
    const { state, svc } = setup();
    state.addUser('nohandle', null);
    state.addUser('paused');
    state.users.get('paused')!.socialPaused = true;
    state.squads.push({ id: 'sq1', name: 'Sq', createdById: 'u1' });
    state.members.push(
      { squadId: 'sq1', userId: 'nohandle', role: 'MEMBER', joinedAt: new Date() },
      { squadId: 'sq1', userId: 'paused', role: 'MEMBER', joinedAt: new Date() },
    );
    const raid = seedRaid(state, { kind: 'SQUAD', squadId: 'sq1', maxHp: 10000 });
    const today = new Date();
    seedSession(state, 's1', 'nohandle', 100, {}, today);
    seedSession(state, 's2', 'paused', 100, {}, today);
    await svc.applySession('nohandle', 's1');
    await svc.applySession('paused', 's2');
    assert.equal(raid.damage, 100);
    assert.deepEqual(
      state.hits.map((h) => h.userId),
      ['paused'],
    );
  });

  it('rollover escapes expired raids and notifies participants', async () => {
    const { state, svc } = setup();
    const past = '2026-10-26';
    const raid = seedRaid(state, { weekKey: past });
    state.hits.push({
      id: 'h1',
      raidId: raid.id,
      userId: 'u1',
      sessionId: 'sx',
      damage: 10,
      firstDamage: 10,
      weakSpotDamage: 0,
      topExercise: null,
      dayKey: '2026-10-28',
      createdAt: new Date(),
    });
    await svc.rollover(berlinWeekKey(new Date()));
    assert.equal(raid.status, 'ESCAPED');
    assert.equal(
      state.notifications.find((n) => n.kind === NotificationKind.RAID_ESCAPED)?.userId,
      'u1',
    );
    // …and this week's community raid exists
    assert.ok(
      state.raids.some((r) => r.weekKey === berlinWeekKey(new Date()) && r.status === 'ACTIVE'),
    );
  });

  it('markSeen hides the pending result', async () => {
    const { state, svc } = setup();
    const raid = seedRaid(state, { status: 'DEFEATED', defeatedAt: new Date() });
    state.hits.push({
      id: 'h1',
      raidId: raid.id,
      userId: 'u1',
      sessionId: 'sx',
      damage: 10,
      firstDamage: 10,
      weakSpotDamage: 0,
      topExercise: null,
      dayKey: '2026-10-28',
      createdAt: new Date(),
    });
    let out = await svc.current('u1');
    assert.equal(out.pendingResults.length, 1);
    assert.equal(out.pendingResults[0]!.outcome, 'DEFEATED');
    await svc.markSeen('u1', raid.id);
    out = await svc.current('u1');
    assert.equal(out.pendingResults.length, 0);
  });

  it('feed hides topExercise from strangers and drops blocked users', async () => {
    const { state, svc } = setup();
    const raid = seedRaid(state);
    const today = new Date();
    seedSession(state, 's1', 'u1', 100, {}, today);
    seedSession(state, 's2', 'u2', 50, {}, today);
    state.friendships.push({
      userAId: 'stranger',
      userBId: 'u1',
      status: 'ACCEPTED',
      requestedById: 'u1',
    });
    state.blocks.push({ blockerId: 'stranger', blockedId: 'u2' });
    await svc.applySession('u1', 's1');
    await svc.applySession('u2', 's2');
    const feed = await svc.feed('stranger', raid.id);
    assert.equal(feed.items.length, 1); // u2's hit is hidden (blocked)
    assert.equal(feed.items[0]!.card.userId, 'u1');
    assert.equal(feed.items[0]!.topExercise, 'Bench Press'); // friend sees it
    const ownView = await svc.feed('u2', raid.id);
    assert.equal(
      ownView.items.find((i) => i.card.userId === 'stranger'),
      undefined,
    );
    assert.equal(ownView.items.find((i) => i.card.userId === 'u1')?.topExercise, null); // not friends
  });

  it('squad raid detail is members-only', async () => {
    const { state, svc } = setup();
    state.squads.push({ id: 'sq1', name: 'Crew', createdById: 'u1' });
    state.members.push({ squadId: 'sq1', userId: 'u1', role: 'OWNER', joinedAt: new Date() });
    const raid = seedRaid(state, { kind: 'SQUAD', squadId: 'sq1' });
    await assert.rejects(() => svc.detail('stranger', raid.id), NotFoundException);
    const detail = await svc.detail('u1', raid.id);
    assert.equal(detail.id, raid.id);
  });
});

describe('SquadService', () => {
  const setup = () => {
    const state = makeState();
    for (const u of ['owner', 'm1', 'm2', 'm3', 'm4', 'friend1', 'outsider']) state.addUser(u);
    const prisma = makePrisma(state);
    const raids = new RaidService(prisma, makeSettings(), makeNotifications(state));
    const svc = new SquadService(prisma, makeNotifications(state), raids);
    return { state, svc };
  };

  it('creates a squad with the owner and enforces the 3-squad limit', async () => {
    const { state, svc } = setup();
    const squad = await svc.create('owner', 'Iron Crew');
    assert.equal(squad.role, 'OWNER');
    assert.equal(squad.members.length, 1);
    await svc.create('owner', 'Second');
    await svc.create('owner', 'Third');
    await assert.rejects(() => svc.create('owner', 'Fourth'), ConflictException);
  });

  it('rejects offensive names', async () => {
    const { svc } = setup();
    await assert.rejects(() => svc.create('owner', 'fuck you'), BadRequestException);
  });

  it('invites friends only and notifies them', async () => {
    const { state, svc } = setup();
    const squad = await svc.create('owner', 'Crew');
    state.friendships.push({
      userAId: 'friend1',
      userBId: 'owner',
      status: 'ACCEPTED',
      requestedById: 'owner',
    });
    await assert.rejects(() => svc.invite('owner', squad.id, 'outsider'), BadRequestException);
    await svc.invite('owner', squad.id, 'friend1');
    assert.equal(
      state.notifications.find((n) => n.kind === NotificationKind.SQUAD_INVITE)?.userId,
      'friend1',
    );
    await svc.acceptInvite('friend1', squad.id);
    assert.equal(state.members.filter((m) => m.squadId === squad.id).length, 2);
  });

  it('is owner-only for invites, rename and delete', async () => {
    const { state, svc } = setup();
    const squad = await svc.create('owner', 'Crew');
    state.members.push({ squadId: squad.id, userId: 'm1', role: 'MEMBER', joinedAt: new Date() });
    state.friendships.push({
      userAId: 'friend1',
      userBId: 'm1',
      status: 'ACCEPTED',
      requestedById: 'm1',
    });
    await assert.rejects(() => svc.invite('m1', squad.id, 'friend1'), ForbiddenException);
    await assert.rejects(() => svc.rename('m1', squad.id, 'New'), ForbiddenException);
    await assert.rejects(() => svc.remove('m1', squad.id), ForbiddenException);
  });

  it('leaving owner hands over to the longest member; empty squad is deleted', async () => {
    const { state, svc } = setup();
    const squad = await svc.create('owner', 'Crew');
    state.members.push({ squadId: squad.id, userId: 'm1', role: 'MEMBER', joinedAt: new Date(1) });
    state.members.push({ squadId: squad.id, userId: 'm2', role: 'MEMBER', joinedAt: new Date(2) });
    await svc.leave('owner', squad.id);
    const newOwner = state.members.find((m) => m.squadId === squad.id && m.role === 'OWNER');
    assert.equal(newOwner?.userId, 'm1');
    await svc.leave('m1', squad.id);
    await svc.leave('m2', squad.id);
    assert.equal(state.squads.length, 0);
  });

  it('kick removes a member; owner cannot be kicked', async () => {
    const { state, svc } = setup();
    const squad = await svc.create('owner', 'Crew');
    state.members.push({ squadId: squad.id, userId: 'm1', role: 'MEMBER', joinedAt: new Date() });
    await assert.rejects(() => svc.kick('owner', squad.id, 'owner'), BadRequestException);
    await svc.kick('owner', squad.id, 'm1');
    assert.equal(state.members.filter((m) => m.squadId === squad.id).length, 1);
  });

  it('startRaid needs 2 members, one raid per week, scales HP by difficulty', async () => {
    const { state, svc } = setup();
    const squad = await svc.create('owner', 'Crew');
    await assert.rejects(
      () => svc.startRaid('owner', squad.id, 'chest-hydra', RaidDifficulty.NORMAL),
      BadRequestException,
    );
    state.members.push({ squadId: squad.id, userId: 'm1', role: 'MEMBER', joinedAt: new Date() });
    const raid = await svc.startRaid('owner', squad.id, 'chest-hydra', RaidDifficulty.HARD);
    // 2 members × 450 × daysLeft/7 (mid-week → fewer than 900)
    assert.ok(raid.maxHp > 0 && raid.maxHp <= 900);
    assert.equal(raid.difficulty, 'HARD');
    await assert.rejects(
      () => svc.startRaid('owner', squad.id, 'chest-hydra', RaidDifficulty.NORMAL),
      ConflictException,
    );
    const started = state.notifications.filter(
      (n) => n.kind === NotificationKind.SQUAD_RAID_STARTED,
    );
    assert.deepEqual(
      started.map((n) => n.userId),
      ['m1'],
    );
  });

  it('rejects unknown bosses', async () => {
    const { state, svc } = setup();
    const squad = await svc.create('owner', 'Crew');
    state.members.push({ squadId: squad.id, userId: 'm1', role: 'MEMBER', joinedAt: new Date() });
    await assert.rejects(
      () => svc.startRaid('owner', squad.id, 'not-a-boss', RaidDifficulty.NORMAL),
      BadRequestException,
    );
  });
});
