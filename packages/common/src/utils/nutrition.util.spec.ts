import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { goalProgress, reconcileKcal, scaleFoodItemToGrams, sumMacros } from './nutrition.util';

describe('sumMacros', () => {
  it('sums and rounds macros', () => {
    assert.deepEqual(
      sumMacros([
        { kcal: 120.4, proteinG: 10.04, carbsG: 5, fatG: 1.11 },
        { kcal: 300, proteinG: 2, carbsG: 50.05, fatG: 8 },
      ]),
      { kcal: 420, proteinG: 12, carbsG: 55.1, fatG: 9.1 },
    );
  });

  it('ignores negative and non-finite values', () => {
    assert.deepEqual(sumMacros([{ kcal: -50, proteinG: Number.NaN, carbsG: 10, fatG: Infinity }]), {
      kcal: 0,
      proteinG: 0,
      carbsG: 10,
      fatG: 0,
    });
  });
});

describe('scaleFoodItemToGrams', () => {
  it('rescales nutrients proportionally', () => {
    const scaled = scaleFoodItemToGrams(
      { grams: 150, kcal: 195, proteinG: 4, carbsG: 42, fatG: 0.4, fiberG: 0.6, sugarG: null },
      200,
    );
    assert.deepEqual(scaled, {
      grams: 200,
      kcal: 260,
      proteinG: 5.3,
      carbsG: 56,
      fatG: 0.5,
      fiberG: 0.8,
      sugarG: null,
    });
  });

  it('only sets grams when the item had no gram value', () => {
    assert.deepEqual(scaleFoodItemToGrams({ kcal: 100, proteinG: 1, carbsG: 1, fatG: 1 }, 50), {
      kcal: 100,
      proteinG: 1,
      carbsG: 1,
      fatG: 1,
      grams: 50,
    });
  });
});

describe('reconcileKcal', () => {
  it('keeps plausible kcal', () => {
    const item = { kcal: 410, proteinG: 30, carbsG: 40, fatG: 14 }; // 4/4/9 → 406
    assert.equal(reconcileKcal(item).kcal, 410);
  });

  it('replaces implausible kcal with the macro-derived value', () => {
    const item = { kcal: 900, proteinG: 30, carbsG: 40, fatG: 14 };
    assert.equal(reconcileKcal(item).kcal, 406);
  });
});

describe('goalProgress', () => {
  it('caps progress and handles missing goals', () => {
    assert.equal(goalProgress(1000, 2000), 0.5);
    assert.equal(goalProgress(3000, 2000), 1);
    assert.equal(goalProgress(1000, null), null);
  });
});
