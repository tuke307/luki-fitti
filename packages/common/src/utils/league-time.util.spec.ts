import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addBerlinDays,
  berlinDayKey,
  berlinMidnight,
  berlinWeekKey,
  nextWeekKey,
  previousWeekKey,
  weekBounds,
} from './league-time.util';

describe('league-time Berlin keys', () => {
  it('maps instants to the Berlin calendar day', () => {
    // 23:30 UTC is already the next day in Berlin (CET, UTC+1).
    assert.equal(berlinDayKey(new Date('2026-01-05T23:30:00Z')), '2026-01-06');
    assert.equal(berlinDayKey(new Date('2026-07-05T22:30:00Z')), '2026-07-06');
    assert.equal(berlinDayKey(new Date('2026-07-05T21:30:00Z')), '2026-07-05');
  });

  it('weeks start Monday 00:00 Berlin regardless of the instant', () => {
    // Sunday evening UTC is still inside the previous Berlin week.
    assert.equal(berlinWeekKey(new Date('2026-01-11T22:59:59Z')), '2026-01-05');
    // Monday 00:00 Berlin (Sun 23:00 UTC in winter) starts the new week.
    assert.equal(berlinWeekKey(new Date('2026-01-11T23:00:00Z')), '2026-01-12');
    assert.equal(berlinWeekKey(new Date('2026-01-14T12:00:00Z')), '2026-01-12');
  });

  it('bounds are UTC instants and stay correct across the CEST→CET switch', () => {
    // Week of 2025-10-20 ends in CET (UTC+1): Sunday 23:00 UTC.
    const autumn = weekBounds('2025-10-20');
    assert.equal(autumn.start.toISOString(), '2025-10-19T22:00:00.000Z');
    assert.equal(autumn.end.toISOString(), '2025-10-26T23:00:00.000Z');

    // Week of 2025-03-24 ends in CEST (UTC+2): Sunday 22:00 UTC.
    const spring = weekBounds('2025-03-24');
    assert.equal(spring.start.toISOString(), '2025-03-23T23:00:00.000Z');
    assert.equal(spring.end.toISOString(), '2025-03-30T22:00:00.000Z');
  });

  it('day keys on the DST Sundays themselves are unambiguous', () => {
    // Clocks jump 02:00→03:00 and 03:00→02:00; the day key must not care.
    assert.equal(berlinDayKey(new Date('2025-03-30T00:30:00Z')), '2025-03-30');
    assert.equal(berlinDayKey(new Date('2025-10-26T01:30:00Z')), '2025-10-26');
    assert.equal(berlinWeekKey(new Date('2025-10-26T12:00:00Z')), '2025-10-20');
  });

  it('walks weeks back and forth', () => {
    assert.equal(previousWeekKey('2026-01-05'), '2025-12-29');
    assert.equal(nextWeekKey('2025-12-29'), '2026-01-05');
    assert.equal(nextWeekKey(previousWeekKey('2026-03-02')), '2026-03-02');
  });
});

describe('berlinMidnight / addBerlinDays', () => {
  it('midnight lands on the right UTC instant across DST changes', () => {
    // CET (UTC+1): Berlin 2026-01-05 00:00 is 23:00 UTC the day before.
    assert.equal(berlinMidnight('2026-01-05').toISOString(), '2026-01-04T23:00:00.000Z');
    // CEST (UTC+2): Berlin 2026-07-05 00:00 is 22:00 UTC the day before.
    assert.equal(berlinMidnight('2026-07-05').toISOString(), '2026-07-04T22:00:00.000Z');
    // The switch Sundays themselves: CET→CEST on 2026-03-29, CEST→CET on 2026-10-25.
    assert.equal(berlinMidnight('2026-03-29').toISOString(), '2026-03-28T23:00:00.000Z');
    assert.equal(berlinMidnight('2026-03-30').toISOString(), '2026-03-29T22:00:00.000Z');
    assert.equal(berlinMidnight('2026-10-25').toISOString(), '2026-10-24T22:00:00.000Z');
    assert.equal(berlinMidnight('2026-10-26').toISOString(), '2026-10-25T23:00:00.000Z');
  });

  it('a 7-day duel window stays 7 calendar days across the switch', () => {
    // Accept on the Saturday before the autumn switch: start Sunday 2026-10-25.
    const start = '2026-10-25';
    assert.equal(addBerlinDays(start, 7), '2026-11-01');
    // The window contains the 25-hour Sunday but still spans exactly 7 midnights.
    assert.equal(
      berlinMidnight(addBerlinDays(start, 7)).getTime() - berlinMidnight(start).getTime(),
      7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000,
    );
  });
});
