import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isoWeekDays, startOfIsoWeek } from '@luki-fitti/common/utils/client';

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('startOfIsoWeek', () => {
  it('returns the same day at midnight for a Monday', () => {
    const monday = startOfIsoWeek(new Date(2026, 9, 19, 18, 30));
    assert.equal(ymd(monday), '2026-10-19');
    assert.equal(monday.getHours(), 0);
  });

  it('maps a Sunday back to the preceding Monday', () => {
    assert.equal(ymd(startOfIsoWeek(new Date(2026, 9, 25, 23, 59))), '2026-10-19');
  });

  it('crosses month and year boundaries', () => {
    assert.equal(ymd(startOfIsoWeek(new Date(2027, 0, 1, 9))), '2026-12-28');
  });
});

describe('isoWeekDays', () => {
  it('returns Monday through Sunday of the current week', () => {
    const days = isoWeekDays(new Date(2026, 9, 22, 12));
    assert.deepEqual(days.map(ymd), [
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
    assert.ok(days.every((d) => d.getHours() === 0));
  });
});
