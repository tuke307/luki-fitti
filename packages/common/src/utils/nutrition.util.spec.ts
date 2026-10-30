import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MealAmountUnit } from '../enums';
import {
  formatMealAmount,
  fromDisplayAmount,
  goalProgress,
  reconcileKcal,
  scaleFoodItemToAmount,
  scaleFoodItemToGrams,
  sumMacros,
  toDisplayAmount,
} from './nutrition.util';

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

describe('meal amount units', () => {
  const tea = { grams: 500, amountUnit: MealAmountUnit.ML, kcal: 140, proteinG: 0, carbsG: 34, fatG: 0 };

  it('scales proportionally within the same unit', () => {
    const scaled = scaleFoodItemToAmount(tea, 250);
    assert.equal(scaled.kcal, 70);
    assert.equal(scaled.carbsG, 17);
    assert.equal(scaled.amountUnit, MealAmountUnit.ML);
  });

  it('only relabels when the unit changes', () => {
    const relabeled = scaleFoodItemToAmount(tea, 500, MealAmountUnit.G);
    assert.equal(relabeled.kcal, 140);
    assert.equal(relabeled.grams, 500);
    assert.equal(relabeled.amountUnit, MealAmountUnit.G);
  });

  it('defaults items without a unit to grams', () => {
    const scaled = scaleFoodItemToAmount({ grams: 100, kcal: 200, proteinG: 10, carbsG: 0, fatG: 10 }, 50);
    assert.equal(scaled.kcal, 100);
    assert.equal(scaled.amountUnit, MealAmountUnit.G);
  });

  it('stores litres as millilitres', () => {
    assert.deepEqual(fromDisplayAmount(1.5, 'l'), { amount: 1500, unit: MealAmountUnit.ML });
    assert.deepEqual(fromDisplayAmount(330, 'ml'), { amount: 330, unit: MealAmountUnit.ML });
    assert.deepEqual(fromDisplayAmount(80, 'g'), { amount: 80, unit: MealAmountUnit.G });
  });

  it('picks litres from 1000 ml upward', () => {
    assert.deepEqual(toDisplayAmount(1500, MealAmountUnit.ML), { value: 1.5, unit: 'l' });
    assert.deepEqual(toDisplayAmount(500, MealAmountUnit.ML), { value: 500, unit: 'ml' });
    assert.deepEqual(toDisplayAmount(1500, MealAmountUnit.G), { value: 1500, unit: 'g' });
  });

  it('formats amounts locale-aware', () => {
    assert.equal(formatMealAmount(500, MealAmountUnit.ML, 'en'), '500 ml');
    assert.equal(formatMealAmount(1500, MealAmountUnit.ML, 'de'), '1,5 l');
    assert.equal(formatMealAmount(150, null, 'en'), '150 g');
    assert.equal(formatMealAmount(null, MealAmountUnit.G), '');
  });
});
