import { Inject } from '@nestjs/common';
import { McpController, McpRawRequest, Tool, ToolScopes } from '@rekog/mcp-nest';
import { Payload } from '@nestjs/microservices';
import { z } from 'zod';
import type { PublicBodyWeightEntryDto } from '@luki-fitti/common/schemas';
import { movingAverageWeights, weightTrend } from '@luki-fitti/common/utils';
import { LukiFittiApiClient } from '../lukifitti-api.client';
import { okResult, runTool, ToolRateLimiter, truncateRows, type ToolResult } from './tool-utils';
import { resolveRange, RELATIVE_WORDS } from './mcp-date-utils';
import { weightUnitFor } from './unit';
import { weightInUnit } from './insights';

const dateInput = z
  .string()
  .describe(`YYYY-MM-DD or a relative word: ${RELATIVE_WORDS.join(', ')}`);

const BodyWeightSchema = z.object({
  from: dateInput.optional().describe('Range start (inclusive). Default: 90 days back.'),
  to: dateInput.optional().describe('Range end (inclusive). Default: today.'),
});

@McpController()
export class BodyWeightTool {
  constructor(
    @Inject(LukiFittiApiClient)
    private readonly api: LukiFittiApiClient,
    @Inject(ToolRateLimiter)
    private readonly limiter: ToolRateLimiter,
  ) {}

  @Tool({
    name: 'body-weight-trend',
    description:
      'Body-weight entries in a date range with the 7-day moving average and the change over the range.',
    parameters: BodyWeightSchema,
  })
  @ToolScopes(['read:body'])
  async bodyWeightTrend(
    @Payload() input: z.infer<typeof BodyWeightSchema>,
    @McpRawRequest() req: unknown,
  ): Promise<ToolResult> {
    return runTool(this.limiter, req, async () => {
      const range = resolveRange({ from: input.from ?? 'last-90-days', to: input.to });
      const [unit, fetched] = await Promise.all([
        weightUnitFor(this.api, req),
        this.api.getAll<PublicBodyWeightEntryDto>(
          '/v1/body-weight',
          { from: range.from, to: range.to, limit: 200 },
          req,
          { maxRows: 1000 },
        ),
      ]);
      const entries = fetched.rows;
      const withAverage = movingAverageWeights(entries, 7);
      const trend = weightTrend(entries);
      const rows = withAverage.map(({ entry, averageKg }) => ({
        date: entry.measuredAt,
        weight: weightInUnit(entry.weightKg, unit),
        movingAverage7d: weightInUnit(averageKg, unit),
      }));
      const first = entries.reduce<PublicBodyWeightEntryDto | null>(
        (a, e) => (a === null || e.measuredAt < a.measuredAt ? e : a),
        null,
      );
      const last = entries.reduce<PublicBodyWeightEntryDto | null>(
        (a, e) => (a === null || e.measuredAt > a.measuredAt ? e : a),
        null,
      );
      const change = first && last ? weightInUnit(last.weightKg - first.weightKg, unit) : null;
      const { rows: page, truncated: rowsTruncated } = truncateRows(rows);
      const truncated = rowsTruncated || fetched.truncated;
      return okResult(
        `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}, latest ${trend.latestKg === null ? '—' : weightInUnit(trend.latestKg, unit)} ${unit}${fetched.truncated ? ' (partial range — truncated)' : ''}.`,
        {
          weightUnit: unit,
          entries: page,
          changeOverRange: change,
          latest: trend.latestKg === null ? null : weightInUnit(trend.latestKg, unit),
          change7d: trend.change7dKg === null ? null : weightInUnit(trend.change7dKg, unit),
          change30d: trend.change30dKg === null ? null : weightInUnit(trend.change30dKg, unit),
          truncated,
          hint: truncated ? 'Narrow the date range' : undefined,
        },
      );
    });
  }
}
