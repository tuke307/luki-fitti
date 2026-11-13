import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { berlinWeekKey, previousWeekKey } from '@luki-fitti/common/utils';
import { LeagueStage, SessionStatus } from '@luki-fitti/common/enums';
import type { AppSettingsService } from '../app-settings/app-settings.service';
import type { PrismaService } from '../database/prisma.service';
import type { SocialAccessService } from '../social/social-access.service';
import type { LeagueService } from '../league/league.service';
import { PointsService } from './points.service';

interface FakeSet {
  setType: string;
  completed: boolean;
  completedAt: Date | null;
  isPersonalRecord: boolean;
  durationSeconds: number | null;
}

const workingSet = (offsetSeconds = 0): FakeSet => ({
  setType: 'WORKING',
  completed: true,
  completedAt: new Date(Date.now() - 3_600_000 + offsetSeconds * 1000),
  isPersonalRecord: false,
  durationSeconds: null,
});

const makeSession = (
  id: string,
  opts: {
    status?: string;
    sourceDevice?: string;
    completedAt?: Date | null;
    activeDurationSeconds?: number;
    exerciseCount?: number;
    setsPerExercise?: FakeSet[];
  } = {},
) => ({
  id,
  userId: 'u1',
  status: opts.status ?? SessionStatus.COMPLETED,
  sessionType: 'STRENGTH',
  sourceDevice: opts.sourceDevice ?? 'WEB',
  workoutNameSnapshot: 'Push Day',
  activeDurationSeconds: opts.activeDurationSeconds ?? 1800,
  totalStretchSeconds: 0,
  completedAt: opts.completedAt === undefined ? new Date() : opts.completedAt,
  exercises: Array.from({ length: opts.exerciseCount ?? 2 }, (_, i) => ({
    id: `ex-${id}-${i}`,
    exerciseTypeSnapshot: 'STRENGTH',
    // Per-exercise stagger keeps every set above the 15 s plausibility floor.
    sets: opts.setsPerExercise ?? [workingSet(i * 40), workingSet(i * 40 + 20)],
  })),
});

const makeState = () => ({
  sessions: new Map<string, ReturnType<typeof makeSession>>(),
  entries: [] as Array<Record<string, unknown> & { id: string; sessionId: string }>,
  scores: new Map<
    string,
    { points: number; rawPoints: number; sessions: number; goalBonus: number; updatedAt: Date }
  >(),
  weeks: new Map<string, { weekKey: string; stage: LeagueStage; closedAt: Date | null }>(),
  memberships: [] as Array<{ userId: string; weekKey: string }>,
  prefs: null as { weeklyGoalSessions: number } | null,
});

const makePrisma = (state: ReturnType<typeof makeState>) =>
  ({
    workoutSession: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        state.sessions.get(id) ?? null,
    },
    effortPointEntry: {
      findUnique: async ({ where: { sessionId } }: { where: { sessionId: string } }) =>
        state.entries.find((e) => e.sessionId === sessionId) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `entry-${state.entries.length}`, createdAt: new Date(), ...data };
        state.entries.push(row as never);
        return row;
      },
      update: async ({
        where: { id },
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) =>
        Object.assign(
          state.entries.find((e) => e.id === id)!,
          data,
        ),
      delete: async ({ where: { id } }: { where: { id: string } }) => {
        state.entries = state.entries.filter((e) => e.id !== id);
      },
      findMany: async ({ where }: { where: { userId: string; weekKey: string } }) =>
        state.entries
          .filter((e) => e.userId === where.userId && e.weekKey === where.weekKey)
          .map((e) => ({ ...e, session: state.sessions.get(e.sessionId) ?? null })),
    },
    weeklyScore: {
      upsert: async ({
        where,
        update,
        create,
      }: {
        where: { userId_weekKey: { userId: string; weekKey: string } };
        update: Record<string, number>;
        create: { userId: string; weekKey: string } & Record<string, number>;
      }) => {
        const key = `${where.userId_weekKey.userId}:${where.userId_weekKey.weekKey}`;
        const existing = state.scores.get(key);
        const next = existing
          ? Object.assign(existing, update, { updatedAt: new Date() })
          : {
              points: 0,
              rawPoints: 0,
              sessions: 0,
              goalBonus: 0,
              ...create,
              updatedAt: new Date(),
            };
        state.scores.set(key, next);
        return next;
      },
      findUnique: async ({
        where: { userId_weekKey },
      }: {
        where: { userId_weekKey: { userId: string; weekKey: string } };
      }) => state.scores.get(`${userId_weekKey.userId}:${userId_weekKey.weekKey}`) ?? null,
    },
    userPreferences: {
      findUnique: async () => state.prefs,
    },
    leagueWeek: {
      findUnique: async ({ where: { weekKey } }: { where: { weekKey: string } }) =>
        state.weeks.get(weekKey) ?? null,
    },
    leagueMembership: {
      findUnique: async () => null,
    },
  }) as unknown as PrismaService;

