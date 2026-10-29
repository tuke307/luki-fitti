import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundException } from '@nestjs/common';
import { FoodItemSource, MealType } from '@luki-fitti/common/enums';
import { enumerateDateKeys, localDateKey, NutritionService } from './nutrition.service';
import type { PrismaService } from '../database/prisma.service';
import type { StorageService } from '../storage/storage.service';
import type { AppSettingsService } from '../app-settings/app-settings.service';

describe('nutrition date helpers', () => {
  it('buckets instants by local date in the requested time zone', () => {
    const lateEvening = new Date('2026-10-28T22:30:00Z');
    assert.equal(localDateKey(lateEvening, 'UTC'), '2026-10-28');
    assert.equal(localDateKey(lateEvening, 'Europe/Berlin'), '2026-10-28');
    assert.equal(localDateKey(new Date('2026-10-28T23:30:00Z'), 'Europe/Berlin'), '2026-10-29');
    assert.equal(localDateKey(new Date('2026-10-29T03:00:00Z'), 'America/New_York'), '2026-10-28');
  });

  it('enumerates inclusive date ranges across month ends', () => {
    assert.deepEqual(enumerateDateKeys('2026-10-30', '2026-11-02'), [
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    assert.deepEqual(enumerateDateKeys('2026-11-02', '2026-11-01'), []);
  });
});

describe('NutritionService.getSummary', () => {
  const prisma = {
    mealEntry: {
      findMany: async () => [
        {
          eatenAt: new Date('2026-10-28T07:00:00Z'),
          mealType: MealType.BREAKFAST,
          items: [{ kcal: 400, proteinG: 20, carbsG: 50, fatG: 10 }],
        },
        {
          eatenAt: new Date('2026-10-28T23:30:00Z'), // 29th in Berlin
          mealType: MealType.SNACK,
          items: [{ kcal: 200, proteinG: 5, carbsG: 30, fatG: 6 }],
        },
      ],
    },
    workoutSession: {
      findMany: async () => [
        { startedAt: new Date('2026-10-28T17:00:00Z'), estimatedCaloriesKcal: 310, activeCaloriesKcal: null },
      ],
    },
    userPreferences: {
      findUnique: async () => ({ dailyKcalGoal: 2400, proteinGoalG: 150, carbsGoalG: null, fatGoalG: null }),
    },
  } as unknown as PrismaService;
  const service = new NutritionService(
    prisma,
    {} as StorageService,
    {} as AppSettingsService,
  );

  it('sums intake and burn per local day and averages over logged days', async () => {
    const summary = await service.getSummary('u1', '2026-10-28', '2026-10-30', 'Europe/Berlin');
    assert.deepEqual(
      summary.days.map((d) => [d.date, d.kcal, d.burnedKcal, d.entries]),
      [
        ['2026-10-28', 400, 310, 1],
        ['2026-10-29', 200, 0, 1],
        ['2026-10-30', 0, 0, 0],
      ],
    );
    assert.equal(summary.loggedDays, 2);
    assert.equal(summary.averages.kcal, 300);
    assert.equal(summary.goals.dailyKcalGoal, 2400);
    assert.deepEqual(
      summary.byMealType.map((m) => m.mealType),
      [MealType.BREAKFAST, MealType.SNACK],
    );
  });
});

describe('NutritionService ownership', () => {
  it('returns 404 for entries owned by someone else', async () => {
    const prisma = {
      mealEntry: {
        findUnique: async () => ({
          id: 'e1',
          userId: 'other',
          clientEntryId: 'client-1',
          eatenAt: new Date(),
          mealType: MealType.LUNCH,
          label: null,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          items: [{ id: 'i', orderIndex: 0, name: 'x', grams: null, kcal: 1, proteinG: 0, carbsG: 0, fatG: 0, fiberG: null, sugarG: null, source: FoodItemSource.MANUAL, confidence: null }],
          photos: [],
        }),
      },
    } as unknown as PrismaService;
    const service = new NutritionService(prisma, {} as StorageService, {} as AppSettingsService);
    await assert.rejects(service.getEntry('me', 'e1'), NotFoundException);
  });
});
