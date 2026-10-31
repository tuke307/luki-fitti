import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateMaintenance,
  MAINTENANCE_RULES,
  weightSlopeKgPerDay,
  type MaintenanceDayInput,
} from './maintenance.util';

const pad = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 28 local days starting 2026-09-01. */
function window(fill: (i: number) => Partial<MaintenanceDayInput> = () => ({})) {
  return Array.from({ length: 28 }, (_, i) => ({
    day: key(new Date(2026, 8, 1 + i)),
    intakeKcal: 2500,
    burnedKcal: 400,
    ...fill(i),
  }));
}

/** Weigh-in every 3 days at 07:00 local, losing `kgPerWeek`. */
function weighIns(kgPerWeek: number, startKg = 80) {
  return Array.from({ length: 10 }, (_, i) => ({
    measuredAt: new Date(2026, 8, 1 + i * 3, 7).toISOString(),
    weightKg: startKg + (kgPerWeek / 7) * i * 3,
  }));
}

describe('weightSlopeKgPerDay', () => {
  it('fits a least-squares line through noisy weigh-ins', () => {
    const day = 24 * 60 * 60 * 1000;
    const slope = weightSlopeKgPerDay([
      { t: 0, kg: 80.4 },
      { t: day, kg: 79.6 },
      { t: 2 * day, kg: 80.2 },
      { t: 3 * day, kg: 79.4 },
    ]);
    // Σ(x−x̄)(y−ȳ) = −1.2, Σ(x−x̄)² = 5
    assert.ok(Math.abs(slope - -0.24) < 1e-9);
    assert.equal(weightSlopeKgPerDay([{ t: 0, kg: 80 }]), 0);
  });
});

describe('estimateMaintenance', () => {
  it('equals intake when weight is stable', () => {
    const est = estimateMaintenance(window(), weighIns(0));
    assert.ok(est);
    assert.equal(est.totalKcal, 2500);
    assert.equal(est.baseKcal, 2100);
    assert.equal(est.avgBurnedKcal, 400);
    assert.equal(est.loggedDays, 28);
    assert.equal(est.weighIns, 10);
  });

  it('adds the energy of the weight lost on top of intake', () => {
    // −0.5 kg/week → 0.5 × 7700 / 7 = 550 kcal/day deficit
    const est = estimateMaintenance(window(), weighIns(-0.5));
    assert.ok(est);
    assert.equal(est.totalKcal, 3050);
    assert.equal(est.baseKcal, 2650);
    assert.equal(est.weightChangeKgPerWeek, -0.5);
  });

  it('skips partly logged days instead of treating them as low intake', () => {
    const est = estimateMaintenance(
      window((i) => (i % 4 === 0 ? { intakeKcal: 600 } : i % 4 === 1 ? { intakeKcal: 0 } : {})),
      weighIns(0),
    );
    assert.ok(est);
    assert.equal(est.loggedDays, 14);
    assert.equal(est.totalKcal, 2500);
  });

  it('needs enough logged days and weigh-ins', () => {
    const sparse = window((i) =>
      i < 28 - MAINTENANCE_RULES.minLoggedDays + 1 ? { intakeKcal: 0 } : {},
    );
    assert.equal(estimateMaintenance(sparse, weighIns(0)), null);
    assert.equal(estimateMaintenance(window(), weighIns(0).slice(0, 3)), null);
    // Four weigh-ins within 9 days: span too short.
    assert.equal(estimateMaintenance(window(), weighIns(0).slice(0, 4)), null);
    assert.equal(estimateMaintenance([], weighIns(0)), null);
  });

  it('ignores weigh-ins outside the window', () => {
    const outside = [
      { measuredAt: new Date(2026, 7, 1, 7).toISOString(), weightKg: 95 },
      ...weighIns(0),
      { measuredAt: new Date(2026, 9, 15, 7).toISOString(), weightKg: 60 },
    ];
    assert.equal(estimateMaintenance(window(), outside)?.totalKcal, 2500);
  });

  it('discards implausible results', () => {
    // Logging ~1000 kcal while weight is stable means meals are missing.
    assert.equal(
      estimateMaintenance(
        window(() => ({ intakeKcal: 1000 })),
        weighIns(0),
      ),
      null,
    );
  });
});
