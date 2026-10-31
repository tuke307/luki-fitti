import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FoodItemSource,
  MealAmountUnit,
  MealType,
  SessionStatus,
  SessionType,
  WeightUnit,
} from '@luki-fitti/common/enums';
import type { HealthWorkoutDto, MealEntryDto, WorkoutSessionDto } from '@luki-fitti/common/schemas';
import {
  bodyWeightForSession,
  buildDay,
  dayKey,
  entryFromPayload,
  kcalByDay,
  lastDays,
  mealTypeForTime,
  mergeWindow,
  ringProgress,
  sessionBurnKcal,
  shiftDay,
  weekDays,
  weekStartKey,
} from './nutrition-day';

const entry = (eatenAt: Date, mealType: MealType, kcal: number): MealEntryDto =>
  entryFromPayload({
    clientEntryId: `c-${eatenAt.getTime()}`,
    eatenAt: eatenAt.toISOString(),
    mealType,
    items: [
      {
        name: 'x',
        kcal,
        proteinG: 10,
        carbsG: 10,
        fatG: 1,
        source: FoodItemSource.MANUAL,
        amountUnit: MealAmountUnit.G,
      },
    ],
  });

const session = (startedAt: Date, extra: Partial<WorkoutSessionDto> = {}) =>
  ({
    id: 's',
    clientSessionId: 's',
    userId: 'u',
    templateId: null,
    stretchingRoutineId: null,
    sessionType: SessionType.STRENGTH,
    workoutNameSnapshot: 'Push',
    status: SessionStatus.COMPLETED,
    startedAt: startedAt.toISOString(),
    pausedAt: null,
    completedAt: startedAt.toISOString(),
    activeDurationSeconds: 3600,
    weightUnit: WeightUnit.KG,
    totalVolumeKg: 0,
    totalSetsCompleted: 0,
    totalRepsCompleted: 0,
    totalStretchSeconds: 0,
    notes: null,
    restTimerEndsAt: null,
    restTimerDurationSec: null,
    restTimerPausedRemSec: null,
    version: 1,
    lastSyncedAt: startedAt.toISOString(),
    exercises: [],
    ...extra,
  }) as WorkoutSessionDto;

