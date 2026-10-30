'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@luki-fitti/ui/components/ui/badge';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Card } from '@luki-fitti/ui/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@luki-fitti/ui/components/ui/dialog';
import { Progress } from '@luki-fitti/ui/components/ui/progress';
import { Spinner } from '@luki-fitti/ui/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@luki-fitti/ui/components/ui/tabs';
import { AiRunStatus } from '@luki-fitti/common/enums';
import { AI_USAGE_RANGE_DAYS, type MyAiUsageDto } from '@luki-fitti/common/schemas';
import type { ApiResponse } from '@luki-fitti/common/api/responses/api.response';
import { api } from '@/lib/api';
import { formatCount, formatUsd } from '@/lib/ai/ai-cost';
import { useLocale } from '@/providers/i18n/locale-context';

type Loader = (days: number) => Promise<ApiResponse<MyAiUsageDto>>;
type State = { key: string; data: MyAiUsageDto | null; error: boolean };

const defaultLoader: Loader = (days) => api.ai.myUsage(days);

/** AI requests, tokens and cost over 7/30/90 days. Defaults to the signed-in user's own usage. */
export function AiUsageView({ load = defaultLoader }: { load?: Loader }) {
  const { t, format, bcp47 } = useLocale();
  const [days, setDays] = useState<number>(30);
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<State>({ key: '', data: null, error: false });
  const key = `${days}#${nonce}`;
  const fetchUsage = useEffectEvent((d: number) => load(d));

  useEffect(() => {
    let cancelled = false;
    fetchUsage(days)
      .then((res) => !cancelled && setState({ key, data: res.data ?? null, error: false }))
      .catch(() => !cancelled && setState((s) => ({ key, data: s.data, error: true })));
    return () => {
      cancelled = true;
    };
  }, [key, days]);

  const loading = state.key !== key;
  const data = state.data;
  const skillLabel = (skill: string) =>
    (t.aiUsage.skills as Record<string, string>)[skill] ?? skill;
  const usd = (v: number | null) => (v === null ? t.aiUsage.costUnavailable : formatUsd(v, bcp47));
  const num = (v: number) => formatCount(v, bcp47);
  const day = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(bcp47, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });

  return (
    <div className="space-y-4" aria-busy={loading}>
      <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
        <TabsList aria-label={t.aiUsage.rangeLabel}>
          {AI_USAGE_RANGE_DAYS.map((d) => (
            <TabsTrigger key={d} value={String(d)}>
              {format(t.aiUsage.range, { days: d })}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {!data && loading ? (
        <div className="flex justify-center py-10" role="status">
          <Spinner />
          <span className="sr-only">{t.aiUsage.loading}</span>
        </div>
      ) : !data || (state.error && !loading) ? (
        <div className="space-y-3 py-4" role="alert">
          <p className="text-[0.9375rem]">{t.aiUsage.error}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setNonce((n) => n + 1)}
          >
            {t.aiUsage.retry}
          </Button>
        </div>
      ) : (
        <UsageBody data={data} skillLabel={skillLabel} usd={usd} num={num} day={day} />
      )}
    </div>
  );
}

function UsageBody({
  data,
  skillLabel,
  usd,
  num,
  day,
}: {
  data: MyAiUsageDto;
  skillLabel: (s: string) => string;
  usd: (v: number | null) => string;
  num: (v: number) => string;
  day: (iso: string) => string;
}) {
  const { t, format, bcp47 } = useLocale();
  const peak = data.byDay.reduce((max, d) => (d.runs > max.runs ? d : max), data.byDay[0]!);
  const quotaPct =
    data.today.limit > 0 ? Math.min(100, (data.today.used / data.today.limit) * 100) : 100;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-[0.8125rem]">{t.aiUsage.totalCost}</p>
          <p className="font-rounded text-[2rem] leading-tight font-bold tabular-nums">
            {usd(data.costUsd)}
          </p>
          <p className="text-muted-foreground text-[0.8125rem] tabular-nums">
            {format(t.aiUsage.tokenCount, {
              count: num(data.promptTokens + data.completionTokens),
            })}{' '}
            (
            {format(t.aiUsage.tokensDetail, {
              prompt: num(data.promptTokens),
              completion: num(data.completionTokens),
            })}
            )
          </p>
        </div>
        <div className="min-w-40 space-y-1.5">
          <p className="text-muted-foreground text-[0.8125rem]">{t.aiUsage.todayLabel}</p>
          <p className="text-[0.9375rem] font-semibold tabular-nums">
            {format(t.aiUsage.today, { used: num(data.today.used), limit: num(data.today.limit) })}
          </p>
          <Progress
            value={quotaPct}
            aria-label={format(t.aiUsage.today, { used: data.today.used, limit: data.today.limit })}
          />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3">
        {(
          [
            [t.aiUsage.requests, num(data.totalRuns)],
            [t.aiUsage.failed, num(data.failedRuns)],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="bg-secondary/60 rounded-2xl px-3.5 py-3">
            <dt className="text-muted-foreground text-[0.8125rem]">{label}</dt>
            <dd className="font-rounded text-[1.25rem] font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {data.totalRuns === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-[0.9375rem]">{t.aiUsage.empty}</p>
      ) : (
        <>
          {data.unknownCostRuns > 0 && (
            <p className="text-muted-foreground text-[0.8125rem]">
              {format(t.aiUsage.unknownCost, { count: num(data.unknownCostRuns) })}
            </p>
          )}

          <section className="space-y-2">
            <h3 className="text-[0.9375rem] font-semibold">{t.aiUsage.perDay}</h3>
            <div
              className="h-40 w-full"
              role="img"
              aria-label={format(t.aiUsage.chartSummary, {
                runs: num(data.totalRuns),
                days: data.days,
                date: day(peak.date),
                max: num(peak.runs),
              })}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byDay} margin={{ top: 4, right: 0, left: -24, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={day}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    cursor={{ fill: 'color-mix(in oklch, var(--muted) 60%, transparent)' }}
                    wrapperStyle={{ outline: 'none' }}
                    labelFormatter={(d) => day(String(d))}
                    formatter={(v, _n, item) => [
                      `${num(Number(v))} · ${usd((item.payload as { costUsd: number }).costUsd)}`,
                      t.aiUsage.requests,
                    ]}
                  />
                  <Bar dataKey="runs" fill="var(--chart-1)" radius={[6, 6, 6, 6]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="space-y-1">
            <h3 className="text-[0.9375rem] font-semibold">{t.aiUsage.byFeature}</h3>
            <ul className="divide-border/60 divide-y text-[0.9375rem]">
              {data.bySkill.map((s) => (
                <li key={s.skill} className="flex justify-between gap-3 py-2.5">
                  <span>{skillLabel(s.skill)}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {num(s.runs)} · {usd(s.costUsd)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-1">
            <h3 className="text-[0.9375rem] font-semibold">{t.aiUsage.recent}</h3>
            <ul className="divide-border/60 divide-y text-[0.9375rem]">
              {data.recent.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      {skillLabel(r.skill)}
                      {r.status === AiRunStatus.ERROR && (
                        <Badge variant="warning">{t.aiUsage.statusFailed}</Badge>
                      )}
                    </p>
                    <p className="text-muted-foreground text-[0.8125rem]">
                      {new Date(r.createdAt).toLocaleString(bcp47, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>
                  </div>
                  <div className="text-muted-foreground shrink-0 text-right text-[0.8125rem] tabular-nums">
                    <p className="text-foreground">{usd(r.costUsd)}</p>
                    <p>
                      {format(t.aiUsage.tokenCount, {
                        count: num(r.promptTokens + r.completionTokens),
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      <p className="text-muted-foreground text-[0.75rem]">{t.aiUsage.usdNote}</p>
    </>
  );
}

/** Profile entry: a compact card that opens the personal AI usage overview. */
export function AiUsageCard() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] p-5">
      <div className="flex items-center gap-2.5">
        <Sparkles className="text-primary h-5 w-5" aria-hidden="true" />
        <div>
          <h2 className="font-display text-lg font-bold">{t.aiUsage.title}</h2>
          <p className="text-muted-foreground text-xs">{t.aiUsage.sub}</p>
        </div>
      </div>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {t.aiUsage.open}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92dvh] flex-col gap-0 p-0 sm:max-w-xl">
          <DialogHeader className="px-5 pt-5 pb-3 text-left">
            <DialogTitle>{t.aiUsage.title}</DialogTitle>
            <DialogDescription>{t.aiUsage.sub}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{open && <AiUsageView />}</div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
