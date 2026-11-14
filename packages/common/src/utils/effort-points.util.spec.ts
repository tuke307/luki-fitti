import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  computeSessionEffortPoints,
  type EffortPointsResult,
  type EffortPointsSessionInput,
} from './effort-points.util';

interface FixtureCase {
  name: string;
  session: EffortPointsSessionInput;
  expected: EffortPointsResult;
}

/** Shared with the Swift `EffortPoints` mirror to keep both ports in sync. */
const fixtures = JSON.parse(
  readFileSync(new URL('./__fixtures__/effort-points-cases.json', import.meta.url), 'utf8'),
) as FixtureCase[];

describe('computeSessionEffortPoints (shared fixtures)', () => {
  it('has at least 12 cases covering every rule', () => {
    assert.ok(fixtures.length >= 12);
  });

  for (const fixture of fixtures) {
    it(fixture.name, () => {
      const result = computeSessionEffortPoints(fixture.session);
      assert.deepEqual(result.breakdown, fixture.expected.breakdown);
      assert.equal(result.total, fixture.expected.total);
      assert.deepEqual(result.pointsByWeakSpot, fixture.expected.pointsByWeakSpot ?? {});
      // The total must always agree with the breakdown.
      const b = result.breakdown;
      assert.equal(
        result.total,
        10 * b.sets +
          2 * b.warmups +
          25 * b.prs +
          2 * b.cardioMinutes +
          2 * b.stretchMinutes +
          b.finishBonus,
      );
    });
  }
});
