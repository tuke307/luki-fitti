import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BodyWeightSource, WeightUnit } from '@luki-fitti/common/enums';
import { UpsertBodyWeightEntrySchema } from '@luki-fitti/common/schemas';
import {
  buildWeightChart,
  calendarDaysAgo,
  fromDateTimeLocalValue,
  fromDisplayWeight,
  newestFirst,
  newWeightClientId,
  rangeStartMs,
  toDateTimeLocalValue,
  toDisplayWeight,
  weightEntryFromPayload,
} from './body-weight';

const entry = (measuredAt: Date, weightKg: number) =>
  weightEntryFromPayload({
    clientEntryId: `weight-${measuredAt.getTime()}`,
    measuredAt: measuredAt.toISOString(),
    weightKg,
  });

describe('body weight helpers', () => {
  it('generates prefixed client ids the schema accepts', () => {
    const id = newWeightClientId();
    assert.match(id, /^weight-/);
    const parsed = UpsertBodyWeightEntrySchema.safeParse({
      clientEntryId: id,
      measuredAt: new Date(Date.now() - 60_000).toISOString(),
      weightKg: 80,
    });
    assert.equal(parsed.success, true);
  });

  it('builds optimistic entries that keep server identity when editing', () => {
    const created = entry(new Date(2026, 9, 1, 7), 80);
    assert.equal(created.id, `local-${created.clientEntryId}`);
    assert.equal(created.source, BodyWeightSource.MANUAL);
    const edited = weightEntryFromPayload(
      {
        clientEntryId: created.clientEntryId,
        measuredAt: created.measuredAt,
        weightKg: 81,
        note: '  ',
      },
      { ...created, id: 'srv-1' },
    );
    assert.equal(edited.id, 'srv-1');
    assert.equal(edited.weightKg, 81);
    assert.equal(edited.note, null);
  });

  it('converts between display unit and kg without drift', () => {
    assert.equal(toDisplayWeight(81.65, WeightUnit.LBS), 180);
    assert.equal(fromDisplayWeight(180, WeightUnit.LBS), 81.65);
    assert.equal(toDisplayWeight(fromDisplayWeight(180.4, WeightUnit.LBS), WeightUnit.LBS), 180.4);
    assert.equal(toDisplayWeight(80.04, WeightUnit.KG), 80);
    assert.equal(fromDisplayWeight(80.1, WeightUnit.KG), 80.1);
  });

  it('round-trips datetime-local values in the device time zone', () => {
    const d = new Date(2026, 9, 29, 7, 5);
    const local = toDateTimeLocalValue(d);
    assert.equal(local, '2026-10-29T07:05');
    assert.equal(fromDateTimeLocalValue(local), d.toISOString());
    assert.equal(fromDateTimeLocalValue(''), null);
  });

  it('filters chart ranges but averages over the full history', () => {
    const now = new Date(2026, 9, 29, 12);
    const entries = [
      entry(new Date(2026, 8, 26, 7), 82), // just outside 1M
      entry(new Date(2026, 9, 1, 7), 80),
      entry(new Date(2026, 9, 28, 7), 79),
    ];
    const month = buildWeightChart(entries, '1m', WeightUnit.KG, now);
    assert.equal(month.length, 2);
    assert.equal(month[0]?.weight, 80);
    assert.equal(month[0]?.avg, 81); // 82 and 80 fall in the same 7-day window
    assert.equal(buildWeightChart(entries, 'all', WeightUnit.KG, now).length, 3);
    assert.equal(rangeStartMs('all', now), null);
    assert.deepEqual(
      newestFirst(entries).map((e) => e.weightKg),
      [79, 80, 82],
    );
  });

  it('counts calendar days since a weigh-in', () => {
    const now = new Date(2026, 9, 29, 8);
    assert.equal(calendarDaysAgo(new Date(2026, 9, 29, 7).toISOString(), now), 0);
    assert.equal(calendarDaysAgo(new Date(2026, 9, 28, 23).toISOString(), now), 1);
  });
});
