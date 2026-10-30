'use client';

import React, { useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@luki-fitti/ui/components/ui/tabs';
import { useGym } from '@/providers/gym/gym-context';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';
import { formatShortDayMonth, startOfIsoWeek } from '@luki-fitti/common/utils/client';
import type { WorkoutTemplateDto } from '@luki-fitti/common/schemas';
import { ExerciseType, MuscleGroup, SetType, WeightUnit } from '@luki-fitti/common/enums';
import type { NavTab } from './pwa-shell';
import { bigVolume, formatVolume, unitLabel } from '@/lib/format/weight';
import { WeightHomeCard } from './weight/weight-home-card';
import { requestWeightFocus, requestWeightSection } from './weight/weight-focus';

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
  const weightUnit = user?.preferences?.weightUnit ?? WeightUnit.KG;
  const firstName = user?.name?.split(' ')[0];

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
        volumeTons: bigVolume(volKg, weightUnit).value,
        sets,
      });
    }

    return weeks;
  }, [historySessions, nowMs, weightUnit]);

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

  return (
    <div className="mx-auto max-w-2xl min-w-0 space-y-8 pb-10">
      <header className="space-y-1">
        <p className="text-muted-foreground text-[0.9375rem] font-medium first-letter:uppercase">
          {todayLabel}
        </p>
        <h1 className="text-[2.125rem] leading-tight font-bold">
          {firstName ? format(t.home.greeting, { name: firstName }) : t.nav.home}
        </h1>
      </header>

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
        onLogWeight={() => {
          requestWeightFocus();
          onNavigate('profile');
        }}
        onOpenHistory={() => {
          requestWeightSection();
          onNavigate('profile');
        }}
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
          <p className="text-muted-foreground text-[0.8125rem]">{t.home.weeklyChartSub}</p>
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
                unit={bigVolume(0, weightUnit).label}
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
                    <div className="bg-popover text-popover-foreground pointer-events-none rounded-xl px-3 py-2 text-[0.8125rem]">
                      <p className="font-semibold">
                        {format(t.home.weekOf, { date: String(label ?? '') })}
                      </p>
                      <p className="text-muted-foreground tabular-nums">
                        {row.volumeTons} {bigVolume(0, weightUnit).label} · {row.sessions}{' '}
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
            <h2 id="home-muscles" className="text-[1.0625rem] font-semibold">
              {t.home.muscleChartTitle}
            </h2>
            <p className="text-muted-foreground text-[0.8125rem]">{t.home.muscleChartSub}</p>
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
          <p className="text-muted-foreground py-8 text-center text-[0.9375rem]">
            {t.home.noLoggedWorkingSets}
          </p>
        ) : (
          <ul className="space-y-3">
            {muscleChartData.map((entry) => (
              <li key={entry.muscle} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-[0.9375rem]">
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
