import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasWeighInSince,
  kgToLbs,
  latestWeighIn,
  lbsToKg,
  movingAverageWeights,
  weightAt,
  weightTrend,
} from './body-weight.util';

const entries = [
  { measuredAt: '2026-10-01T07:00:00Z', weightKg: 82 },
  { measuredAt: '2026-10-15T07:00:00Z', weightKg: 80 },
  { measuredAt: '2026-10-08T07:00:00Z', weightKg: 81 },
];

describe('weightAt', () => {
  it('uses the latest weigh-in on or before the date', () => {
    assert.equal(weightAt(entries, '2026-10-10T18:00:00Z'), 81);
    assert.equal(weightAt(entries, '2026-10-15T07:00:00Z'), 80);
    assert.equal(weightAt(entries, '2026-12-01T00:00:00Z'), 80);
  });

  it('falls back to the earliest weigh-in before the history starts', () => {
    assert.equal(weightAt(entries, '2026-09-01T00:00:00Z'), 82);
  });

  it('returns null without history', () => {
    assert.equal(weightAt([], new Date()), null);
  });
});

describe('latestWeighIn / hasWeighInSince', () => {
  it('finds the newest entry regardless of order', () => {
    assert.equal(latestWeighIn(entries)?.weightKg, 80);
    assert.equal(latestWeighIn([]), null);
  });

  it('detects a weigh-in this week', () => {
    assert.equal(hasWeighInSince(entries, '2026-10-12T00:00:00Z'), true);
    assert.equal(hasWeighInSince(entries, '2026-10-19T00:00:00Z'), false);
  });
});

describe('movingAverageWeights', () => {
  it('averages over the trailing window', () => {
    const avg = movingAverageWeights(
      [
        { measuredAt: '2026-10-01T07:00:00Z', weightKg: 80 },
        { measuredAt: '2026-10-03T07:00:00Z', weightKg: 82 },
        { measuredAt: '2026-10-20T07:00:00Z', weightKg: 78 },
      ],
      7,
    );
    assert.deepEqual(
      avg.map((a) => a.averageKg),
      [80, 81, 78],
    );
  });
});

describe('weightTrend', () => {
  it('computes changes vs. 7 and 30 days earlier', () => {
    const trend = weightTrend(entries, new Date('2026-10-17T07:00:00Z'));
    assert.equal(trend.latestKg, 80);
    assert.equal(trend.change7dKg, -1);
    assert.equal(trend.change30dKg, null);
    assert.equal(trend.daysSinceLast, 2);
  });

  it('is empty without history', () => {
    assert.deepEqual(weightTrend([]), {
      latestKg: null,
      change7dKg: null,
      change30dKg: null,
      daysSinceLast: null,
    });
  });
});

describe('unit conversion', () => {
  it('round-trips kg and lbs', () => {
    assert.ok(Math.abs(lbsToKg(kgToLbs(80)) - 80) < 1e-9);
    assert.ok(Math.abs(kgToLbs(1) - 2.20462) < 1e-4);
  });
});