const settings = (
  overrides: Partial<{
    leaguesEnabled: boolean;
    epDailyCap: number;
    epWeeklyGoalBonus: number;
  }> = {},
) =>
  ({
    get: async () => ({
      leaguesEnabled: true,
      epDailyCap: 600,
      epWeeklyGoalBonus: 100,
      ...overrides,
    }),
  }) as unknown as AppSettingsService;

const access = (opts: { enabled?: boolean; eligible?: boolean } = {}) =>
  ({
    isEnabledFor: async () => opts.enabled ?? true,
    isEligibleForLeagues: async () => opts.eligible ?? true,
  }) as unknown as SocialAccessService;

const leagues = (state: ReturnType<typeof makeState>, stage = LeagueStage.GLOBAL) => {
  const placed: string[] = [];
  return {
    placed,
    ensureWeek: async (weekKey: string) => {
      const week = { weekKey, stage, closedAt: null };
      state.weeks.set(weekKey, week);
      return week;
    },
    ensurePlaced: async (userId: string, weekKey: string) => {
      placed.push(userId);
      state.memberships.push({ userId, weekKey });
    },
  } as unknown as LeagueService & { placed: string[] };
};

const service = (
  state: ReturnType<typeof makeState>,
  opts: {
    enabled?: boolean;
    eligible?: boolean;
    stage?: LeagueStage;
    leaguesEnabled?: boolean;
  } = {},
) => {
  const leagueStub = leagues(state, opts.stage ?? LeagueStage.GLOBAL);
  const svc = new PointsService(
    makePrisma(state),
    settings({ leaguesEnabled: opts.leaguesEnabled ?? true }),
    access(opts),
    leagueStub,
  );
  return { svc, leagueStub };
};

const currentWeekKey = () => berlinWeekKey(new Date());
const scoreOf = (state: ReturnType<typeof makeState>, userId: string, weekKey: string) =>
  state.scores.get(`${userId}:${weekKey}`);

describe('PointsService.recordSession', () => {
  it('records an entry and recomputes the weekly score', async () => {
    const state = makeState();
    const { svc } = service(state);
    state.sessions.set('s1', makeSession('s1'));
    await svc.recordSession('u1', 's1');
    assert.equal(state.entries.length, 1);
    assert.ok((state.entries[0]!.points as number) > 0);
    assert.ok(scoreOf(state, 'u1', currentWeekKey())!.points > 0);
  });

  it('earns nothing when leagues are off or the user is outside the rollout', async () => {
    for (const opts of [{ leaguesEnabled: false }, { enabled: false }]) {
      const state = makeState();
      const { svc } = service(state, opts);
      state.sessions.set('s1', makeSession('s1'));
      await svc.recordSession('u1', 's1');
      assert.equal(state.entries.length, 0);
    }
  });

  it('earns nothing for imported, uncompleted or too-short sessions', async () => {
    const state = makeState();
    const { svc } = service(state);
    state.sessions.set('imp', makeSession('imp', { sourceDevice: 'IMPORT' }));
    state.sessions.set('prog', makeSession('prog', { status: SessionStatus.IN_PROGRESS }));
    state.sessions.set('short', makeSession('short', { activeDurationSeconds: 60 }));
    await svc.recordSession('u1', 'imp');
    await svc.recordSession('u1', 'prog');
    await svc.recordSession('u1', 'short');
    // too-short still writes a 0-point entry; import/in-progress write nothing
    assert.equal(state.entries.length, 1);
    assert.equal(state.entries[0]!.points, 0);
  });

  it('rejects future-dated and >72h-late syncs', async () => {
    const state = makeState();
    const { svc } = service(state);
    state.sessions.set(
      'future',
      makeSession('future', { completedAt: new Date(Date.now() + 3_600_000) }),
    );
    state.sessions.set(
      'late',
      makeSession('late', { completedAt: new Date(Date.now() - 100 * 3_600_000) }),
    );
    await svc.recordSession('u1', 'future');
    await svc.recordSession('u1', 'late');
    assert.equal(state.entries.length, 0);
  });

  it('rejects backfill into a closed previous week', async () => {
    const state = makeState();
    const { svc } = service(state);
    const prev = previousWeekKey(currentWeekKey());
    state.weeks.set(prev, { weekKey: prev, stage: LeagueStage.GLOBAL, closedAt: new Date() });
    state.sessions.set('s1', makeSession('s1', { completedAt: new Date(`${prev}T12:00:00.000Z`) }));
    await svc.recordSession('u1', 's1');
    assert.equal(state.entries.length, 0);
  });

  it('a re-sync can only lower points (min of first and latest)', async () => {
    const state = makeState();
    const { svc } = service(state);
    const session = makeSession('s1', {
      setsPerExercise: [workingSet(0), workingSet(20), workingSet(40)],
    });
    state.sessions.set('s1', session);
    await svc.recordSession('u1', 's1');
    const first = state.entries[0]!.points as number;

    session.exercises[0]!.sets = [workingSet(0)];
    session.exercises[1]!.sets = [workingSet(0)];
    await svc.recordSession('u1', 's1');
    const lowered = state.entries[0]!.points as number;
    assert.ok(lowered < first, `expected ${lowered} < ${first}`);

    session.exercises[0]!.sets = [workingSet(0), workingSet(20), workingSet(40)];
    session.exercises[1]!.sets = [workingSet(0), workingSet(20), workingSet(40)];
    await svc.recordSession('u1', 's1');
    assert.equal(state.entries[0]!.points, lowered);
  });

  it('places the user lazily on first points in a GLOBAL week', async () => {
    const state = makeState();
    const { svc, leagueStub } = service(state, { stage: LeagueStage.GLOBAL });
    state.sessions.set('s1', makeSession('s1'));
    await svc.recordSession('u1', 's1');
    assert.deepEqual(leagueStub.placed, ['u1']);
  });

  it('never places anyone in a FRIENDS week or when not league-eligible', async () => {
    const state = makeState();
    const { svc, leagueStub } = service(state, { stage: LeagueStage.FRIENDS });
    state.sessions.set('s1', makeSession('s1'));
    await svc.recordSession('u1', 's1');
    assert.deepEqual(leagueStub.placed, []);

    const state2 = makeState();
    const res2 = service(state2, { stage: LeagueStage.GLOBAL, eligible: false });
    state2.sessions.set('s1', makeSession('s1'));
    await res2.svc.recordSession('u1', 's1');
    assert.deepEqual(res2.leagueStub.placed, []);
  });
});