describe('nutrition day helpers', () => {
  it('shifts and lists local days across month boundaries', () => {
    assert.equal(shiftDay('2026-10-31', 1), '2026-11-01');
    assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
    assert.deepEqual(lastDays('2026-11-02', 3), ['2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('builds a day from entries and completed workouts', () => {
    const noon = new Date(2026, 9, 29, 12, 0);
    const day = buildDay(
      dayKey(noon),
      [
        entry(noon, MealType.LUNCH, 600),
        entry(new Date(2026, 9, 29, 8), MealType.BREAKFAST, 300),
        entry(new Date(2026, 9, 28, 20), MealType.DINNER, 900),
      ],
      [
        session(new Date(2026, 9, 29, 18), { estimatedCaloriesKcal: 280 }),
        session(new Date(2026, 9, 29, 7), { status: SessionStatus.ABANDONED }),
      ],
      [],
      80,
    );
    assert.equal(day.totals.kcal, 900);
    assert.deepEqual(
      day.byMealType.map((g) => g.mealType),
      [MealType.BREAKFAST, MealType.LUNCH],
    );
    assert.equal(day.burnedKcal, 280);
    assert.equal(day.workouts.length, 1);
  });

  it('falls back to a local estimate for sessions without a server value', () => {
    const day = buildDay(
      dayKey(new Date(2026, 9, 29, 18)),
      [],
      [session(new Date(2026, 9, 29, 18))],
      [],
      80,
    );
    assert.equal(day.burnedKcal, 200); // (3.5 − 1) × 80 kg × 1 h
  });

  it('uses the weigh-in that applied when the workout started', () => {
    const weighIns = [
      { measuredAt: new Date(2026, 9, 1, 7).toISOString(), weightKg: 100 },
      { measuredAt: new Date(2026, 9, 20, 7).toISOString(), weightKg: 60 },
    ];
    // Before the first weigh-in → earliest weigh-in (100 kg), not the profile fallback.
    assert.equal(bodyWeightForSession(session(new Date(2026, 8, 20, 18)), weighIns, 80), 100);
    // Between weigh-ins → the latest one on or before the workout.
    const mid = session(new Date(2026, 9, 10, 18));
    assert.equal(bodyWeightForSession(mid, weighIns, 80), 100);
    assert.equal(sessionBurnKcal(mid, weighIns, 80).kcal, 250); // (3.5 − 1) × 100 kg × 1 h
    // After the latest weigh-in.
    const late = session(new Date(2026, 9, 29, 18));
    assert.equal(sessionBurnKcal(late, weighIns, 80).kcal, 150); // (3.5 − 1) × 60 kg × 1 h
    const day = buildDay(dayKey(new Date(2026, 9, 29, 18)), [], [late], weighIns, 80);
    assert.equal(day.burnedKcal, 150);
    assert.equal(day.usedDefaultBodyWeight, false);
  });

  it('falls back to the profile weight, then flags the default weight', () => {
    const s = session(new Date(2026, 9, 29, 18));
    assert.equal(bodyWeightForSession(s, [], 80), 80);
    assert.equal(sessionBurnKcal(s, [], 80).usedDefaultBodyWeight, false);
    assert.equal(bodyWeightForSession(s, [], null), null);
    assert.equal(sessionBurnKcal(s).usedDefaultBodyWeight, true);
    const server = session(new Date(2026, 9, 29, 18), { estimatedCaloriesKcal: 300 });
    assert.equal(sessionBurnKcal(server).usedDefaultBodyWeight, true);
    assert.equal(sessionBurnKcal(server, [], 80).usedDefaultBodyWeight, false);
    assert.equal(sessionBurnKcal(server, [], 80).kcal, 300);
  });

  it('suggests a meal type from the time of day', () => {
    assert.equal(mealTypeForTime(new Date(2026, 0, 1, 7)), MealType.BREAKFAST);
    assert.equal(mealTypeForTime(new Date(2026, 0, 1, 12)), MealType.LUNCH);
    assert.equal(mealTypeForTime(new Date(2026, 0, 1, 19)), MealType.DINNER);
  });

  it('finds the Monday-first week of a day', () => {
    assert.equal(weekStartKey('2026-10-28'), '2026-10-26'); // Wednesday
    assert.equal(weekStartKey('2026-10-26'), '2026-10-26'); // Monday
    assert.equal(weekStartKey('2026-11-01'), '2026-10-26'); // Sunday
    assert.deepEqual(weekDays('2026-10-26'), [
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
  });

  it('sums kcal per local day and fills rings against the goal', () => {
    const byDay = kcalByDay([
      entry(new Date(2026, 9, 29, 8), MealType.BREAKFAST, 300),
      entry(new Date(2026, 9, 29, 19), MealType.DINNER, 800),
      entry(new Date(2026, 9, 28, 23, 30), MealType.SNACK, 150),
    ]);
    assert.equal(byDay.get('2026-10-29'), 1100);
    assert.equal(byDay.get('2026-10-28'), 150);
    assert.equal(byDay.get('2026-10-27'), undefined);
    assert.equal(ringProgress(1100, 2200), 0.5);
    assert.equal(ringProgress(3000, 2200), 1);
    assert.equal(ringProgress(200, null), 1);
    assert.equal(ringProgress(0, null), 0);
  });

  it('fills the ring against goal plus burned calories', () => {
    const progress = ringProgress(664, 2780, 1197);
    assert.ok(Math.abs(progress - 664 / 3977) < 1e-9);
    assert.ok(progress > 0.166 && progress < 0.168);
    assert.equal(ringProgress(5000, 2780, 1197), 1);
    assert.equal(ringProgress(1390, 2780, 0), 0.5);
    assert.equal(ringProgress(1390, 2780, -500), 0.5);
    assert.equal(ringProgress(300, null, 1197), 1);
    assert.equal(ringProgress(0, 0, 1197), 0);
  });

  it('replaces only the fetched window and keeps pending changes', () => {
    const older = entry(new Date(2026, 8, 10, 12), MealType.LUNCH, 100);
    const gone = entry(new Date(2026, 9, 5, 12), MealType.LUNCH, 100);
    const edited = entry(new Date(2026, 9, 6, 12), MealType.LUNCH, 100);
    const pendingLocal = entry(new Date(2026, 9, 7, 12), MealType.LUNCH, 900);
    const merged = mergeWindow(
      [older, gone, edited, pendingLocal],
      [
        { ...edited, totals: { ...edited.totals, kcal: 250 } },
        { ...pendingLocal, id: 'srv' },
      ],
      { from: new Date(2026, 9, 1).toISOString(), to: new Date(2026, 10, 1).toISOString() },
      { ids: new Set([pendingLocal.clientEntryId]), upserts: [pendingLocal] },
    );
    assert.deepEqual(
      merged.map((e) => e.clientEntryId),
      [older.clientEntryId, edited.clientEntryId, pendingLocal.clientEntryId],
    );
    assert.equal(merged[1]?.totals.kcal, 250);
    assert.equal(merged[2]?.totals.kcal, 900);
  });
});

describe('entryFromPayload amount units', () => {
  it('keeps the unit and defaults legacy payloads to grams', () => {
    const dto = entryFromPayload({
      clientEntryId: 'c-units',
      eatenAt: new Date().toISOString(),
      mealType: MealType.LUNCH,
      items: [
        {
          name: 'Iced tea',
          grams: 500,
          amountUnit: MealAmountUnit.ML,
          kcal: 140,
          proteinG: 0,
          carbsG: 34,
          fatG: 0,
          source: FoodItemSource.AI,
        },
        {
          name: 'Rice',
          grams: 150,
          kcal: 200,
          proteinG: 4,
          carbsG: 44,
          fatG: 1,
          source: FoodItemSource.MANUAL,
        } as never,
      ],
    });
    assert.equal(dto.items[0]?.amountUnit, MealAmountUnit.ML);
    assert.equal(dto.items[1]?.amountUnit, MealAmountUnit.G);
  });
});

describe('buildDay with Apple Health activity', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 29, h, m);
  const key = dayKey(at(12));
  let seq = 0;
  const hw = (
    start: Date,
    minutes: number,
    extra: Partial<HealthWorkoutDto> = {},
  ): HealthWorkoutDto => ({
    id: `hw-${++seq}`,
    healthKitUuid: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    activityType: 'running',
    sourceName: 'Strava',
    isOwn: false,
    startedAt: start.toISOString(),
    endedAt: new Date(start.getTime() + minutes * 60_000).toISOString(),
    activeKcal: 300,
    distanceMeters: 5000,
    ...extra,
  });
  const healthDay = (activeKcal: number, day = key) => ({
    day,
    activeKcal,
    updatedAt: at(23).toISOString(),
  });
  /** 60-minute session from `start` with a 280 kcal server estimate. */
  const gymSession = (start: Date, id = 's1') =>
    session(start, {
      id,
      clientSessionId: id,
      completedAt: new Date(start.getTime() + 60 * 60_000).toISOString(),
      estimatedCaloriesKcal: 280,
    });

  it('keeps the old behaviour without activity', () => {
    const day = buildDay(key, [], [gymSession(at(18))], [], 80);
    assert.equal(day.burnedKcal, 280);
    assert.equal(day.dailyActivityKcal, null);
    assert.deepEqual(day.externalWorkouts, []);
    assert.equal(day.workouts[0]?.covered, false);
  });

  it('uses Health active energy and adds only sessions not in Apple Health', () => {
    const day = buildDay(
      key,
      [],
      [gymSession(at(7), 'gym-am'), gymSession(at(18), 'gym-pm')],
      [],
      80,
      {
        days: [healthDay(900.4)],
        // The evening session was written to Health by LukiFitti (own workout).
        workouts: [hw(at(18, 2), 55, { isOwn: true, sourceName: 'LukiFitti', activeKcal: 260 })],
      },
    );
    const [am, pm] = day.workouts;
    assert.equal(am?.covered, false);
    assert.equal(pm?.covered, true);
    assert.equal(pm?.kcal, 280, 'own workouts never replace the session estimate');
    assert.equal(pm?.healthWorkout, null);
    assert.equal(day.burnedKcal, 900 + 280);
    assert.equal(day.dailyActivityKcal, 900 - 280);
    assert.deepEqual(day.externalWorkouts, [], 'own workouts are never listed separately');
  });

  it('shows the external workout energy for a matching session and does not list it twice', () => {
    const watch = hw(at(18, 5), 50, {
      activityType: 'traditionalStrengthTraining',
      activeKcal: 333.6,
    });
    const run = hw(at(7), 30, { activeKcal: 310 });
    const day = buildDay(key, [], [gymSession(at(18))], [], null, {
      days: [healthDay(1200)],
      workouts: [watch, run],
    });
    assert.equal(day.workouts[0]?.covered, true);
    assert.equal(day.workouts[0]?.kcal, 334);
    assert.equal(day.workouts[0]?.healthWorkout?.id, watch.id);
    assert.equal(day.usedDefaultBodyWeight, false, 'measured energy needs no body weight');
    assert.deepEqual(
      day.externalWorkouts.map((w) => [w.workout.id, w.kcal]),
      [[run.id, 310]],
    );
    assert.equal(day.burnedKcal, 1200);
    assert.equal(day.dailyActivityKcal, 1200 - 310 - 334);
  });

  it('falls back to the session estimate when the matching external workout has no energy', () => {
    const day = buildDay(key, [], [gymSession(at(18))], [], 80, {
      days: [healthDay(500)],
      workouts: [hw(at(18), 60, { activeKcal: null })],
    });
    assert.equal(day.workouts[0]?.covered, true);
    assert.equal(day.workouts[0]?.kcal, 280);
    assert.deepEqual(day.externalWorkouts, []);
    assert.equal(day.burnedKcal, 500);
    assert.equal(day.dailyActivityKcal, 500 - 280);
  });

  it('requires at least 50 % overlap of the shorter duration', () => {
    const s = gymSession(at(18)); // 18:00–19:00
    const half = buildDay(key, [], [s], [], 80, {
      days: [],
      workouts: [hw(at(18, 30), 60)], // 18:30–19:30: 30 of 60 min → match
    });
    assert.equal(half.workouts[0]?.covered, true);
    const short = buildDay(key, [], [s], [], 80, {
      days: [],
      workouts: [hw(at(18, 50), 20)], // 18:50–19:10: 10 of 20 min → match
    });
    assert.equal(short.workouts[0]?.covered, true);
    const less = buildDay(key, [], [s], [], 80, {
      days: [],
      workouts: [hw(at(18, 45), 60)], // 18:45–19:45: 15 of 60 min → no match
    });
    assert.equal(less.workouts[0]?.covered, false);
    assert.equal(less.externalWorkouts.length, 1);
    const apart = buildDay(key, [], [s], [], 80, {
      days: [],
      workouts: [hw(at(19), 30)], // touching, no overlap
    });
    assert.equal(apart.workouts[0]?.covered, false);
  });

  it('picks the external workout with the largest overlap', () => {
    const small = hw(at(17, 30), 60, { activeKcal: 100 }); // 30 min overlap
    const big = hw(at(18), 60, { activeKcal: 400 }); // 60 min overlap
    const day = buildDay(key, [], [gymSession(at(18))], [], 80, {
      days: [],
      workouts: [small, big],
    });
    assert.equal(day.workouts[0]?.kcal, 400);
    assert.deepEqual(day.externalWorkouts, [], 'both matched the session');
    assert.equal(day.burnedKcal, 400);
  });

  it('without Health energy for the day sums sessions and unmatched external workouts', () => {
    const day = buildDay(key, [], [gymSession(at(18))], [], 80, {
      days: [healthDay(999, shiftDay(key, -1))],
      workouts: [
        hw(at(7), 30, { activeKcal: 250.4 }),
        hw(at(12), 20, { activeKcal: null, activityType: 'walking' }),
        hw(at(18), 60, { isOwn: true }),
        hw(new Date(2026, 9, 30, 7), 30), // next day
      ],
    });
    assert.equal(day.dailyActivityKcal, null);
    assert.deepEqual(
      day.externalWorkouts.map((w) => [w.workout.activityType, w.kcal]),
      [
        ['running', 250],
        ['walking', 0],
      ],
    );
    assert.equal(day.workouts[0]?.covered, true);
    assert.equal(day.burnedKcal, 280 + 250);
  });

  it('never reports negative daily activity', () => {
    const day = buildDay(key, [], [], [], 80, {
      days: [healthDay(200)],
      workouts: [hw(at(7), 30, { activeKcal: 350 })],
    });
    assert.equal(day.dailyActivityKcal, 0);
    assert.equal(day.burnedKcal, 200);
  });

  it('uses the active duration when a session has no completion time', () => {
    const s = session(at(18), {
      completedAt: null,
      activeDurationSeconds: 3600,
      estimatedCaloriesKcal: 280,
    });
    const day = buildDay(key, [], [s], [], 80, { days: [], workouts: [hw(at(18, 10), 40)] });
    assert.equal(day.workouts[0]?.covered, true);
  });
});
