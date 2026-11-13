import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Arena, LeagueOutcome, LeagueStage, LeagueStageMode } from '@luki-fitti/common/enums';
import {
  ARENA_ORDER,
  arenaStep,
  computeArenaBuckets,
  outcomeCounts,
  outcomeFor,
  selectStage,
  zoneFor,
} from './league.util';

describe('arenaStep', () => {
  it('moves up and down inside the ladder and clamps at the edges', () => {
    assert.equal(arenaStep(Arena.BRONZE, 1), Arena.SILVER);
    assert.equal(arenaStep(Arena.GOLD, -1), Arena.SILVER);
    assert.equal(arenaStep(Arena.TITAN, 1), Arena.TITAN);
    assert.equal(arenaStep(Arena.BRONZE, -1), Arena.BRONZE);
  });
});

describe('selectStage', () => {
  it('AUTO picks by thresholds and forced modes win', () => {
    assert.equal(selectStage(LeagueStageMode.AUTO, 2, 20, 100), LeagueStage.FRIENDS);
    assert.equal(selectStage(LeagueStageMode.AUTO, 20, 20, 100), LeagueStage.GLOBAL);
    assert.equal(selectStage(LeagueStageMode.AUTO, 99, 20, 100), LeagueStage.GLOBAL);
    assert.equal(selectStage(LeagueStageMode.AUTO, 100, 20, 100), LeagueStage.ARENAS);
    assert.equal(selectStage(LeagueStageMode.FRIENDS, 500, 20, 100), LeagueStage.FRIENDS);
    assert.equal(selectStage(LeagueStageMode.ARENAS, 0, 20, 100), LeagueStage.ARENAS);
  });
});

describe('outcomeCounts / outcomeFor', () => {
  it('no movement below 5 members', () => {
    for (const stage of [LeagueStage.FRIENDS, LeagueStage.GLOBAL, LeagueStage.ARENAS]) {
      assert.deepEqual(outcomeCounts(stage, 4), { promoteCount: 0, demoteCount: 0 });
    }
    assert.equal(outcomeFor(LeagueStage.GLOBAL, Arena.GOLD, 1, 3), LeagueOutcome.STAYED);
  });

  it('GLOBAL n=5: top 1 promotes, bottom 1 demotes', () => {
    assert.deepEqual(outcomeCounts(LeagueStage.GLOBAL, 5), { promoteCount: 1, demoteCount: 1 });
    assert.equal(outcomeFor(LeagueStage.GLOBAL, Arena.SILVER, 1, 5), LeagueOutcome.PROMOTED);
    assert.equal(outcomeFor(LeagueStage.GLOBAL, Arena.SILVER, 5, 5), LeagueOutcome.DEMOTED);
    assert.equal(outcomeFor(LeagueStage.GLOBAL, Arena.SILVER, 3, 5), LeagueOutcome.STAYED);
  });

  it('GLOBAL n=10: ceil/floor of 20%', () => {
    assert.deepEqual(outcomeCounts(LeagueStage.GLOBAL, 10), { promoteCount: 2, demoteCount: 2 });
  });

  it('ARENAS n=30: ~7 promote, ~5 demote', () => {
    const { promoteCount, demoteCount } = outcomeCounts(LeagueStage.ARENAS, 30);
    assert.equal(promoteCount, 7);
    assert.equal(demoteCount, 5);
    assert.equal(outcomeFor(LeagueStage.ARENAS, Arena.GOLD, 7, 30), LeagueOutcome.PROMOTED);
    assert.equal(outcomeFor(LeagueStage.ARENAS, Arena.GOLD, 8, 30), LeagueOutcome.STAYED);
    assert.equal(outcomeFor(LeagueStage.ARENAS, Arena.GOLD, 26, 30), LeagueOutcome.DEMOTED);
    assert.equal(outcomeFor(LeagueStage.ARENAS, Arena.GOLD, 25, 30), LeagueOutcome.STAYED);
  });

  it('arena edges: BRONZE never demotes, TITAN never promotes', () => {
    assert.equal(outcomeFor(LeagueStage.ARENAS, Arena.BRONZE, 30, 30), LeagueOutcome.STAYED);
    assert.equal(outcomeFor(LeagueStage.ARENAS, Arena.TITAN, 1, 30), LeagueOutcome.STAYED);
    assert.equal(outcomeFor(LeagueStage.GLOBAL, Arena.TITAN, 1, 5), LeagueOutcome.STAYED);
  });

  it('zoneFor maps outcomes to display zones', () => {
    assert.equal(zoneFor(LeagueStage.ARENAS, Arena.GOLD, 1, 30), 'PROMOTE');
    assert.equal(zoneFor(LeagueStage.ARENAS, Arena.GOLD, 30, 30), 'DEMOTE');
    assert.equal(zoneFor(LeagueStage.ARENAS, Arena.GOLD, 15, 30), 'SAFE');
  });
});

describe('computeArenaBuckets', () => {
  const counts = (entries: Array<[Arena, number]>) =>
    Object.fromEntries([...ARENA_ORDER.map((a) => [a, 0] as const), ...entries]) as Record<
      Arena,
      number
    >;

  it('one bucket per ≥10-user group, small arenas merge upward', () => {
    const buckets = computeArenaBuckets(
      counts([
        [Arena.BRONZE, 12],
        [Arena.SILVER, 4],
      ]),
    );
    assert.equal(buckets[Arena.BRONZE], 0);
    assert.equal(buckets[Arena.SILVER], 1);
  });

  it('a trailing bucket under the minimum merges back down', () => {
    const buckets = computeArenaBuckets(
      counts([
        [Arena.BRONZE, 15],
        [Arena.GOLD, 10],
        [Arena.TITAN, 3],
      ]),
    );
    assert.equal(buckets[Arena.BRONZE], 0);
    assert.equal(buckets[Arena.GOLD], 1);
    assert.equal(buckets[Arena.TITAN], 1);
  });

  it('adjacent small arenas merge into the filling bucket', () => {
    const buckets = computeArenaBuckets(
      counts([
        [Arena.SILVER, 6],
        [Arena.GOLD, 6],
        [Arena.DIAMOND, 10],
      ]),
    );
    assert.equal(buckets[Arena.SILVER], 0);
    assert.equal(buckets[Arena.GOLD], 0);
    assert.equal(buckets[Arena.DIAMOND], 1);
  });
});
