import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ExerciseType, SessionType, SetType } from '../enums';
import {
  DEFAULT_BODY_WEIGHT_KG,
  STRENGTH_MET_RANGE,
  cardioMetForSpeed,
  estimateWorkoutEnergy,
  strengthMetForDensity,
  leanBodyMassKg,
  restingEnergyKcal,
  suggestDailyKcal,
  suggestProteinGoalG,
} from './energy.util';

const strengthSets = (count: number) =>
  Array.from({ length: count }, () => ({ setType: SetType.WORKING, completed: true }));

describe('estimateWorkoutEnergy', () => {
  it('prefers the HealthKit active energy value', () => {
    const result = estimateWorkoutEnergy(
      {
        sessionType: SessionType.STRENGTH,
        activeDurationSeconds: 3600,
        activeCaloriesKcal: 412.6,
        exercises: [],
      },
      80,
    );
    assert.deepEqual(result, { kcal: 413, source: 'healthkit', usedDefaultBodyWeight: false });
  });

  it('estimates a light strength hour with (MET − 1) × kg × h', () => {
    const result = estimateWorkoutEnergy(
      {
        sessionType: SessionType.STRENGTH,
        activeDurationSeconds: 3600,
        exercises: [{ exerciseTypeSnapshot: ExerciseType.STRENGTH, sets: strengthSets(6) }],
      },
      80,
    );
    assert.equal(result.source, 'estimate');
    assert.equal(result.kcal, Math.round((STRENGTH_MET_RANGE.light - 1) * 80));
  });

  it('rates denser sessions higher and ignores warm-up and incomplete sets', () => {
    const base = {
      sessionType: SessionType.STRENGTH,
      activeDurationSeconds: 1800,
    } as const;
    const sparse = estimateWorkoutEnergy(
      {
        ...base,
        exercises: [{ exerciseTypeSnapshot: ExerciseType.STRENGTH, sets: strengthSets(4) }],
      },
      70,
    );
    const dense = estimateWorkoutEnergy(
      {
        ...base,
        exercises: [
          {
            exerciseTypeSnapshot: ExerciseType.STRENGTH,
            sets: [
              ...strengthSets(12),
              { setType: SetType.WARMUP, completed: true },
              { setType: SetType.WORKING, completed: false },
            ],
          },
        ],
      },
      70,
    );
    assert.ok(dense.kcal > sparse.kcal);
  });

  it('falls back to the default body weight and flags it', () => {
    const result = estimateWorkoutEnergy({
      sessionType: SessionType.STRENGTH,
      activeDurationSeconds: 3600,
      exercises: [],
    });
    assert.equal(result.usedDefaultBodyWeight, true);
    assert.equal(result.kcal, Math.round((STRENGTH_MET_RANGE.light - 1) * DEFAULT_BODY_WEIGHT_KG));
  });

  it('treats a stretching session at stretching intensity', () => {
    const result = estimateWorkoutEnergy(
      {
        sessionType: SessionType.STRETCHING,
        activeDurationSeconds: 1200,
        exercises: [
          {
            exerciseTypeSnapshot: ExerciseType.STRETCHING,
            sets: [{ setType: SetType.STRETCH, completed: true, durationSeconds: 600 }],
          },
        ],
      },
      60,
    );
    assert.equal(result.kcal, Math.round((2.3 - 1) * 60 * (1200 / 3600)));
  });

  it('uses speed-based METs for cardio with distance', () => {
    const result = estimateWorkoutEnergy(
      {
        sessionType: SessionType.MIXED,
        activeDurationSeconds: 1800,
        exercises: [
          {
            exerciseTypeSnapshot: ExerciseType.CARDIO,
            sets: [
              {
                setType: SetType.WORKING,
                completed: true,
                durationSeconds: 1800,
                distanceMeters: 5000,
              },
            ],
          },
        ],
      },
      70,
    );
    assert.equal(result.kcal, Math.round((cardioMetForSpeed(10) - 1) * 70 * 0.5));
  });

  it('returns 0 for empty sessions', () => {
    const result = estimateWorkoutEnergy(
      { sessionType: SessionType.STRENGTH, activeDurationSeconds: 0, exercises: [] },
      70,
    );
    assert.equal(result.kcal, 0);
  });
});

describe('energy helpers', () => {
  it('clamps strength METs to the configured range', () => {
    assert.equal(strengthMetForDensity(0), STRENGTH_MET_RANGE.light);
    assert.equal(strengthMetForDensity(5), STRENGTH_MET_RANGE.vigorous);
  });

  const metrics = {
    bodyWeightKg: 80,
    heightCm: 180,
    birthYear: 1996,
    sex: 'male' as const,
    now: new Date('2026-06-01T00:00:00Z'),
  };

  it('suggests a base goal from Mifflin–St Jeor × the everyday activity factor', () => {
    // BMR = 800 + 1125 − 150 + 5 = 1780 → × 1.3 (default LIGHT) = 2314 → rounded to 10
    assert.equal(suggestDailyKcal(metrics), 2310);
    assert.equal(suggestDailyKcal({ ...metrics, activityLevel: 'SEDENTARY' }), 2140);
    assert.equal(suggestDailyKcal({ ...metrics, activityLevel: 'VERY_ACTIVE' }), 2850);
    assert.equal(suggestDailyKcal({ bodyWeightKg: 80 }), null);
  });

  it('only adds digestion when activity is measured by Apple Health (no double counting)', () => {
    // 1780 × 1.1 = 1958 → 1960, regardless of the chosen activity level
    assert.equal(suggestDailyKcal({ ...metrics, measuredActivity: true }), 1960);
    assert.equal(
      suggestDailyKcal({ ...metrics, activityLevel: 'VERY_ACTIVE', measuredActivity: true }),
      1960,
    );
  });

  it('uses Katch–McArdle when body fat is known, even without height/age/sex', () => {
    // lean = 80 × 0.85 = 68 → 370 + 21.6 × 68 = 1838.8
    assert.deepEqual(restingEnergyKcal({ bodyWeightKg: 80, bodyFatPct: 15 }), {
      kcal: 370 + 21.6 * 68,
      method: 'katch-mcardle',
    });
    assert.equal(suggestDailyKcal({ bodyWeightKg: 80, bodyFatPct: 15 }), 2390);
    // Implausible body fat falls back to Mifflin–St Jeor.
    assert.equal(restingEnergyKcal({ ...metrics, bodyFatPct: 80 })?.method, 'mifflin-st-jeor');
  });

  it('suggests protein from lean mass when body fat is known', () => {
    assert.equal(suggestProteinGoalG(80), 144);
    assert.equal(suggestProteinGoalG(null), null);
    // 100 kg at 30 % → 70 kg lean × 2.2 = 154 (instead of 180 from total weight)
    assert.equal(suggestProteinGoalG(100, 30), 154);
    assert.equal(leanBodyMassKg(100, null), null);
  });
});
