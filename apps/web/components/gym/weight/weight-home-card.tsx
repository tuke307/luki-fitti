'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, Plus, Scale } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { WeightUnit } from '@luki-fitti/common/enums';
import { weightTrend } from '@luki-fitti/common/utils/client';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';
import { unitLabel } from '@/lib/format/weight';
import { useBodyWeight } from '@/lib/body-weight/use-body-weight';
import { calendarDaysAgo, sparklinePoints, toDisplayWeight } from '@/lib/body-weight/body-weight';
import {
  formatDaysAgo,
  formatWeighInDate,
  formatWeight,
  formatWeightDelta,
} from '@/lib/body-weight/weight-format';

interface WeightHomeCardProps {
  /** Opens the weight section (profile tab) with the weight input focused. */
  onLogWeight: () => void;
  /** Opens the weight section (profile tab) at the history. */
  onOpenHistory: () => void;
}

/** Today card: current weight, 7-day change and a 30-day chart with the 7-day average. */
export function WeightHomeCard({ onLogWeight, onOpenHistory }: WeightHomeCardProps) {
  const { user } = useAuth();
  const { t, format, bcp47 } = useLocale();
  const { enabled, entries, latest } = useBodyWeight();
  const [nowMs] = useState(() => Date.now());
  const unit = user?.preferences?.weightUnit ?? WeightUnit.KG;
  const unitText = unitLabel(unit);

  const points = useMemo(
    () => sparklinePoints(entries, unit, new Date(nowMs)),
    [entries, unit, nowMs],
  );
  const change7d = useMemo(
    () => weightTrend(entries, new Date(nowMs)).change7dKg,
    [entries, nowMs],
  );
  const yDomain = useMemo(() => {
    const values = points.flatMap((p) => [p.weight, p.avg]);
    if (values.length === 0) return [0, 1];
    return [Math.floor(Math.min(...values) - 0.5), Math.ceil(Math.max(...values) + 0.5)];
  }, [points]);

  if (!enabled) return null;

  const first = points[0];
  const last = points[points.length - 1];
  const chartLabel =
    first && last
      ? format(t.weight.homeChartAria, {
          from: formatWeighInDate(first.t, bcp47),
          to: formatWeighInDate(last.t, bcp47),
          latest: formatWeight(last.weight, bcp47),
          avg: formatWeight(last.avg, bcp47),
          unit: unitText,
        })
      : '';

  return (
    <section
      aria-labelledby="home-weight"
      data-testid="home-weight-card"
      className="bg-card space-y-4 rounded-[1.25rem] p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="home-weight" className="flex items-center gap-2 text-[1.0625rem] font-semibold">
          <Scale className="text-primary h-4 w-4" aria-hidden="true" /> {t.weight.title}
        </h2>
        {entries.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-primary -mr-2"
            onClick={onOpenHistory}
          >
            {t.weight.homeOpen} <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      {latest ? (
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <p className="font-rounded text-[2.125rem] leading-tight font-semibold tabular-nums">
            {formatWeight(toDisplayWeight(latest.weightKg, unit), bcp47)}
            <span className="text-muted-foreground text-[1.0625rem] font-medium"> {unitText}</span>
          </p>
          <div className="space-y-0.5">
            {change7d !== null && (
              <p className="text-[0.9375rem] font-medium tabular-nums">
                {format(t.weight.homeChange7d, {
                  change: formatWeightDelta(toDisplayWeight(change7d, unit), bcp47),
                  unit: unitText,
                })}
              </p>
            )}
            <p className="text-muted-foreground text-[0.8125rem]">
              {format(t.weight.homeLast, {
                when: formatDaysAgo(calendarDaysAgo(latest.measuredAt, new Date(nowMs)), bcp47),
              })}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-[1.25rem] font-semibold">{t.weight.homeEmptyTitle}</p>
          <p className="text-muted-foreground text-[0.9375rem]">{t.weight.homeEmptyHint}</p>
        </div>
      )}

      {points.length >= 2 && (
        <div className="h-[120px] w-full" role="img" aria-label={chartLabel}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={points}
              margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
              accessibilityLayer={false}
            >
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(ms: number) =>
                  new Date(ms).toLocaleDateString(bcp47, { day: 'numeric', month: 'short' })
                }
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                orientation="right"
                domain={yDomain}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
                width={32}
                tickCount={3}
                allowDecimals={false}
              />
              <Line
                type="monotone"
                dataKey="weight"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={{ r: 2.5, fill: 'var(--chart-1)', strokeWidth: 0 }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="avg"
                stroke="var(--muted-foreground)"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <Button type="button" size="lg" className="w-full" onClick={onLogWeight}>
        <Plus className="h-4 w-4" aria-hidden="true" /> {t.weight.homeCta}
      </Button>
    </section>
  );
}
