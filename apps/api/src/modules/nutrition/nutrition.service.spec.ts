import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundException } from '@nestjs/common';
import { FoodItemSource, MealAmountUnit, MealType } from '@luki-fitti/common/enums';
import type { MealItemDto } from '@luki-fitti/common/schemas';
import {
  enumerateDateKeys,
  localDateKey,
  NutritionService,
  rankHistoryPicks,
  type HistorySourceEntry,
} from './nutrition.service';
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
        {
          startedAt: new Date('2026-10-28T17:00:00Z'),
          estimatedCaloriesKcal: 310,
          activeCaloriesKcal: null,
        },
      ],
    },
    userPreferences: {
      findUnique: async () => ({
        dailyKcalGoal: 2400,
        proteinGoalG: 150,
        carbsGoalG: null,
        fatGoalG: null,
      }),
    },
  } as unknown as PrismaService;
  const service = new NutritionService(prisma, {} as StorageService, {} as AppSettingsService);

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
          items: [
            {
              id: 'i',
              orderIndex: 0,
              name: 'x',
              grams: null,
              amountUnit: 'G',
              kcal: 1,
              proteinG: 0,
              carbsG: 0,
              fatG: 0,
              fiberG: null,
              sugarG: null,
              source: FoodItemSource.MANUAL,
              confidence: null,
            },
          ],
          photos: [],
        }),
      },
    } as unknown as PrismaService;
    const service = new NutritionService(prisma, {} as StorageService, {} as AppSettingsService);
    await assert.rejects(service.getEntry('me', 'e1'), NotFoundException);
  });
});

describe('rankHistoryPicks', () => {
  const now = new Date('2026-11-02T12:00:00Z');
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
  const item = (name: string, grams: number, kcal: number): MealItemDto => ({
    id: `${name}-${grams}`,
    orderIndex: 0,
    name,
    grams,
    amountUnit: MealAmountUnit.G,
    kcal,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: null,
    sugarG: null,
    source: FoodItemSource.MANUAL,
    confidence: null,
  });
  const entry = (
    age: number,
    items: MealItemDto[],
    label: string | null = null,
  ): HistorySourceEntry => ({
    label,
    mealType: MealType.BREAKFAST,
    eatenAt: daysAgo(age),
    createdAt: daysAgo(age),
    items,
  });
  const breakfast = (age: number, muesliGrams = 100) =>
    entry(age, [item('Müsli', muesliGrams, 380), item('Haferdrink', 150, 70)]);

  it('ranks a frequent combination above a recent one-off and merges identical combos', () => {
    const res = rankHistoryPicks(
      [
        breakfast(1),
        entry(0, [item('Pizza', 300, 800), item('Cola', 330, 140)]),
        breakfast(3),
        breakfast(5),
      ],
      undefined,
      now,
    );
    assert.equal(res.entries.length, 2);
    assert.deepEqual(
      res.entries[0]?.items.map((i) => i.name),
      ['Müsli', 'Haferdrink'],
    );
    assert.equal(res.entries[0]?.timesLogged, 3);
    assert.equal(res.entries[0]?.totals.kcal, 450);
    assert.equal(res.entries[0]?.lastLoggedAt, daysAgo(1).toISOString());
    assert.equal(res.items[0]?.item.name, 'Müsli');
  });

  it('weights recent weeks over old frequency', () => {
    const old = [60, 61, 62].map((d) => entry(d, [item('Toast', 50, 130)]));
    const res = rankHistoryPicks(
      [...old, entry(1, [item('Skyr', 150, 95)]), entry(2, [item('Skyr', 150, 95)])],
      undefined,
      now,
    );
    assert.deepEqual(
      res.items.map((i) => i.item.name),
      ['Skyr', 'Toast'],
    );
  });

  it('keeps the newest amounts and treats names case-insensitively', () => {
    const res = rankHistoryPicks(
      [entry(1, [item('müsli ', 60, 230)]), entry(4, [item('Müsli', 100, 380)])],
      undefined,
      now,
    );
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0]?.item.grams, 60);
    assert.equal(res.items[0]?.timesLogged, 2);
  });

  it('only lists combinations of two or more foods as entries', () => {
    const res = rankHistoryPicks([entry(1, [item('Apfel', 150, 80)])], undefined, now);
    assert.deepEqual(res.entries, []);
    assert.equal(res.items.length, 1);
  });

  it('searches food names and entry labels', () => {
    const entries = [
      breakfast(1),
      entry(2, [item('Reis', 200, 260), item('Hähnchen', 150, 165)], 'Meal Prep'),
    ];
    const byFood = rankHistoryPicks(entries, 'hafer', now);
    assert.deepEqual(
      byFood.items.map((i) => i.item.name),
      ['Haferdrink'],
    );
    assert.equal(byFood.entries.length, 1);
    const byLabel = rankHistoryPicks(entries, 'meal prep', now);
    assert.equal(byLabel.entries[0]?.label, 'Meal Prep');
    assert.deepEqual(byLabel.items, []);
  });
});

describe('NutritionService.getHistoryPicks', () => {
  it('queries only the signed-in user within the window', async () => {
    let where: Record<string, unknown> | undefined;
    const prisma = {
      mealEntry: {
        findMany: async (args: { where: Record<string, unknown> }) => {
          where = args.where;
          return [];
        },
      },
    } as unknown as PrismaService;
    const service = new NutritionService(prisma, {} as StorageService, {} as AppSettingsService);
    const now = new Date('2026-11-02T12:00:00Z');
    assert.deepEqual(await service.getHistoryPicks('me', undefined, now), {
      entries: [],
      items: [],
    });
    assert.equal(where?.userId, 'me');
    const since = (where?.eatenAt as { gte: Date }).gte;
    assert.equal(Math.round((now.getTime() - since.getTime()) / 86_400_000), 180);
  });
});
