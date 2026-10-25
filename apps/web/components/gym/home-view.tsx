'use client';

import React, { useMemo, useState } from 'react';
import { ChevronRight, Play } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@luki-fitti/ui/components/ui/tabs';
import { useGym } from '@/providers/gym/gym-context';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';
import { formatShortDayMonth, startOfIsoWeek } from '@luki-fitti/common/utils/client';
import type { WorkoutTemplateDto } from '@luki-fitti/common/schemas';
import {
  ExerciseType,
  MuscleGroup,
  SessionType,
  SetType,
  WeightUnit,
} from '@luki-fitti/common/enums';
import type { NavTab } from './pwa-shell';

interface HomeViewProps {
  onNavigate: (tab: NavTab) => void;
}

const LBS_TO_KG = 0.45359237;

export function HomeView({ onNavigate }: HomeViewProps) {
  const { user } = useAuth();
  const { activeSession, historySessions, folders, unfiledTemplates, startWorkoutFromTemplate } =
    useGym();
  const { t, format, muscleLabel, locale } = useLocale();

  const [nowMs] = useState<number>(() => Date.now());
  const [muscleRange, setMuscleRange] = useState<'30d' | '90d' | 'all'>('90d');
  const weeklyGoal = user?.preferences?.weeklyGoalSessions ?? 4;

  const summaryMetrics = useMemo(() => {
    const weekStartMs = startOfIsoWeek(nowMs).getTime();
    const sessions7d = historySessions.filter((s) => Date.parse(s.startedAt) >= weekStartMs).length;
    const sessions30d = historySessions.filter(
      (s) => nowMs - Date.parse(s.startedAt) <= 30 * 86400000,
    );
    const volume30dKg = sessions30d.reduce((acc, s) => acc + s.totalVolumeKg, 0);
    const totalVolumeAllKg = historySessions.reduce((acc, s) => acc + s.totalVolumeKg, 0);
    const strengthSessionsCount = historySessions.filter(
      (s) => s.sessionType !== SessionType.STRETCHING && s.totalVolumeKg > 0,
    ).length;
    const avgSessionVolumeKg =
      strengthSessionsCount > 0 ? Math.round(totalVolumeAllKg / strengthSessionsCount) : 0;

    return {
      sessions7d,
      volume30dKg: Math.round(volume30dKg),
      totalSessions: historySessions.length,
      avgSessionVolumeKg,
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

  // Chart 1: Weekly Volume (tons) & Completed Sessions over the last 10 weeks
  const weeklyTrendData = useMemo(() => {
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

    for (let i = 9; i >= 0; i--) {
      const start = new Date(
        currentMonday.getFullYear(),
        currentMonday.getMonth(),
        currentMonday.getDate() - i * 7,
      );
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
      const label = formatShortDayMonth(start);

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
        volumeTons: Math.round((volKg / 1000) * 10) / 10,
        sets,
      });
    }

    return weeks;
  }, [historySessions, nowMs]);

  // Chart 2: Muscle Group Working Sets & Volume Balance
  const muscleChartData = useMemo(() => {
    const cutoffMs =
      muscleRange === '30d'
        ? nowMs - 30 * 86400000
        : muscleRange === '90d'
          ? nowMs - 90 * 86400000
          : 0;

    const counts = new Map<MuscleGroup, { sets: number; volumeKg: number }>();

    for (const s of historySessions) {
      if (cutoffMs > 0 && Date.parse(s.startedAt) < cutoffMs) continue;
      for (const ex of s.exercises) {
        const isStretch = ex.exerciseTypeSnapshot === ExerciseType.STRETCHING;
        if (isStretch) continue;

        const cur = counts.get(ex.primaryMuscleSnapshot) ?? { sets: 0, volumeKg: 0 };
        for (const set of ex.sets) {
          if (!set.completed || set.setType === SetType.WARMUP || set.setType === SetType.STRETCH) {
            continue;
          }
          cur.sets += 1;
          if (set.weight && set.weight > 0 && set.reps && set.reps > 0) {
            const wKg = set.weightUnit === WeightUnit.LBS ? set.weight * LBS_TO_KG : set.weight;
            cur.volumeKg += wKg * set.reps;
          }
        }
        if (cur.sets > 0) {
          counts.set(ex.primaryMuscleSnapshot, cur);
        }
      }
    }

    return Array.from(counts.entries())
      .map(([muscle, val]) => ({
        muscle,
        name: muscleLabel(muscle),
        sets: val.sets,
        volumeTons: Math.round((val.volumeKg / 1000) * 10) / 10,
        volumeKg: Math.round(val.volumeKg),
      }))
      .sort((a, b) => b.sets - a.sets)
      .slice(0, 8);
  }, [historySessions, muscleRange, nowMs, muscleLabel]);

  const goalProgress = Math.min(1, weeklyGoal > 0 ? summaryMetrics.sessions7d / weeklyGoal : 0);
  const remainingToGoal = Math.max(0, weeklyGoal - summaryMetrics.sessions7d);
  const todayLabel = new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(nowMs));
  const maxMuscleSets = muscleChartData[0]?.sets ?? 0;

  const overviewRows = [
    {
      label: t.home.vol30dTitle,
      value: format(t.home.vol30dSub, { volume: summaryMetrics.volume30dKg.toLocaleString() }),
    },
    { label: t.home.totalWorkoutsTitle, value: String(summaryMetrics.totalSessions) },
    {
      label: t.home.avgLoadTitle,
      value: format(t.home.avgLoadSub, {
        volume: summaryMetrics.avgSessionVolumeKg.toLocaleString(),
      }),
    },
  ];

  return (
    <div className="mx-auto max-w-2xl min-w-0 space-y-8 pb-10">
      <header className="space-y-1">
        <p className="text-muted-foreground text-[15px] font-medium first-letter:uppercase">
          {todayLabel}
        </p>
        <h1 className="text-[34px] leading-tight font-bold">
          {format(t.home.greeting, { name: user?.name?.split(' ')[0] || 'GymBuddy' })}
        </h1>
      </header>

      {activeSession ? (
        <section className="bg-card space-y-4 rounded-[1.25rem] p-5">
          <div className="space-y-1">
            <p className="text-primary text-[13px] font-semibold">{t.home.sessionInProgress}</p>
            <h2 className="text-[22px] leading-snug font-bold">
              {activeSession.workoutNameSnapshot}
            </h2>
            <p className="text-muted-foreground text-[15px]">
              {format(t.home.setsLoggedVolume, {
                sets: activeSession.totalSetsCompleted,
                volume: activeSession.totalVolumeKg.toLocaleString(),
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
            <p className="text-muted-foreground text-[13px] font-semibold">
              {t.home.startNextTitle}
            </p>
            <h2 className="text-[22px] leading-snug font-bold">
              {suggestedTemplate?.template.name ?? t.home.startNextSub}
            </h2>
            {suggestedTemplate && (
              <p className="text-muted-foreground text-[15px]">
                {suggestedTemplate.lastMs > 0
                  ? format(t.home.lastTrained, {
                      date: formatShortDayMonth(new Date(suggestedTemplate.lastMs)),
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
                className="flex-1"
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
              className="flex-1"
              onClick={() => onNavigate('workouts')}
            >
              {t.home.chooseWorkoutBtn}
            </Button>
          </div>
        </section>
      )}

      <section
        aria-labelledby="home-week"
        className="bg-card flex items-center gap-5 rounded-[1.25rem] p-5"
      >
        <WeeklyRing progress={goalProgress} />
        <div className="min-w-0 space-y-0.5">
          <h2 id="home-week" className="text-[17px] font-semibold">
            {t.home.freq7dTitle}
          </h2>
          <p className="font-rounded text-[28px] leading-tight font-semibold">
            {summaryMetrics.sessions7d}
            <span className="text-muted-foreground text-[17px] font-medium"> / {weeklyGoal}</span>
          </p>
          <p className="text-muted-foreground text-[15px]">
            {remainingToGoal === 0
              ? t.home.goalReached
              : format(t.home.goalRemaining, { count: remainingToGoal })}
          </p>
        </div>
      </section>

      <section aria-labelledby="home-overview" className="space-y-2">
        <h2 id="home-overview" className="px-1 text-[20px] font-bold">
          {t.home.statsTitle}
        </h2>
        <dl className="bg-card divide-border divide-y overflow-hidden rounded-[1.25rem]">
          {overviewRows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <dt className="text-[17px]">{row.label}</dt>
              <dd className="text-muted-foreground tabular-nums text-[17px]">{row.value}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          onClick={() => onNavigate('diary')}
          className="text-primary flex items-center gap-0.5 px-1 py-1 text-[15px] font-medium"
        >
          {t.home.trainingDiaryBtn}
          <ChevronRight className="h-4 w-4" />
        </button>
      </section>

      <section
        aria-labelledby="home-weekly"
        className="bg-card min-w-0 space-y-4 rounded-[1.25rem] p-5"
      >
        <div>
          <h2 id="home-weekly" className="text-[17px] font-semibold">
            {t.home.weeklyChartTitle}
          </h2>
          <p className="text-muted-foreground text-[13px]">{t.home.weeklyChartSub}</p>
        </div>
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyTrendData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="weekLabel"
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
                unit="t"
                width={44}
              />
              <Tooltip
                cursor={{ fill: 'color-mix(in oklch, var(--muted) 60%, transparent)' }}
                wrapperStyle={{ outline: 'none' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as (typeof weeklyTrendData)[number] | undefined;
                  if (!row) return null;
                  return (
                    <div className="bg-popover text-popover-foreground pointer-events-none rounded-xl px-3 py-2 text-[13px]">
                      <p className="font-semibold">
                        {format(t.home.weekOf, { date: String(label ?? '') })}
                      </p>
                      <p className="text-muted-foreground tabular-nums">
                        {row.volumeTons} t · {row.sessions}{' '}
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
      </section>

      <section aria-labelledby="home-muscles" className="bg-card space-y-4 rounded-[1.25rem] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="home-muscles" className="text-[17px] font-semibold">
              {t.home.muscleChartTitle}
            </h2>
            <p className="text-muted-foreground text-[13px]">{t.home.muscleChartSub}</p>
          </div>
          <Tabs
            value={muscleRange}
            onValueChange={(v) => setMuscleRange(v as '30d' | '90d' | 'all')}
          >
            <TabsList>
              <TabsTrigger value="30d">30d</TabsTrigger>
              <TabsTrigger value="90d">90d</TabsTrigger>
              <TabsTrigger value="all">{t.home.rangeAll}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {muscleChartData.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-[15px]">
            {t.home.noLoggedWorkingSets}
          </p>
        ) : (
          <ul className="space-y-3">
            {muscleChartData.map((entry) => (
              <li key={entry.muscle} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-[15px]">
                  <span>{entry.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {entry.sets} {entry.sets === 1 ? t.common.set : t.common.sets}
                  </span>
                </div>
                <div className="bg-secondary h-1.5 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full transition-[width] duration-500 ease-(--ease-out-quart)"
                    style={{
                      width: `${maxMuscleSets > 0 ? (entry.sets / maxMuscleSets) * 100 : 0}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
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
