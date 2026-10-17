'use client';

import React, { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  TrendingUp,
  Trophy,
  Dumbbell,
  Sparkles,
  Edit3,
  Trash2,
  Check,
  Filter,
} from 'lucide-react';
import { Badge } from '@luki-fitti/ui/components/ui/badge';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Card } from '@luki-fitti/ui/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@luki-fitti/ui/components/ui/dialog';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { Label } from '@luki-fitti/ui/components/ui/label';
import { NativeSelect } from '@luki-fitti/ui/components/ui/native-select';
import { Progress } from '@luki-fitti/ui/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@luki-fitti/ui/components/ui/tabs';
import { useGym } from '@/providers/gym/gym-context';
import {
  ExerciseType,
  MUSCLE_GROUP_LABELS,
  MuscleGroup,
  SessionType,
  SetType,
  WeightUnit,
} from '@luki-fitti/common/enums';
import type { WorkoutSessionDto } from '@luki-fitti/common/schemas';

const LBS_TO_KG = 0.45359237;

export function DiaryAnalyticsView() {
  const {
    historySessions,
    catalog,
    weightUnit,
    updateHistoricalSession,
    deleteHistoricalSession,
  } = useGym();

  const [nowMs] = useState<number>(() => Date.now());
  const [period, setPeriod] = useState<'week' | 'month' | 'year' | 'all'>('month');
  const [filterMuscle, setFilterMuscle] = useState<MuscleGroup | 'ALL'>('ALL');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('ALL');
  const [inspectingSession, setInspectingSession] = useState<WorkoutSessionDto | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(20);

  const filteredSessions = useMemo(() => {
    const cutoffMs =
      period === 'week'
        ? nowMs - 7 * 86400000
        : period === 'month'
          ? nowMs - 30 * 86400000
          : period === 'year'
            ? nowMs - 365 * 86400000
            : 0;

    return historySessions.filter((s) => {
      const startedMs = Date.parse(s.startedAt);
      if (cutoffMs > 0 && startedMs < cutoffMs) return false;
      if (
        filterMuscle !== 'ALL' &&
        !s.exercises.some((e) => e.primaryMuscleSnapshot === filterMuscle)
      ) {
        return false;
      }
      if (
        selectedExerciseId !== 'ALL' &&
        !s.exercises.some((e) => e.exerciseId === selectedExerciseId)
      ) {
        return false;
      }
      return true;
    });
  }, [historySessions, period, filterMuscle, selectedExerciseId, nowMs]);

  const stats = useMemo(() => {
    let strengthSessions = 0;
    let stretchingSessions = 0;
    let totalSets = 0;
    let totalReps = 0;
    let totalVolumeKg = 0;
    let totalStretchSec = 0;

    const muscleSets = new Map<MuscleGroup, { sets: number; volumeKg: number }>();
    const prMap = new Map<
      string,
      {
        exerciseName: string;
        muscle: MuscleGroup;
        maxWeightKg: number;
        reps: number;
        est1RM: number;
        date: string;
      }
    >();
    const progression: Array<{
      date: string;
      workoutName: string;
      exerciseName: string;
      maxWeightKg: number;
      est1RM: number;
      volumeKg: number;
    }> = [];

    for (const s of [...filteredSessions].reverse()) {
      if (s.sessionType === SessionType.STRETCHING) {
        stretchingSessions += 1;
      } else {
        strengthSessions += 1;
      }

      for (const ex of s.exercises) {
        if (filterMuscle !== 'ALL' && ex.primaryMuscleSnapshot !== filterMuscle) continue;
        if (selectedExerciseId !== 'ALL' && ex.exerciseId !== selectedExerciseId) continue;

        const isStretch =
          ex.exerciseTypeSnapshot === ExerciseType.STRETCHING ||
          ex.exerciseTypeSnapshot === ExerciseType.MOBILITY;

        let exMaxWeight = 0;
        let exBest1RM = 0;
        let exVol = 0;

        for (const set of ex.sets) {
          if (!set.completed) continue;
          totalSets += 1;

          const curM = muscleSets.get(ex.primaryMuscleSnapshot) ?? { sets: 0, volumeKg: 0 };
          curM.sets += 1;

          if (isStretch || set.setType === SetType.STRETCH) {
            totalStretchSec += set.durationSeconds ?? 0;
            if (set.reps) totalReps += set.reps;
          } else {
            const reps = set.reps ?? 0;
            totalReps += reps;
            if (set.setType !== SetType.WARMUP && set.weight && set.weight > 0 && reps > 0) {
              const wKg = set.weightUnit === WeightUnit.LBS ? set.weight * LBS_TO_KG : set.weight;
              const vol = wKg * reps;
              totalVolumeKg += vol;
              exVol += vol;
              curM.volumeKg += vol;

              const est1RM = wKg * (1 + reps / 30);
              if (wKg > exMaxWeight) exMaxWeight = wKg;
              if (est1RM > exBest1RM) exBest1RM = est1RM;

              const key = ex.exerciseId ?? ex.exerciseNameSnapshot;
              const prev = prMap.get(key);
              if (
                !prev ||
                wKg > prev.maxWeightKg ||
                (wKg === prev.maxWeightKg && reps > prev.reps)
              ) {
                prMap.set(key, {
                  exerciseName: ex.exerciseNameSnapshot,
                  muscle: ex.primaryMuscleSnapshot,
                  maxWeightKg: Math.round(wKg * 10) / 10,
                  reps,
                  est1RM: Math.round(est1RM * 10) / 10,
                  date: s.startedAt.slice(0, 10),
                });
              }
            }
          }
          muscleSets.set(ex.primaryMuscleSnapshot, curM);
        }

        if (exMaxWeight > 0) {
          progression.push({
            date: s.startedAt.slice(0, 10),
            workoutName: s.workoutNameSnapshot,
            exerciseName: ex.exerciseNameSnapshot,
            maxWeightKg: Math.round(exMaxWeight * 10) / 10,
            est1RM: Math.round(exBest1RM * 10) / 10,
            volumeKg: Math.round(exVol),
          });
        }
      }
    }

    const totalMuscleSetCount = Array.from(muscleSets.values()).reduce(
      (a, b) => a + b.sets,
      0,
    );

    const muscleDistribution = Array.from(muscleSets.entries())
      .map(([muscle, data]) => ({
        muscle,
        label: MUSCLE_GROUP_LABELS[muscle],
        sets: data.sets,
        volumeKg: Math.round(data.volumeKg),
        pct: totalMuscleSetCount > 0 ? Math.round((data.sets / totalMuscleSetCount) * 100) : 0,
      }))
      .sort((a, b) => b.sets - a.sets);

    return {
      totalSessions: filteredSessions.length,
      strengthSessions,
      stretchingSessions,
      totalSets,
      totalReps,
      totalVolumeKg: Math.round(totalVolumeKg),
      totalStretchMinutes: Math.round(totalStretchSec / 60),
      muscleDistribution,
      personalRecords: Array.from(prMap.values()).sort((a, b) => b.est1RM - a.est1RM),
      progression: progression.slice(-10),
    };
  }, [filteredSessions, filterMuscle, selectedExerciseId]);

  // Dynamic activity breakdown matching the selected period ('week' | 'month' | 'year' | 'all')
  const activityData = useMemo(() => {
    if (period === 'week') {
      const days: Array<{
        iso: string;
        weekdayLabel: string;
        dayNum: number;
        sessions: WorkoutSessionDto[];
      }> = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(nowMs - i * 86400000);
        const iso = d.toISOString().slice(0, 10);
        days.push({
          iso,
          weekdayLabel: d.toLocaleDateString('en-US', { weekday: 'short' }),
          dayNum: d.getDate(),
          sessions: filteredSessions.filter((s) => s.startedAt.slice(0, 10) === iso),
        });
      }
      return { mode: 'days' as const, title: 'Last 7 Days Activity', items: days };
    }

    if (period === 'month') {
      const days: Array<{
        iso: string;
        weekdayLabel: string;
        dayNum: number;
        sessions: WorkoutSessionDto[];
      }> = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(nowMs - i * 86400000);
        const iso = d.toISOString().slice(0, 10);
        days.push({
          iso,
          weekdayLabel: d.toLocaleDateString('en-US', { weekday: 'short' }),
          dayNum: d.getDate(),
          sessions: filteredSessions.filter((s) => s.startedAt.slice(0, 10) === iso),
        });
      }
      return { mode: 'days' as const, title: 'Last 30 Days Activity Calendar', items: days };
    }

    if (period === 'year') {
      const nowDate = new Date(nowMs);
      const months: Array<{
        key: string;
        label: string;
        sessions: WorkoutSessionDto[];
        totalSets: number;
        totalVolumeKg: number;
      }> = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() - i, 1));
        const ym = d.toISOString().slice(0, 7);
        const label = d.toLocaleDateString('en-US', {
          month: 'short',
          year: '2-digit',
          timeZone: 'UTC',
        });
        const monthSessions = filteredSessions.filter((s) => s.startedAt.slice(0, 7) === ym);
        months.push({
          key: ym,
          label,
          sessions: monthSessions,
          totalSets: monthSessions.reduce((acc, s) => acc + s.totalSetsCompleted, 0),
          totalVolumeKg: Math.round(monthSessions.reduce((acc, s) => acc + s.totalVolumeKg, 0)),
        });
      }
      return { mode: 'buckets' as const, title: 'Last 12 Months Activity', items: months };
    }

    // period === 'all' -> Group by Year
    const byYear = new Map<
      string,
      {
        key: string;
        label: string;
        sessions: WorkoutSessionDto[];
        totalSets: number;
        totalVolumeKg: number;
      }
    >();
    for (const s of filteredSessions) {
      const yr = s.startedAt.slice(0, 4);
      const cur = byYear.get(yr) ?? {
        key: yr,
        label: yr,
        sessions: [],
        totalSets: 0,
        totalVolumeKg: 0,
      };
      cur.sessions.push(s);
      cur.totalSets += s.totalSetsCompleted;
      cur.totalVolumeKg += s.totalVolumeKg;
      byYear.set(yr, cur);
    }
    const years = Array.from(byYear.values())
      .map((y) => ({ ...y, totalVolumeKg: Math.round(y.totalVolumeKg) }))
      .sort((a, b) => a.key.localeCompare(b.key));

    return { mode: 'buckets' as const, title: 'All-Time Yearly Training Activity', items: years };
  }, [filteredSessions, period, nowMs]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Period Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Training Diary & Progress Analytics
          </h1>
          <p className="text-muted-foreground text-sm">
            Calendar history, working-set volume, stretching time, muscle distribution, and PRs
          </p>
        </div>

        <Tabs
          value={period}
          onValueChange={(val) => {
            setPeriod(val as 'week' | 'month' | 'year' | 'all');
            setVisibleCount(20);
          }}
        >
          <TabsList>
            {(['week', 'month', 'year', 'all'] as const).map((p) => (
              <TabsTrigger key={p} value={p} className="capitalize">
                {p === 'all' ? 'All Time' : `This ${p}`}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Filter Bar */}
      <Card className="flex-row flex-wrap items-center gap-3 p-3.5">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold">
          <Filter className="h-3.5 w-3.5" /> Filter Analytics:
        </div>
        <NativeSelect
          aria-label="Filter analytics by muscle group"
          value={filterMuscle}
          onChange={(e) => setFilterMuscle(e.target.value as MuscleGroup | 'ALL')}
          className="bg-secondary h-8 text-xs"
        >
          <option value="ALL">All Muscle Groups</option>
          {Object.values(MuscleGroup).map((mg) => (
            <option key={mg} value={mg}>
              {MUSCLE_GROUP_LABELS[mg]}
            </option>
          ))}
        </NativeSelect>

        <NativeSelect
          aria-label="Filter analytics by exercise"
          value={selectedExerciseId}
          onChange={(e) => setSelectedExerciseId(e.target.value)}
          className="bg-secondary h-8 text-xs"
        >
          <option value="ALL">All Exercises</option>
          {catalog.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </Card>

      {/* Top KPI Cards (Strength Volume vs Stretching Duration strictly separated) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-muted-foreground text-xs font-medium">Completed Sessions</p>
          <p className="font-mono-tabular text-primary mt-1 text-2xl font-extrabold">
            {stats.totalSessions}
          </p>
          <p className="text-muted-foreground mt-0.5 text-[11px]">
            {stats.strengthSessions} strength • {stats.stretchingSessions} stretch
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-muted-foreground text-xs font-medium">Working Strength Volume</p>
          <p className="font-mono-tabular mt-1 text-2xl font-extrabold">
            {stats.totalVolumeKg.toLocaleString()} <span className="text-sm font-normal">kg</span>
          </p>
          <p className="text-muted-foreground mt-0.5 text-[11px]">
            Excludes warm-ups & timed stretches
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-muted-foreground text-xs font-medium">Completed Sets & Reps</p>
          <p className="font-mono-tabular mt-1 text-2xl font-extrabold">
            {stats.totalSets}{' '}
            <span className="text-muted-foreground text-xs font-normal">
              ({stats.totalReps} reps)
            </span>
          </p>
          <p className="text-muted-foreground mt-0.5 text-[11px]">Logged across exercises</p>
        </Card>

        <Card className="p-4">
          <p className="text-muted-foreground text-xs font-medium">Stretching & Mobility</p>
          <p className="font-mono-tabular text-accent mt-1 text-2xl font-extrabold">
            {stats.totalStretchMinutes} <span className="text-sm font-normal">min</span>
          </p>
          <p className="text-muted-foreground mt-0.5 text-[11px]">Dedicated recovery time</p>
        </Card>
      </div>

      {/* Period-Aware Training Activity Strip / Breakdown */}
      <Card className="space-y-3 rounded-3xl p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display flex items-center gap-2 text-base font-bold">
            <CalendarIcon className="text-primary h-4 w-4" /> {activityData.title}
          </h2>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1">
              <span className="bg-primary inline-block h-2.5 w-2.5 rounded-sm" /> Strength
            </span>
            <span className="flex items-center gap-1">
              <span className="bg-accent inline-block h-2.5 w-2.5 rounded-sm" /> Stretching
            </span>
          </div>
        </div>

        {activityData.mode === 'days' ? (
          <div
            className={
              period === 'week'
                ? 'grid grid-cols-7 gap-2'
                : 'grid grid-cols-6 gap-2 sm:grid-cols-10 md:grid-cols-15'
            }
          >
            {activityData.items.map((day) => {
              const hasStrength = day.sessions.some(
                (s) => s.sessionType !== SessionType.STRETCHING,
              );
              const hasStretch = day.sessions.some(
                (s) => s.sessionType === SessionType.STRETCHING,
              );
              return (
                <div
                  key={day.iso}
                  onClick={() => {
                    if (day.sessions[0]) setInspectingSession(day.sessions[0]);
                  }}
                  title={`${day.iso}: ${day.sessions.length} session(s)`}
                  className={`flex flex-col items-center justify-center rounded-xl border px-1.5 py-2 text-xs transition ${
                    period === 'week' ? 'min-h-16' : 'h-12'
                  } ${
                    hasStrength
                      ? 'border-primary/60 bg-primary/20 text-primary cursor-pointer font-bold'
                      : hasStretch
                        ? 'border-accent/60 bg-accent/20 text-accent cursor-pointer font-bold'
                        : 'bg-secondary/30 text-muted-foreground'
                  }`}
                >
                  {period === 'week' && (
                    <span className="text-[10px] font-medium opacity-75">{day.weekdayLabel}</span>
                  )}
                  <span className="font-mono-tabular text-[11px]">{day.dayNum}</span>
                  {day.sessions.length > 0 && (
                    <span className="text-[9px]">{day.sessions.length}x</span>
                  )}
                </div>
              );
            })}
          </div>
        ) : activityData.items.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-xs">
            No sessions found for this filter selection.
          </p>
        ) : (
          <div
            className={
              period === 'year'
                ? 'grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6'
                : 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5'
            }
          >
            {activityData.items.map((bucket) => {
              const hasSessions = bucket.sessions.length > 0;
              return (
                <div
                  key={bucket.key}
                  onClick={() => {
                    if (bucket.sessions[0]) setInspectingSession(bucket.sessions[0]);
                  }}
                  className={`flex flex-col justify-between rounded-2xl border p-3 text-xs transition ${
                    hasSessions
                      ? 'border-primary/50 bg-primary/15 cursor-pointer'
                      : 'bg-secondary/30 text-muted-foreground'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display font-bold">{bucket.label}</span>
                    <span
                      className={`font-mono-tabular text-[11px] font-extrabold ${
                        hasSessions ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    >
                      {bucket.sessions.length} sess.
                    </span>
                  </div>
                  <div className="text-muted-foreground font-mono-tabular mt-2 text-[10px]">
                    {bucket.totalSets} sets • {(bucket.totalVolumeKg / 1000).toFixed(1)}t vol
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Muscle Distribution & Personal Records */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Muscle Group Distribution */}
        <Card className="space-y-3 rounded-3xl p-5">
          <h2 className="font-display flex items-center gap-2 text-base font-bold">
            <TrendingUp className="text-primary h-4 w-4" /> Muscle Group Distribution
          </h2>
          {stats.muscleDistribution.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-xs">
              Complete a workout session to see your muscle-group training balance.
            </p>
          ) : (
            <div className="space-y-2.5">
              {stats.muscleDistribution.map((m) => (
                <div key={m.muscle} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">{m.label}</span>
                    <span className="font-mono-tabular text-muted-foreground">
                      {m.sets} sets ({m.pct}%) • {m.volumeKg.toLocaleString()} kg
                    </span>
                  </div>
                  <Progress value={Math.max(4, m.pct)} className="bg-secondary h-2" />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Personal Records Leaderboard */}
        <Card className="space-y-3 rounded-3xl p-5">
          <h2 className="font-display flex items-center gap-2 text-base font-bold">
            <Trophy className="text-primary h-4 w-4" /> Exercise Personal Records & Est. 1RM
          </h2>
          {stats.personalRecords.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-xs">
              Personal records are automatically calculated from your completed working sets.
            </p>
          ) : (
            <div className="space-y-2">
              {stats.personalRecords.slice(0, 6).map((pr) => (
                <div
                  key={pr.exerciseName}
                  className="bg-secondary/40 flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs"
                >
                  <div>
                    <p className="font-bold">{pr.exerciseName}</p>
                    <p className="text-muted-foreground text-[10px]">
                      {MUSCLE_GROUP_LABELS[pr.muscle]} • {pr.date}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono-tabular text-primary font-extrabold">
                      {pr.maxWeightKg} kg × {pr.reps}
                    </p>
                    <p className="text-muted-foreground font-mono-tabular text-[10px]">
                      Est. 1RM: {pr.est1RM} kg
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Diary Timeline List */}
      <div className="space-y-3">
        <h2 className="font-display text-lg font-bold">
          Workout Diary Timeline ({filteredSessions.length})
        </h2>

        {filteredSessions.length === 0 ? (
          <Card className="rounded-3xl p-10 text-center">
            <Dumbbell className="text-muted-foreground mx-auto mb-2 h-8 w-8 opacity-50" />
            <p className="font-display text-base font-bold">No training sessions recorded yet</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Start a workout session to begin tracking your training history.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredSessions.slice(0, visibleCount).map((session) => (
              <Card
                key={session.clientSessionId}
                className="hover:border-primary/40 flex-col justify-between gap-4 p-4 transition sm:flex-row sm:items-center"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        session.sessionType === SessionType.STRETCHING ? 'accent' : 'default'
                      }
                      className="text-[10px] uppercase"
                    >
                      {session.sessionType === SessionType.STRETCHING ? (
                        <Sparkles className="h-3 w-3" />
                      ) : (
                        <Dumbbell className="h-3 w-3" />
                      )}
                      {session.sessionType}
                    </Badge>
                    <span className="text-muted-foreground font-mono-tabular text-xs">
                      {new Date(session.startedAt).toLocaleDateString(undefined, {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>

                  <h3 className="font-display text-base font-bold">
                    {session.workoutNameSnapshot}
                  </h3>
                  <p className="text-muted-foreground text-xs">
                    {session.exercises.map((e) => e.exerciseNameSnapshot).join(' • ')}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="bg-secondary/60 rounded-xl px-3 py-1.5 text-right text-xs">
                    <span className="text-muted-foreground block text-[10px]">Duration</span>
                    <strong className="font-mono-tabular">
                      {Math.max(1, Math.round(session.activeDurationSeconds / 60))}m
                    </strong>
                  </div>
                  <div className="bg-secondary/60 rounded-xl px-3 py-1.5 text-right text-xs">
                    <span className="text-muted-foreground block text-[10px]">Sets</span>
                    <strong className="font-mono-tabular">{session.totalSetsCompleted}</strong>
                  </div>
                  <div className="bg-secondary/60 rounded-xl px-3 py-1.5 text-right text-xs">
                    <span className="text-muted-foreground block text-[10px]">
                      {session.sessionType === SessionType.STRETCHING ? 'Stretch' : 'Volume'}
                    </span>
                    <strong className="font-mono-tabular text-primary">
                      {session.sessionType === SessionType.STRETCHING
                        ? `${Math.round(session.totalStretchSeconds / 60)}m`
                        : `${session.totalVolumeKg.toLocaleString()} kg`}
                    </strong>
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setInspectingSession(session)}
                  >
                    <Edit3 className="h-3.5 w-3.5" /> Inspect / Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete session ${session.workoutNameSnapshot}`}
                    onClick={() => void deleteHistoricalSession(session.clientSessionId)}
                    className="text-muted-foreground hover:text-destructive size-8"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}

            {filteredSessions.length > visibleCount && (
              <div className="flex justify-center pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setVisibleCount((prev) => prev + 30)}
                >
                  Show More Sessions ({filteredSessions.length - visibleCount} remaining)
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Historical Session Inspection & Correction Modal */}
      <Dialog
        open={Boolean(inspectingSession)}
        onOpenChange={(open) => {
          if (!open) setInspectingSession(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          {inspectingSession && (
            <>
              <DialogHeader>
                <span className="text-muted-foreground font-mono-tabular text-xs">
                  {new Date(inspectingSession.startedAt).toLocaleString()}
                </span>
                <DialogTitle className="font-display text-xl font-bold">
                  {inspectingSession.workoutNameSnapshot}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Correct any recorded weight or repetition value below and click Save Corrections.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {inspectingSession.exercises.map((ex, exIdx) => (
                  <div
                    key={ex.clientExerciseId}
                    className="bg-secondary/30 space-y-2 rounded-2xl border p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display text-sm font-bold">
                        {exIdx + 1}. {ex.exerciseNameSnapshot}
                      </span>
                      <span className="text-muted-foreground text-[11px]">
                        {MUSCLE_GROUP_LABELS[ex.primaryMuscleSnapshot]}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {ex.sets.map((set, sIdx) => (
                        <div
                          key={set.clientSetId}
                          className="bg-background flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs"
                        >
                          <span className="font-mono-tabular font-bold">
                            Set {sIdx + 1} ({set.setType})
                          </span>
                          <div className="flex items-center gap-2">
                            <Label className="text-muted-foreground text-[10px]">
                              Weight ({weightUnit})
                            </Label>
                            <Input
                              type="number"
                              step="0.5"
                              value={set.weight ?? ''}
                              onChange={(e) => {
                                const val =
                                  e.target.value === '' ? null : Number(e.target.value);
                                setInspectingSession((prev) => {
                                  if (!prev) return null;
                                  return {
                                    ...prev,
                                    exercises: prev.exercises.map((item) =>
                                      item.clientExerciseId === ex.clientExerciseId
                                        ? {
                                            ...item,
                                            sets: item.sets.map((st) =>
                                              st.clientSetId === set.clientSetId
                                                ? { ...st, weight: val }
                                                : st,
                                            ),
                                          }
                                        : item,
                                    ),
                                  };
                                });
                              }}
                              className="bg-secondary font-mono-tabular h-7 w-16 px-2 text-center text-xs"
                            />
                            <Label className="text-muted-foreground text-[10px]">Reps</Label>
                            <Input
                              type="number"
                              value={set.reps ?? ''}
                              onChange={(e) => {
                                const val =
                                  e.target.value === '' ? null : Number(e.target.value);
                                setInspectingSession((prev) => {
                                  if (!prev) return null;
                                  return {
                                    ...prev,
                                    exercises: prev.exercises.map((item) =>
                                      item.clientExerciseId === ex.clientExerciseId
                                        ? {
                                            ...item,
                                            sets: item.sets.map((st) =>
                                              st.clientSetId === set.clientSetId
                                                ? { ...st, reps: val }
                                                : st,
                                            ),
                                          }
                                        : item,
                                    ),
                                  };
                                });
                              }}
                              className="bg-secondary font-mono-tabular h-7 w-14 px-2 text-center text-xs"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setInspectingSession(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={async () => {
                    await updateHistoricalSession(inspectingSession);
                    setInspectingSession(null);
                  }}
                >
                  <Check className="h-4 w-4" /> Save Corrections
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