describe('PointsService.recomputeWeeklyScore', () => {
  it('caps each day at epDailyCap and adds the goal bonus', async () => {
    const state = makeState();
    state.prefs = { weeklyGoalSessions: 3 };
    const { svc } = service(state, { leaguesEnabled: true });
    const weekKey = currentWeekKey();
    const now = new Date();
    // Up to two distinct days inside the current week that are still within
    // the 72 h sync window (on a Monday only today qualifies).
    const yesterday = new Date(now.getTime() - 86_400_000);
    const days = berlinWeekKey(yesterday) === weekKey ? [now, yesterday] : [now];
    // 4 sessions, each >> daily cap/2 → every day capped.
    for (const i of [0, 1, 2, 3]) {
      const completedAt = days[i % days.length]!;
      state.sessions.set(`s${i}`, makeSession(`s${i}`, { completedAt, exerciseCount: 40 }));
      await svc.recordSession('u1', `s${i}`);
    }
    const score = scoreOf(state, 'u1', weekKey)!;
    assert.equal(score.points, days.length * 600 + 100);
    assert.equal(score.goalBonus, 100);
    assert.ok(score.rawPoints > score.points);
    assert.equal(score.sessions, 4);
  });
});

describe('PointsService.removeSession', () => {
  it('deletes the entry and recomputes the week', async () => {
    const state = makeState();
    const { svc } = service(state);
    state.sessions.set('s1', makeSession('s1'));
    state.sessions.set('s2', makeSession('s2'));
    await svc.recordSession('u1', 's1');
    await svc.recordSession('u1', 's2');
    const before = scoreOf(state, 'u1', currentWeekKey())!.points;
    await svc.removeSession('u1', 's1');
    assert.equal(state.entries.length, 1);
    const after = scoreOf(state, 'u1', currentWeekKey())!.points;
    assert.ok(after < before);
    await svc.removeSession('u1', 'missing');
    assert.equal(state.entries.length, 1);
  });
});

describe('PointsService.getWeek', () => {
  it('returns per-day capped points, per-session detail and the goal block', async () => {
    const state = makeState();
    state.prefs = { weeklyGoalSessions: 4 };
    const { svc } = service(state);
    state.sessions.set('s1', makeSession('s1'));
    await svc.recordSession('u1', 's1');
    const week = await svc.getWeek('u1', currentWeekKey());
    assert.equal(week.weekKey, currentWeekKey());
    assert.equal(week.dailyCap, 600);
    assert.equal(week.days.length, 1);
    assert.equal(week.sessions.length, 1);
    assert.equal(week.sessions[0]!.workoutName, 'Push Day');
    assert.ok(week.sessions[0]!.breakdown.sets > 0);
    assert.equal(week.goal.target, 4);
    assert.equal(week.goal.done, 1);
    assert.ok(week.points > 0);
  });
});
