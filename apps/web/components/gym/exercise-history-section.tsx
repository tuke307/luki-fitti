'use client';

import { useId, useMemo, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Trophy } from 'lucide-react';
import { Badge } from '@luki-fitti/ui/components/ui/badge';
import { Button } from '@luki-fitti/ui/components/ui/button';
import type { ExerciseType } from '@luki-fitti/common/enums';
import {
  buildExerciseHistoryLog,
  formatRestDurationMinSec,
  type ExerciseHistorySet,
} from '@luki-fitti/common/utils/client';
import { unitLabel } from '@/lib/format/weight';
import { formatWeighInDate } from '@/lib/body-weight/weight-format';
import { useGym } from '@/providers/gym/gym-context';
import { useLocale } from '@/providers/i18n/locale-context';

const INITIAL_SESSIONS = 5;

interface ExerciseHistorySectionProps {
  exerciseId: string | null | undefined;
  exerciseName?: string | null;
  exerciseType?: ExerciseType | null;
}

/** Summary, estimated-1RM trend and recent sessions of one exercise, for the exercise sheet. */
export function ExerciseHistorySection({
  exerciseId,
  exerciseName,
  exerciseType,
}: ExerciseHistorySectionProps) {
  const { historySessions, weightUnit } = useGym();
  const { t, format, bcp47 } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const chartTitleId = useId();
  const chartSummaryId = useId();
  const unit = unitLabel(weightUnit);
  const h = t.exerciseHistory;

  const log = useMemo(
    () =>
      buildExerciseHistoryLog({
        exerciseId,
        exerciseName,
        exerciseType,
        historySessions,
        weightUnit,
      }),
    [exerciseId, exerciseName, exerciseType, historySessions, weightUnit],
  );

  const num = (value: number) => value.toLocaleString(bcp47, { maximumFractionDigits: 1 });
  const date = (iso: string) => formatWeighInDate(iso, bcp47);
  const metricValue = (value: number) =>
    log.metric === 'WEIGHT'
      ? `${num(value)} ${unit}`
      : log.metric === 'REPS'
        ? format(h.reps, { reps: value })
        : formatRestDurationMinSec(value);
  const setText = (s: ExerciseHistorySet) =>
    s.weight !== null && s.reps !== null
      ? format(h.weightReps, { weight: num(s.weight), unit, reps: s.reps })
      : s.weight !== null
        ? format(h.weightOnly, { weight: num(s.weight), unit })
        : s.reps !== null
          ? format(h.reps, { reps: s.reps })
          : formatRestDurationMinSec(s.durationSeconds ?? 0);

  const summary: Array<{ label: string; value: string }> =
    log.metric === 'WEIGHT'
      ? [
          {
            label: h.bestE1rm,
            value: log.bestEstimated1RM ? metricValue(log.bestEstimated1RM) : '–',
          },
          {
            label: h.heaviestSet,
            value: log.heaviestSet
              ? log.heaviestSet.reps > 0
                ? format(h.weightReps, {
                    weight: num(log.heaviestSet.weight),
                    unit,
                    reps: log.heaviestSet.reps,
                  })
                : format(h.weightOnly, { weight: num(log.heaviestSet.weight), unit })
              : '–',
          },
        ]
      : log.metric === 'REPS'
        ? [{ label: h.mostReps, value: String(log.mostReps ?? '–') }]
        : [
            {
              label: h.longestSet,
              value: log.longestDurationSeconds
                ? formatRestDurationMinSec(log.longestDurationSeconds)
                : '–',
            },
          ];
  summary.push({ label: h.sessions, value: String(log.sessions.length) });

  const points = log.trend.map((p) => ({ t: Date.parse(p.startedAt), value: p.value }));
  const chartTitle = log.metric === 'REPS' ? h.trendTitleReps : h.trendTitle;
  const chartSummary =
    points.length >= 2
      ? format(h.chartSummary, {
          metric: chartTitle,
          first: metricValue(points[0]!.value),
          firstDate: date(log.trend[0]!.startedAt),
          last: metricValue(points[points.length - 1]!.value),
          lastDate: date(log.trend[log.trend.length - 1]!.startedAt),
          best: metricValue(Math.max(...points.map((p) => p.value))),
        })
      : '';
  const visible = expanded ? log.sessions : log.sessions.slice(0, INITIAL_SESSIONS);

  return (
    <section data-testid="exercise-history" className="space-y-3 border-t pt-4">
      <h3 className="font-display text-sm font-bold">{h.title}</h3>

      {log.sessions.length === 0 ? (
        <p
          data-testid="exercise-history-empty"
          className="bg-secondary/40 text-muted-foreground rounded-xl p-3 text-[0.8125rem]"
        >
          {h.empty}
        </p>
      ) : (
        <>
          <dl className={`grid gap-2 ${summary.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {summary.map((item) => (
              <div key={item.label} className="bg-secondary/40 rounded-xl px-3 py-2">
                <dt className="text-muted-foreground text-xs">{item.label}</dt>
                <dd className="tabular-nums text-sm font-semibold">{item.value}</dd>
              </div>
            ))}
          </dl>

          {points.length >= 2 && (
            <div className="space-y-1">
              <p id={chartTitleId} className="text-muted-foreground text-xs font-medium">
                {chartTitle}
              </p>
              <div
                className="h-28 w-full"
                role="img"
                aria-labelledby={chartTitleId}
                aria-describedby={chartSummaryId}
                data-testid="exercise-history-chart"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={points}
                    margin={{ top: 6, right: 6, left: -18, bottom: 0 }}
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
                      tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                      allowDecimals={false}
                    />
                    <Tooltip
                      cursor={{ stroke: 'var(--border)' }}
                      wrapperStyle={{ outline: 'none' }}
                      content={({ active, payload }) => {
                        const row = active
                          ? (payload?.[0]?.payload as (typeof points)[number] | undefined)
                          : undefined;
                        if (!row) return null;
                        return (
                          <div className="bg-popover text-popover-foreground pointer-events-none rounded-xl px-3 py-2 text-[0.8125rem]">
                            <p className="font-semibold">{date(new Date(row.t).toISOString())}</p>
                            <p className="tabular-nums">{metricValue(row.value)}</p>
                          </div>
                        );
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="var(--chart-1)"
                      strokeWidth={2}
                      dot={{
                        r: 2.5,
                        fill: 'var(--chart-1)',
                        stroke: 'var(--card)',
                        strokeWidth: 1,
                      }}
                      activeDot={{ r: 4 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p id={chartSummaryId} className="sr-only">
                {chartSummary}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-muted-foreground text-xs font-medium">{h.recentTitle}</p>
            <ul className="space-y-1.5">
              {visible.map((entry) => (
                <li
                  key={entry.clientSessionId}
                  data-testid="exercise-history-session"
                  className="bg-secondary/40 space-y-1.5 rounded-xl px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate">
                      <span className="tabular-nums font-semibold">{date(entry.startedAt)}</span>
                      <span className="text-muted-foreground"> · {entry.workoutName}</span>
                    </p>
                    {entry.isPersonalRecord && (
                      <Badge variant="success" title={h.prLabel} data-testid="exercise-history-pr">
                        <Trophy aria-hidden="true" />
                        <span aria-hidden="true">{h.pr}</span>
                        <span className="sr-only">{h.prLabel}</span>
                      </Badge>
                    )}
                  </div>
                  <ul className="flex flex-wrap gap-1">
                    {entry.sets.map((s, i) => (
                      <li
                        key={i}
                        className={
                          s.warmup
                            ? 'text-muted-foreground/80 bg-background/60 tabular-nums rounded-md px-1.5 py-0.5'
                            : 'bg-background tabular-nums rounded-md px-1.5 py-0.5 font-semibold'
                        }
                        title={s.warmup ? h.warmup : undefined}
                      >
                        {s.warmup && <span className="sr-only">{h.warmup}: </span>}
                        {setText(s)}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            {!expanded && log.sessions.length > INITIAL_SESSIONS && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                data-testid="exercise-history-show-more"
                onClick={() => setExpanded(true)}
              >
                {h.showMore}
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
