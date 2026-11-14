import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { quietHoursDelayMs } from './quiet-hours.util';

// 2026-06-15 12:00:00 UTC — a fixed instant in summer (CEST = UTC+2).
const noonUtc = new Date('2026-06-15T12:00:00Z');

describe('quietHoursDelayMs', () => {
  it('returns 0 in the middle of the local day', () => {
    // 14:00 in Europe/Berlin — outside 22:00–08:00.
    assert.equal(quietHoursDelayMs(noonUtc, 'Europe/Berlin'), 0);
  });

  it('delays a 23:00 local send until 08:00 the next morning', () => {
    // 21:00 UTC = 23:00 CEST → next 08:00 CEST = 06:00 UTC the next day.
    const now = new Date('2026-06-15T21:00:00Z');
    const delay = quietHoursDelayMs(now, 'Europe/Berlin');
    assert.equal(delay, 9 * 60 * 60 * 1000);
  });

  it('delays a 03:00 local send until 08:00 the same morning', () => {
    // 01:00 UTC = 03:00 CEST → 08:00 CEST = 06:00 UTC.
    const now = new Date('2026-06-16T01:00:00Z');
    const delay = quietHoursDelayMs(now, 'Europe/Berlin');
    assert.equal(delay, 5 * 60 * 60 * 1000);
  });

  it('sends immediately for missing or invalid time zones', () => {
    assert.equal(quietHoursDelayMs(noonUtc, null), 0);
    assert.equal(quietHoursDelayMs(noonUtc, 'Not/AZone'), 0);
  });
});
