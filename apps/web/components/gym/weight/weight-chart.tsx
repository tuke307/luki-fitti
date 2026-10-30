'use client';

import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Tabs, TabsList, TabsTrigger } from '@luki-fitti/ui/components/ui/tabs';
import type { WeightUnit } from '@luki-fitti/common/enums';
import type { BodyWeightEntryDto } from '@luki-fitti/common/schemas';
import { unitLabel } from '@/lib/format/weight';
import {
  buildWeightChart,
  WEIGHT_RANGES,
  type WeightChartPoint,
  type WeightRange,
} from '@/lib/body-weight/body-weight';
import {
  formatWeighInDate,
  formatWeighInDateTime,
  formatWeight,
} from '@/lib/body-weight/weight-format';
import { useLocale } from '@/providers/i18n/locale-context';

const DAY_MS = 24 * 60 * 60 * 1000;

interface WeightChartProps {
  entries: readonly BodyWeightEntryDto[];
  unit: WeightUnit;
  /** Latest weigh-in in the display unit (reference line). */
  latest: number | null;
}

/** Weigh-in dots + 7-day moving average, with a range switch and a text summary. */
export function WeightChart({ entries, unit, latest }: WeightChartProps) {
  const { t, format, bcp47 } = useLocale();
  const [range, setRange] = useState<WeightRange>('3m');
  const [nowMs] = useState(() => Date.now());
  const unitText = unitLabel(unit);

  const points = useMemo(
    () => buildWeightChart(entries, range, unit, new Date(nowMs)),
    [entries, range, unit, nowMs],
  );

  const { xDomain, yDomain, summary } = useMemo(() => {
    if (points.length === 0) return { xDomain: [0, 1], yDomain: [0, 1], summary: '' };
    const first = points[0] as WeightChartPoint;
    const last = points[points.length - 1] as WeightChartPoint;
    const values = points.flatMap((p) => [p.weight, p.avg]);
    if (latest !== null) values.push(latest);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(0.5, (max - min) * 0.15);
    const weights = points.map((p) => p.weight);
    const text =
      points.length === 1
        ? format(t.weight.chartSummaryOne, {
            date: formatWeighInDate(first.t, bcp47),
            weight: formatWeight(first.weight, bcp47),
            unit: unitText,
          })
        : format(t.weight.chartSummary, {
            count: points.length,
            from: formatWeighInDate(first.t, bcp47),
            to: formatWeighInDate(last.t, bcp47),
            min: formatWeight(Math.min(...weights), bcp47),
            max: formatWeight(Math.max(...weights), bcp47),
            latest: formatWeight(last.weight, bcp47),
            unit: unitText,
          });
    return {
      xDomain: first.t === last.t ? [first.t - DAY_MS, last.t + DAY_MS] : [first.t, last.t],
      yDomain: [Math.floor(min - pad), Math.ceil(max + pad)],
      summary: text,
    };
  }, [points, latest, format, t, bcp47, unitText]);

  const longRange = range === '1y' || range === 'all';
  const tickFormat = (ms: number) =>
    new Date(ms).toLocaleDateString(
      bcp47,
      longRange ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' },
    );

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="weight-chart-title" className="text-[0.9375rem] font-semibold">
            {t.weight.chartTitle}
          </h3>
          <p className="text-muted-foreground text-[0.8125rem]">{t.weight.chartSub}</p>
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as WeightRange)}>
          <TabsList aria-label={t.weight.rangeLabel}>
            {WEIGHT_RANGES.map((r) => (
              <TabsTrigger key={r} value={r} data-testid={`weight-range-${r}`}>
                {t.weight.ranges[r]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {points.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center text-[0.9375rem]">
          {t.weight.noneInRange}
        </p>
      ) : (
        <div
          className="h-52 w-full"
          role="img"
          aria-labelledby="weight-chart-title"
          aria-describedby="weight-chart-summary"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={points}
              margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
              accessibilityLayer={false}
            >
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={xDomain}
                tickFormatter={tickFormat}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                domain={yDomain}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
                width={44}
                allowDecimals={false}
              />
              {latest !== null && (
                <ReferenceLine
                  y={latest}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  ifOverflow="extendDomain"
                />
              )}
              <Tooltip
                cursor={{ stroke: 'var(--border)' }}
                wrapperStyle={{ outline: 'none' }}
                content={({ active, payload }) => {
                  const row = active
                    ? (payload?.[0]?.payload as WeightChartPoint | undefined)
                    : undefined;
                  if (!row) return null;
                  return (
                    <div className="bg-popover text-popover-foreground pointer-events-none rounded-xl px-3 py-2 text-[0.8125rem]">
                      <p className="font-semibold">{formatWeighInDateTime(row.t, bcp47)}</p>
                      <p className="tabular-nums">
                        {t.weight.weighIn}: {formatWeight(row.weight, bcp47)} {unitText}
                      </p>
                      <p className="text-muted-foreground tabular-nums">
                        {t.weight.average}: {formatWeight(row.avg, bcp47)} {unitText}
                      </p>
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="avg"
                name={t.weight.average}
                stroke="var(--chart-1)"
                strokeWidth={2.5}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="weight"
                name={t.weight.weighIn}
                stroke="transparent"
                dot={{ r: 3, fill: 'var(--chart-2)', stroke: 'var(--card)', strokeWidth: 1 }}
                activeDot={{ r: 5, fill: 'var(--chart-2)', stroke: 'var(--card)' }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {points.length > 0 && (
        <p
          id="weight-chart-summary"
          data-testid="weight-chart-summary"
          className="text-muted-foreground text-[0.8125rem]"
        >
          {summary}
        </p>
      )}
    </div>
  );
}
