import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DateInputError,
  dayKeysBetween,
  periodDayRange,
  relativeDayRange,
  resolveRange,
  zoneMidnight,
} from './mcp-date-utils';

const BERLIN = 'Europe/Berlin';
// Wednesday 2026-11-18 12:00 UTC → Berlin is UTC+1, still the 18th.
const NOW = new Date('2026-11-18T12:00:00Z');

describe('mcp-date-utils', () => {
  it('resolves a single YYYY-MM-DD to the full Berlin day in UTC', () => {
    const r = resolveRange({ from: '2026-11-10', to: '2026-11-10' }, BERLIN, NOW);
    assert.equal(r.from, '2026-11-09T23:00:00.000Z'); // midnight CET = 23:00Z previous day
    assert.equal(r.to, '2026-11-10T22:59:59.999Z');
    assert.equal(r.fromDayKey, '2026-11-10');
    assert.equal(r.toDayKey, '2026-11-10');
  });

  it('handles the spring DST boundary (Berlin day start is still CET)', () => {
    const r = resolveRange({ from: '2026-03-29', to: '2026-03-29' }, BERLIN, NOW);
    assert.equal(r.from, '2026-03-28T23:00:00.000Z'); // midnight CET (UTC+1)
    assert.equal(r.to, '2026-03-29T21:59:59.999Z'); // 23:59:59.999 CEST (UTC+2)
  });

  it('handles the autumn DST boundary (Berlin day start is CEST)', () => {
    const r = resolveRange({ from: '2026-10-25', to: '2026-10-25' }, BERLIN, NOW);
    assert.equal(r.from, '2026-10-24T22:00:00.000Z'); // midnight CEST (UTC+2)
    assert.equal(r.to, '2026-10-25T22:59:59.999Z'); // 23:59:59.999 CET (UTC+1)
  });

  it('resolves ISO weeks with Monday start', () => {
    assert.deepEqual(relativeDayRange('this-week', BERLIN, NOW), {
      startDayKey: '2026-11-16',
      endDayKey: '2026-11-22',
    });
    assert.deepEqual(relativeDayRange('last-week', BERLIN, NOW), {
      startDayKey: '2026-11-09',
      endDayKey: '2026-11-15',
    });
  });

  it('resolves other relative words against "today" in the zone', () => {
    assert.deepEqual(relativeDayRange('today', BERLIN, NOW), {
      startDayKey: '2026-11-18',
      endDayKey: '2026-11-18',
    });
    assert.deepEqual(relativeDayRange('yesterday', BERLIN, NOW), {
      startDayKey: '2026-11-17',
      endDayKey: '2026-11-17',
    });
    assert.deepEqual(relativeDayRange('this-month', BERLIN, NOW), {
      startDayKey: '2026-11-01',
      endDayKey: '2026-11-30',
    });
    assert.deepEqual(relativeDayRange('last-month', BERLIN, NOW), {
      startDayKey: '2026-10-01',
      endDayKey: '2026-10-31',
    });
    assert.deepEqual(relativeDayRange('this-year', BERLIN, NOW), {
      startDayKey: '2026-01-01',
      endDayKey: '2026-12-31',
    });
    assert.deepEqual(relativeDayRange('last-30-days', BERLIN, NOW), {
      startDayKey: '2026-10-20',
      endDayKey: '2026-11-18',
    });
    assert.deepEqual(relativeDayRange('last-90-days', BERLIN, NOW), {
      startDayKey: '2026-08-21',
      endDayKey: '2026-11-18',
    });
  });

  it('takes the span edge per side and defaults to last 30 days', () => {
    const r = resolveRange({ from: 'last-week' }, BERLIN, NOW);
    assert.equal(r.fromDayKey, '2026-11-09');
    assert.equal(r.toDayKey, '2026-11-18'); // to defaults to today
    const d = resolveRange({}, BERLIN, NOW);
    assert.equal(d.fromDayKey, '2026-10-20');
    assert.equal(d.toDayKey, '2026-11-18');
  });

  it('rejects invalid input with the accepted formats', () => {
    assert.throws(
      () => resolveRange({ from: 'next week' }, BERLIN, NOW),
      (e: unknown) => {
        assert.ok(e instanceof DateInputError);
        assert.match((e as Error).message, /YYYY-MM-DD/);
        assert.match((e as Error).message, /last-30-days/);
        return true;
      },
    );
  });

  it('midnight conversion works for a non-German zone too', () => {
    // New York on 2026-11-10 is EST (UTC-5) → midnight is 05:00Z same day.
    assert.equal(
      zoneMidnight('2026-11-10', 'America/New_York').toISOString(),
      '2026-11-10T05:00:00.000Z',
    );
  });

  it('periodDayRange shifts ISO weeks, calendar months and years', () => {
    assert.deepEqual(periodDayRange('week', 0, BERLIN, NOW), {
      startDayKey: '2026-11-16',
      endDayKey: '2026-11-22',
    });
    assert.deepEqual(periodDayRange('week', 2, BERLIN, NOW), {
      startDayKey: '2026-11-02',
      endDayKey: '2026-11-08',
    });
    assert.deepEqual(periodDayRange('month', 1, BERLIN, NOW), {
      startDayKey: '2026-10-01',
      endDayKey: '2026-10-31',
    });
    assert.deepEqual(periodDayRange('year', 1, BERLIN, NOW), {
      startDayKey: '2025-01-01',
      endDayKey: '2025-12-31',
    });
  });

  it('enumerates the day keys of a range', () => {
    assert.deepEqual(dayKeysBetween('2026-11-16', '2026-11-18'), [
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
    ]);
  });
});
