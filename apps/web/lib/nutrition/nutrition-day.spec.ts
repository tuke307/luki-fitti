import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FoodItemSource,
  MealType,
  SessionStatus,
  SessionType,
  WeightUnit,
} from '@luki-fitti/common/enums';
import type { MealEntryDto, WorkoutSessionDto } from '@luki-fitti/common/schemas';
import {
  bodyWeightForSession,
  buildDay,
  dayKey,
  entryFromPayload,
  lastDays,
  mealTypeForTime,
  sessionBurnKcal,
  shiftDay,
} from './nutrition-day';

const entry = (eatenAt: Date, mealType: MealType, kcal: number): MealEntryDto =>
  entryFromPayload({
    clientEntryId: `c-${eatenAt.getTime()}`,
    eatenAt: eatenAt.toISOString(),
    mealType,
    items: [{ name: 'x', kcal, proteinG: 10, carbsG: 10, fatG: 1, source: FoodItemSource.MANUAL }],
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
});
