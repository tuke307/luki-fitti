import { Inject } from '@nestjs/common';
import { McpController, McpRawRequest, Tool, ToolScopes } from '@rekog/mcp-nest';
import { Payload } from '@nestjs/microservices';
import { z } from 'zod';
import type { PublicMealEntryDto } from '@luki-fitti/common/schemas';
import { goalProgress, sumMacros, type MacroValues } from '@luki-fitti/common/utils';
import { LukiFittiApiClient } from '../lukifitti-api.client';
import { okResult, runTool, ToolRateLimiter, truncateRows, type ToolResult } from './tool-utils';
import {
  addDaysToDayKey,
  DEFAULT_TIME_ZONE,
  dayKeyInZone,
  resolveRange,
  RELATIVE_WORDS,
} from './mcp-date-utils';
import { nutritionGoalsFor } from './unit';

const dateInput = z
  .string()
  .describe(`YYYY-MM-DD or a relative word: ${RELATIVE_WORDS.join(', ')}`);

const NutritionSummarySchema = z.object({
  from: dateInput.optional().describe('Range start (inclusive). Default: 30 days back.'),
  to: dateInput.optional().describe('Range end (inclusive). Default: today.'),
});

export interface NutritionDay {
  day: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  kcalProgress: number | null;
  proteinProgress: number | null;
}

/** Per-day macro totals vs goals — the pure part of nutrition-summary. */
export function nutritionByDay(
  meals: ReadonlyArray<{
    eatenAt: string;
    items: ReadonlyArray<Partial<MacroValues>>;
  }>,
  goals: { dailyKcalGoal: number | null; proteinGoalG: number | null },
  timeZone: string = DEFAULT_TIME_ZONE,
): NutritionDay[] {
  const byDay = new Map<string, { kcal: number; proteinG: number; carbsG: number; fatG: number }>();
  for (const meal of meals) {
    const day = dayKeyInZone(new Date(meal.eatenAt), timeZone);
    const totals = sumMacros(meal.items);
    const agg = byDay.get(day) ?? { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
    agg.kcal += totals.kcal;
    agg.proteinG += totals.proteinG;
    agg.carbsG += totals.carbsG;
    agg.fatG += totals.fatG;
    byDay.set(day, agg);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, t]) => ({
      day,
      kcal: Math.round(t.kcal),
      proteinG: Math.round(t.proteinG),
      carbsG: Math.round(t.carbsG),
      fatG: Math.round(t.fatG),
      kcalProgress: goalProgress(t.kcal, goals.dailyKcalGoal),
      proteinProgress: goalProgress(t.proteinG, goals.proteinGoalG),
    }));
}

@McpController()
export class NutritionTool {
  constructor(
    @Inject(LukiFittiApiClient)
    private readonly api: LukiFittiApiClient,
    @Inject(ToolRateLimiter)
    private readonly limiter: ToolRateLimiter,
  ) {}

  @Tool({
    name: 'nutrition-summary',
    description:
      'Nutrition per day in a date range: kcal, protein, carbs and fat vs goals (when the key may read the profile), plus the averages.',
    parameters: NutritionSummarySchema,
  })
  @ToolScopes(['read:nutrition'])
  async nutritionSummary(
    @Payload() input: z.infer<typeof NutritionSummarySchema>,
    @McpRawRequest() req: unknown,
  ): Promise<ToolResult> {
    return runTool(this.limiter, req, async () => {
      const range = resolveRange(input);
      const [goals, fetched] = await Promise.all([
        nutritionGoalsFor(this.api, req),
        this.api.getAll<PublicMealEntryDto>(
          '/v1/meals',
          { from: range.from, to: range.to, limit: 200 },
          req,
          { maxRows: 1000 },
        ),
      ]);
      const days = nutritionByDay(
        fetched.rows,
        {
          dailyKcalGoal: goals?.dailyKcalGoal ?? null,
          proteinGoalG: goals?.proteinGoalG ?? null,
        },
        DEFAULT_TIME_ZONE,
      );
      const { rows, truncated: rowsTruncated } = truncateRows(days);
      const truncated = rowsTruncated || fetched.truncated;
      const n = Math.max(1, days.length);
      const average = (f: (d: NutritionDay) => number) =>
        Math.round(days.reduce((s, d) => s + f(d), 0) / n);
      return okResult(
        `${days.length} day(s) with meals, avg ${average((d) => d.kcal)} kcal${fetched.truncated ? ' (partial range — truncated)' : ''}.`,
        {
          goals: goals
            ? {
                dailyKcalGoal: goals.dailyKcalGoal,
                proteinGoalG: goals.proteinGoalG,
                carbsGoalG: goals.carbsGoalG,
                fatGoalG: goals.fatGoalG,
              }
            : null,
          days: rows,
          averages: {
            kcal: average((d) => d.kcal),
            proteinG: average((d) => d.proteinG),
            carbsG: average((d) => d.carbsG),
            fatG: average((d) => d.fatG),
          },
          truncated,
          hint: truncated ? 'Narrow the date range' : undefined,
        },
      );
    });
  }
}

// Re-exported for tests: day keys the summary groups by.
export { addDaysToDayKey };
