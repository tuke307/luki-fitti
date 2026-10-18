'use client';

import React, { useMemo, useState } from 'react';
import {
  Play,
  Dumbbell,
  TrendingUp,
  BarChart3,
  FolderKanban,
  CalendarDays,
} from 'lucide-react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@luki-fitti/ui/components/ui/badge';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Card } from '@luki-fitti/ui/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@luki-fitti/ui/components/ui/tabs';
import { useGym } from '@/providers/gym/gym-context';
import { useAuth } from '@/providers/auth/auth-context';
import { formatShortDayMonth } from '@luki-fitti/common/utils/client';
import {
  ExerciseType,
  MUSCLE_GROUP_LABELS,
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

function getMondayOfWeek(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay();
  const diff = (day + 6) % 7;
  date.setDate(date.getDate() - diff);
  return date;
}

export function HomeView({ onNavigate }: HomeViewProps) {
  const { user } = useAuth();
  const { activeSession, historySessions } = useGym();

  const [nowMs] = useState<number>(() => Date.now());
  const [muscleRange, setMuscleRange] = useState<'30d' | '90d' | 'all'>('90d');
  const weeklyGoal = user?.preferences?.weeklyGoalSessions ?? 4;

  const summaryMetrics = useMemo(() => {
    const sessions7d = historySessions.filter(
      (s) => nowMs - Date.parse(s.startedAt) <= 7 * 86400000,
    ).length;
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

  // Chart 1: Weekly Volume (tons) & Completed Sessions over the last 10 weeks
  const weeklyTrendData = useMemo(() => {
    const anchorSessionMs =
      historySessions.length > 0
        ? Math.max(nowMs, ...historySessions.map((s) => Date.parse(s.startedAt)))
        : nowMs;
    const currentMonday = getMondayOfWeek(new Date(anchorSessionMs));

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
        const isStretch =
          ex.exerciseTypeSnapshot === ExerciseType.STRETCHING ||
          ex.exerciseTypeSnapshot === ExerciseType.MOBILITY;
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
        name: MUSCLE_GROUP_LABELS[muscle],
        sets: val.sets,
        volumeTons: Math.round((val.volumeKg / 1000) * 10) / 10,
        volumeKg: Math.round(val.volumeKg),
      }))
      .sort((a, b) => b.sets - a.sets)
      .slice(0, 8);
  }, [historySessions, muscleRange, nowMs]);

  return (
    <div className="min-w-0 max-w-full space-y-6 pb-10">
      {/* Compact Header & Quick Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            Hey, {user?.name?.split(' ')[0] || 'GymBuddy'}
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm">
            Your training consistency, weekly load progression, and muscle split balance
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onNavigate('diary')}
          >
            <CalendarDays className="h-4 w-4" />
            Training Diary
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => onNavigate('workouts')}
          >
            <FolderKanban className="h-4 w-4" />
            Choose Workout
          </Button>
        </div>
      </div>

      {/* Active Session Resume Callout */}
      {activeSession && (
        <Card className="border-primary bg-primary/15 flex flex-col justify-between gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center">
          <div>
            <Badge variant="solid" className="text-[10px] uppercase">
              Session In Progress
            </Badge>
            <h2 className="font-display mt-1 text-lg font-bold">
              {activeSession.workoutNameSnapshot}
            </h2>
            <p className="text-muted-foreground text-xs">
              {activeSession.totalSetsCompleted} sets logged •{' '}
              {activeSession.totalVolumeKg.toLocaleString()} kg volume
            </p>
          </div>
          <Button
            type="button"
            size="lg"
            onClick={() => onNavigate('session')}
            className="w-full shadow-sm sm:w-auto"
          >
            <Play className="h-4 w-4 fill-current" /> Resume Active Session
          </Button>
        </Card>
      )}

      {/* Key Telemetry Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-muted-foreground text-xs font-medium">7-Day Frequency</p>
          <p className="font-mono-tabular text-primary mt-1 text-2xl font-extrabold">
            {summaryMetrics.sessions7d}{' '}
            <span className="text-muted-foreground text-sm font-normal">/ {weeklyGoal}</span>
          </p>
          <p className="text-muted-foreground mt-0.5 text-[11px]">Weekly session target</p>
        </Card>

        <Card className="p-4">
          <p className="text-muted-foreground text-xs font-medium">30-Day Volume</p>
          <p className="font-mono-tabular mt-1 text-2xl font-extrabold">
            {(summaryMetrics.volume30dKg / 1000).toFixed(1)}{' '}
            <span className="text-muted-foreground text-sm font-normal">t</span>
          </p>
          <p className="text-muted-foreground mt-0.5 text-[11px]">
            {summaryMetrics.volume30dKg.toLocaleString()} kg moved
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-muted-foreground text-xs font-medium">Total Workouts</p>
          <p className="font-mono-tabular mt-1 text-2xl font-extrabold">
            {summaryMetrics.totalSessions}
          </p>
          <p className="text-muted-foreground mt-0.5 text-[11px]">Completed sessions</p>
        </Card>

        <Card className="p-4">
          <p className="text-muted-foreground text-xs font-medium">Avg. Session Load</p>
          <p className="font-mono-tabular text-accent mt-1 text-2xl font-extrabold">
            {(summaryMetrics.avgSessionVolumeKg / 1000).toFixed(1)}{' '}
            <span className="text-muted-foreground text-sm font-normal">t</span>
          </p>
          <p className="text-muted-foreground mt-0.5 text-[11px]">
            {summaryMetrics.avgSessionVolumeKg.toLocaleString()} kg / workout
          </p>
        </Card>
      </div>

      {/* 2 Useful Dashboard Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Chart 1: Weekly Volume & Session Frequency Trend */}
        <Card className="min-w-0 space-y-4 overflow-hidden rounded-3xl p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-display flex items-center gap-2 text-base font-bold">
                <TrendingUp className="text-primary h-4 w-4" /> Weekly Volume & Session Trend
              </h2>
              <p className="text-muted-foreground text-xs">
                Last 10 weeks tonnage (t) and completed workouts per week
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1.5 font-semibold">
                <span className="bg-primary inline-block h-2.5 w-2.5 rounded-sm" /> Volume (t)
              </span>
              <span className="flex items-center gap-1.5 font-semibold">
                <span className="bg-accent inline-block h-2.5 w-2.5 rounded-full" /> Sessions
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={weeklyTrendData}
                margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="homeVolGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#CCFF00" stopOpacity={0.85} />
                    <stop offset="100%" stopColor="#CCFF00" stopOpacity={0.2} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis
                  dataKey="weekLabel"
                  tick={{ fontSize: 10, fill: '#94A3B8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 10, fill: '#94A3B8' }}
                  axisLine={false}
                  tickLine={false}
                  unit="t"
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: '#00E5FF' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F1318',
                    borderColor: 'rgba(255,255,255,0.12)',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                  formatter={(value, name) => {
                    if (name === 'volumeTons') return [`${String(value ?? 0)} t`, 'Volume'];
                    if (name === 'sessions') return [`${String(value ?? 0)} workouts`, 'Sessions'];
                    return [String(value ?? ''), String(name ?? '')];
                  }}
                />
                <Bar
                  yAxisId="left"
                  dataKey="volumeTons"
                  fill="url(#homeVolGrad)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={28}
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="sessions"
                  stroke="#00E5FF"
                  strokeWidth={2.5}
                  fill="#00E5FF"
                  fillOpacity={0.12}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Chart 2: Muscle Group Balance (Working Sets Distribution) */}
        <Card className="min-w-0 space-y-4 overflow-hidden rounded-3xl p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-display flex items-center gap-2 text-base font-bold">
                <BarChart3 className="text-accent h-4 w-4" /> Muscle Group Set Balance
              </h2>
              <p className="text-muted-foreground text-xs">
                Completed working sets per primary muscle group
              </p>
            </div>

            <Tabs
              value={muscleRange}
              onValueChange={(v) => setMuscleRange(v as '30d' | '90d' | 'all')}
            >
              <TabsList className="h-7">
                <TabsTrigger value="30d" className="px-2 py-0.5 text-[11px]">
                  30d
                </TabsTrigger>
                <TabsTrigger value="90d" className="px-2 py-0.5 text-[11px]">
                  90d
                </TabsTrigger>
                <TabsTrigger value="all" className="px-2 py-0.5 text-[11px]">
                  All
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {muscleChartData.length === 0 ? (
            <div className="bg-secondary/30 text-muted-foreground flex h-64 flex-col items-center justify-center rounded-2xl p-6 text-center text-xs">
              <Dumbbell className=" mb-2 h-6 w-6 opacity-50" />
              No logged working sets in this time window yet.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={muscleChartData}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke="rgba(148,163,184,0.15)"
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: '#94A3B8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={84}
                    tick={{ fontSize: 11, fill: '#E2E8F0', fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F1318',
                      borderColor: 'rgba(255,255,255,0.12)',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                    formatter={(value) => [`${String(value ?? 0)} sets`, 'Working Load']}
                  />
                  <Bar dataKey="sets" radius={[0, 6, 6, 0]} maxBarSize={22}>
                    {muscleChartData.map((entry, idx) => (
                      <Cell
                        key={entry.muscle}
                        fill={idx % 2 === 0 ? '#CCFF00' : '#00E5FF'}
                        fillOpacity={0.85}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
