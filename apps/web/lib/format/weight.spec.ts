import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WeightUnit } from '@luki-fitti/common/enums';
import { bigVolume, unitLabel, volumeInUnit, weightInUnit, weightStep } from './weight';

describe('weight formatting', () => {
  it('keeps kg totals as they are and converts them for lb users', () => {
    assert.equal(volumeInUnit(1000, WeightUnit.KG), 1000);
    assert.equal(volumeInUnit(1000, WeightUnit.LBS), 2205);
  });

  it('rounds single weights to half pounds', () => {
    assert.equal(weightInUnit(100, WeightUnit.LBS), 220.5);
    assert.equal(weightInUnit(62.54, WeightUnit.KG), 62.5);
  });

  it('labels large totals per unit', () => {
    assert.deepEqual(bigVolume(12_340, WeightUnit.KG), { value: 12.3, label: 't' });
    assert.deepEqual(bigVolume(1000, WeightUnit.LBS), { value: 2.2, label: 'k lb' });
  });

  it('steps by common plate sizes', () => {
    assert.equal(weightStep(WeightUnit.KG), 2.5);
    assert.equal(weightStep(WeightUnit.LBS), 5);
    assert.equal(unitLabel(WeightUnit.LBS), 'lbs');
  });
});
