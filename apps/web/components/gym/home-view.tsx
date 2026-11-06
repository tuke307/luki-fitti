'use client';

import React, { useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@luki-fitti/ui/components/ui/tabs';
import { useGym } from '@/providers/gym/gym-context';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';
import {
  startOfIsoWeek,
  WEEKLY_SETS_TARGET,
  weeklySetsByMuscle,
  type WeeklySetsStatus,
} from '@luki-fitti/common/utils/client';
import type { WorkoutTemplateDto } from '@luki-fitti/common/schemas';
import { WeightUnit } from '@luki-fitti/common/enums';
import type { NavTab } from './pwa-shell';
import { bigVolume, formatVolume, unitLabel } from '@/lib/format/weight';
import { PageTitle } from './page-title';
import { WeightHomeCard } from './weight/weight-home-card';
import { WeightView } from './weight/weight-view';

interface HomeViewProps {
  onNavigate: (tab: NavTab) => void;
}

const MUSCLE_WEEK_OPTIONS = [4, 12] as const;
/** Weekly volume window, the same as iOS (`HomeDashboardView`). */
const VOLUME_WEEKS = 8;

export function HomeView({ onNavigate }: HomeViewProps) {
  const { user } = useAuth();
  const {
    activeSession,
    historySessions,
    catalog,
    folders,
    unfiledTemplates,
    startWorkoutFromTemplate,
  } = useGym();
  const { t, format, muscleLabel, bcp47 } = useLocale();

  const [nowMs] = useState<number>(() => Date.now());
  const [muscleWeeks, setMuscleWeeks] = useState<number>(MUSCLE_WEEK_OPTIONS[0]);
  // The Weight page is pushed inside Today like on iOS; `log` opens its log sheet right away.
  const [weightPage, setWeightPage] = useState<{ log: boolean } | null>(null);
  const weeklyGoal = user?.preferences?.weeklyGoalSessions ?? 4;
  const weightUnit = user?.preferences?.weightUnit ?? WeightUnit.KG;

  const summaryMetrics = useMemo(() => {
    const weekStartMs = startOfIsoWeek(nowMs).getTime();
    return {
      sessions7d: historySessions.filter((s) => Date.parse(s.startedAt) >= weekStartMs).length,
    };
  }, [historySessions, nowMs]);

  const suggestedTemplate = useMemo(() => {
    const templates: WorkoutTemplateDto[] = [
      ...folders.flatMap((f) => f.templates),
      ...unfiledTemplates,
    ];
    if (templates.length === 0) return null;
    const lastTrainedMs = (tpl: WorkoutTemplateDto) => {
      const match = historySessions.find(
        (s) =>
          s.templateId === tpl.id ||
          s.workoutNameSnapshot.trim().toLowerCase() === tpl.name.trim().toLowerCase(),
      );
      return match ? Date.parse(match.startedAt) : 0;
    };
    const sorted = [...templates].sort((a, b) => lastTrainedMs(a) - lastTrainedMs(b));
    const pick = sorted[0];
    return pick ? { template: pick, lastMs: lastTrainedMs(pick) } : null;
  }, [folders, unfiledTemplates, historySessions]);

  // Chart 1: Weekly Volume (tons) & Completed Sessions over the last 8 weeks
  const weeklyTrendData = useMemo(() => {
    const tickFormat = new Intl.DateTimeFormat(bcp47, { month: 'short', day: 'numeric' });
    const anchorSessionMs =
      historySessions.length > 0
        ? Math.max(nowMs, ...historySessions.map((s) => Date.parse(s.startedAt)))
        : nowMs;
    const currentMonday = startOfIsoWeek(new Date(anchorSessionMs));

    const weeks: Array<{
      key: string;
      weekLabel: string;
      sessions: number;
      volumeTons: number;
      volumeKg: number;
      sets: number;
    }> = [];

    for (let i = VOLUME_WEEKS - 1; i >= 0; i--) {
      const start = new Date(
        currentMonday.getFullYear(),
        currentMonday.getMonth(),
        currentMonday.getDate() - i * 7,
      );
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
      const label = tickFormat.format(start);

      const inWeek = historySessions.filter((s) => {
        const ms = Date.parse(s.startedAt);
        return ms >= start.getTime() && ms < end.getTime();
      });

      const volKg = inWeek.reduce((acc, s) => acc + s.totalVolumeKg, 0);
      const sets = inWeek.reduce((acc, s) => acc + s.totalSetsCompleted, 0);

      weeks.push({
        key: start.toISOString().slice(0, 10),
        weekLabel: label,
        sessions: inWeek.length,
        volumeKg: Math.round(volKg),
        volumeTons: bigVolume(volKg, weightUnit).value,
        sets,
      });
    }

    return weeks;
  }, [historySessions, nowMs, weightUnit, bcp47]);
  const hasVolume = weeklyTrendData.some((w) => w.sessions > 0);

  // Chart 2: weekly hard sets per muscle (secondary muscles count half) against the 10–20 target
  const muscleChartData = useMemo(() => {
    const secondaryById = new Map(catalog.map((e) => [e.id, e.secondaryMuscleGroups]));
    return weeklySetsByMuscle(historySessions, (id) => secondaryById.get(id), {
      weeks: muscleWeeks,
      now: new Date(nowMs),
    }).slice(0, 10);
  }, [historySessions, catalog, muscleWeeks, nowMs]);

  const goalProgress = Math.min(1, weeklyGoal > 0 ? summaryMetrics.sessions7d / weeklyGoal : 0);
  const remainingToGoal = Math.max(0, weeklyGoal - summaryMetrics.sessions7d);
  // Scale leaves room past the target so "above range" stays visible.
  const muscleScale = Math.max(WEEKLY_SETS_TARGET.max * 1.25, muscleChartData[0]?.setsPerWeek ?? 0);
  const statusLabel: Record<WeeklySetsStatus, string> = {
    below: t.home.statusBelow,
    within: t.home.statusWithin,
    above: t.home.statusAbove,
  };

  const openWeightPage = (log: boolean) => {
    setWeightPage({ log });
    window.scrollTo({ top: 0 });
  };

  if (weightPage) {
    return (
      <div className="mx-auto max-w-2xl min-w-0 pb-10">
        <WeightView
          variant="page"
          logOnOpen={weightPage.log}
          onBack={() => {
            setWeightPage(null);
            window.scrollTo({ top: 0 });
          }}
        />
      </div>
    );
  }

  const volumeUnit = bigVolume(0, weightUnit).label;

  return (
    <div className="mx-auto max-w-2xl min-w-0 space-y-8 pb-10">
      <PageTitle title={t.nav.home} />

      {activeSession ? (
        <section className="bg-card space-y-4 rounded-[1.25rem] p-5">
          <div className="space-y-1">
            <p className="text-primary text-[0.8125rem] font-semibold">
              {t.home.sessionInProgress}
            </p>
            <h2 className="text-[1.375rem] leading-snug font-bold">
              {activeSession.workoutNameSnapshot}
            </h2>
            <p className="text-muted-foreground text-[0.9375rem]">
              {format(t.home.setsLoggedVolume, {
                sets: activeSession.totalSetsCompleted,
                volume: formatVolume(activeSession.totalVolumeKg, activeSession.weightUnit),
                unit: unitLabel(activeSession.weightUnit),
              })}
            </p>
          </div>
          <Button type="button" size="lg" onClick={() => onNavigate('session')} className="w-full">
            <Play className="h-4 w-4 fill-current" /> {t.home.resumeActiveSession}
          </Button>
        </section>
      ) : (
        <section className="bg-card space-y-4 rounded-[1.25rem] p-5">
          <div className="space-y-1">
            <p className="text-muted-foreground text-[0.8125rem] font-semibold">
              {t.home.startNextTitle}
            </p>
            <h2 className="text-[1.375rem] leading-snug font-bold">
              {suggestedTemplate?.template.name ?? t.home.startNextSub}
            </h2>
            {suggestedTemplate && (
              <p className="text-muted-foreground text-[0.9375rem]">
                {suggestedTemplate.lastMs > 0
                  ? format(t.home.lastTrained, {
                      date: new Date(suggestedTemplate.lastMs).toLocaleDateString(bcp47, {
                        month: 'short',
                        day: 'numeric',
                      }),
                    })
                  : t.workouts.neverTrained}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {suggestedTemplate && (
              <Button
                type="button"
                size="lg"
                className="sm:flex-1"
                onClick={async () => {
                  await startWorkoutFromTemplate(suggestedTemplate.template.id);
                  onNavigate('session');
                }}
              >
                <Play className="h-4 w-4 fill-current" /> {t.home.startWorkoutBtn}
              </Button>
            )}
            <Button
              type="button"
              size="lg"
              variant="secondary"
              className="sm:flex-1"
              onClick={() => onNavigate('workouts')}
            >
              {t.home.chooseWorkoutBtn}
            </Button>
          </div>
        </section>
      )}

      <WeightHomeCard
        onLogWeight={() => openWeightPage(true)}
        onOpen={() => openWeightPage(false)}
      />

      <section
        aria-labelledby="home-week"
        className="bg-card flex items-center gap-5 rounded-[1.25rem] p-5"
      >
        <WeeklyRing progress={goalProgress} />
        <div className="min-w-0 space-y-0.5">
          <h2 id="home-week" className="text-[1.0625rem] font-semibold">
            {t.home.freq7dTitle}
          </h2>
          <p className="font-rounded text-[1.75rem] leading-tight font-semibold">
            {summaryMetrics.sessions7d}
            <span className="text-muted-foreground text-[1.0625rem] font-medium">
              {' '}
              / {weeklyGoal}
            </span>
          </p>
          <p className="text-muted-foreground text-[0.9375rem]">
            {remainingToGoal === 0
              ? t.home.goalReached
              : format(t.home.goalRemaining, { count: remainingToGoal })}
          </p>
        </div>
      </section>

      <section
        aria-labelledby="home-weekly"
        className="bg-card min-w-0 space-y-4 rounded-[1.25rem] p-5"
      >
        <div>
          <h2 id="home-weekly" className="text-[1.0625rem] font-semibold">
            {t.home.weeklyChartTitle}
          </h2>
          <p className="text-muted-foreground text-[0.8125rem]">
            {format(t.home.rangeWeeksAria, { weeks: VOLUME_WEEKS })}
          </p>
        </div>
        {hasVolume ? (
          <div className="h-52 w-full" data-testid="home-weekly-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyTrendData} margin={{ top: 18, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="weekLabel"
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  interval={1}
                />
                <YAxis
                  orientation="right"
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  tickFormatter={(v: number) => v.toLocaleString(bcp47)}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  label={{
                    value: volumeUnit,
                    position: 'top',
                    offset: 8,
                    fontSize: 11,
                    fill: 'var(--muted-foreground)',
                  }}
                />
                <Tooltip
                  cursor={{ fill: 'color-mix(in oklch, var(--muted) 60%, transparent)' }}
                  wrapperStyle={{ outline: 'none' }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as (typeof weeklyTrendData)[number] | undefined;
                    if (!row) return null;
                    return (
                      <div className="bg-popover text-popover-foreground pointer-events-none rounded-xl px-3 py-2 text-[0.8125rem]">
                        <p className="font-semibold">
                          {format(t.home.weekOf, { date: String(label ?? '') })}
                        </p>
                        <p className="text-muted-foreground tabular-nums">
                          {row.volumeTons.toLocaleString(bcp47)} {volumeUnit} · {row.sessions}{' '}
                          {row.sessions === 1 ? t.common.workout : t.common.workouts}
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="volumeTons"
                  fill="var(--chart-1)"
                  radius={[6, 6, 6, 6]}
                  maxBarSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p
            className="text-muted-foreground py-12 text-center text-[0.9375rem]"
            data-testid="home-weekly-empty"
          >
            {t.home.noWorkoutsYet}
          </p>
        )}
      </section>

      <section aria-labelledby="home-muscles" className="bg-card space-y-4 rounded-[1.25rem] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="home-muscles" className="text-[1.0625rem] font-semibold">
              {t.home.musclesTrainedTitle}
            </h2>
            <p className="text-muted-foreground text-[0.8125rem]">{t.home.musclesTrainedSub}</p>
          </div>
          <Tabs value={String(muscleWeeks)} onValueChange={(v) => setMuscleWeeks(Number(v))}>
            <TabsList>
              {MUSCLE_WEEK_OPTIONS.map((weeks) => (
                <TabsTrigger
                  key={weeks}
                  value={String(weeks)}
                  aria-label={format(t.home.rangeWeeksAria, { weeks })}
                >
                  {format(t.home.rangeWeeksLong, { weeks })}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {muscleChartData.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-[0.9375rem]">
            {t.home.noLoggedWorkingSets}
          </p>
        ) : (
          <ul className="space-y-3.5">
            {muscleChartData.map((entry) => (
              <li key={entry.muscle} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-[0.9375rem]">
                  <span>{muscleLabel(entry.muscle)}</span>
                  <span className="text-muted-foreground text-right tabular-nums">
                    {format(t.home.setsPerWeekShort, {
                      sets: entry.setsPerWeek.toLocaleString(bcp47),
                    })}
                  </span>
                </div>
                <div
                  className="bg-secondary relative h-2 overflow-hidden rounded-full"
                  aria-hidden="true"
                >
                  <div
                    className="bg-primary/15 absolute inset-y-0"
                    style={{
                      left: `${(WEEKLY_SETS_TARGET.min / muscleScale) * 100}%`,
                      width: `${((WEEKLY_SETS_TARGET.max - WEEKLY_SETS_TARGET.min) / muscleScale) * 100}%`,
                    }}
                  />
                  <div
                    className={`relative h-full rounded-full transition-[width] duration-500 ease-(--ease-out-quart) ${
                      entry.status === 'within' ? 'bg-primary' : 'bg-primary/60'
                    }`}
                    style={{ width: `${Math.min(100, (entry.setsPerWeek / muscleScale) * 100)}%` }}
                  />
                </div>
                <p
                  className={`text-[0.8125rem] ${
                    entry.status === 'within'
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground'
                  }`}
                >
                  <span className="sr-only">, </span>
                  {statusLabel[entry.status]}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="text-muted-foreground text-[0.8125rem]" data-testid="home-muscles-note">
          {format(t.home.musclesTargetNote, {
            min: WEEKLY_SETS_TARGET.min,
            max: WEEKLY_SETS_TARGET.max,
          })}
        </p>
      </section>
    </div>
  );
}

function WeeklyRing({ progress }: { progress: number }) {
  const size = 76;
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0 -rotate-90"
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="color-mix(in oklch, var(--primary) 18%, transparent)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        className="transition-[stroke-dashoffset] duration-700 ease-(--ease-out-quart)"
      />
    </svg>
  );
}
