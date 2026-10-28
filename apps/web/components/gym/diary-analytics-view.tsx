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
  Heart,
  Flame,
  Watch,
  Smartphone,
} from 'lucide-react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
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
import { Label } from '@luki-fitti/ui/components/ui/label';
import { NativeSelect } from '@luki-fitti/ui/components/ui/native-select';
import { Progress } from '@luki-fitti/ui/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@luki-fitti/ui/components/ui/tabs';
import { useGym } from '@/providers/gym/gym-context';
import { useLocale } from '@/providers/i18n/locale-context';
import {
  formatDate,
  formatDateTime,
  formatLongDateTime,
  formatShortDayMonth,
  isoWeekDays,
  startOfIsoWeek,
} from '@luki-fitti/common/utils/client';
import {
  ExerciseType,
  MuscleGroup,
  SessionSourceDevice,
  SessionType,
  SetType,
  WeightUnit,
} from '@luki-fitti/common/enums';
import type { WorkoutSessionDto } from '@luki-fitti/common/schemas';
import { ExercisePicker } from './exercise-picker';
import { ConfirmDestructiveDialog } from './confirm-destructive-dialog';
import { NumberInput } from './number-input';
import { bigVolume, formatVolume, unitLabel, weightInUnit } from '@/lib/format/weight';
import { getSetBadgeLabels, SET_TYPE_TEXT_CLASS, SetTypeBadge } from './set-type-badge';

const LBS_TO_KG = 0.45359237;

function toLocalDateIso(dateInput: Date | string | number): string {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function DiaryAnalyticsView() {
  const { historySessions, catalog, weightUnit, updateHistoricalSession, deleteHistoricalSession } =
    useGym();
  const { t, format, locale, bcp47, muscleLabel, sessionTypeLabel, setTypeLabel } = useLocale();

  const [nowMs] = useState<number>(() => Date.now());
  const [period, setPeriod] = useState<'week' | 'month' | 'year' | 'all'>('month');
  const [filterMuscle, setFilterMuscle] = useState<MuscleGroup | 'ALL'>('ALL');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('ALL');
  const [inspectingSession, setInspectingSession] = useState<WorkoutSessionDto | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(20);
  const [pendingDelete, setPendingDelete] = useState<WorkoutSessionDto | null>(null);
  const unit = unitLabel(weightUnit);
  const bigUnit = bigVolume(0, weightUnit).label;

  const filteredSessions = useMemo(() => {
    const cutoffMs =
      period === 'week'
        ? startOfIsoWeek(nowMs).getTime()
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

        const isStretch = ex.exerciseTypeSnapshot === ExerciseType.STRETCHING;

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
                  date: formatDate(s.startedAt),
                });
              }
            }
          }
          muscleSets.set(ex.primaryMuscleSnapshot, curM);
        }

        if (exMaxWeight > 0) {
          progression.push({
            date: s.startedAt,
            workoutName: s.workoutNameSnapshot,
            exerciseName: ex.exerciseNameSnapshot,
            maxWeightKg: Math.round(exMaxWeight * 10) / 10,
            est1RM: Math.round(exBest1RM * 10) / 10,
            volumeKg: Math.round(exVol),
          });
        }
      }
    }

    const totalMuscleSetCount = Array.from(muscleSets.values()).reduce((a, b) => a + b.sets, 0);

    const muscleDistribution = Array.from(muscleSets.entries())
      .map(([muscle, data]) => ({
        muscle,
        label: muscleLabel(muscle),
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
      progression: progression.slice(-20),
    };
  }, [filteredSessions, filterMuscle, selectedExerciseId, muscleLabel]);

  const diaryChartData = useMemo(() => {
    if (selectedExerciseId !== 'ALL') {
      return stats.progression.map((p) => ({
        label: formatShortDayMonth(p.date),
        fullDate: formatDateTime(p.date),
        workoutName: p.workoutName,
        est1RM: weightInUnit(p.est1RM, weightUnit),
        maxWeightKg: weightInUnit(p.maxWeightKg, weightUnit),
        volumeTons: bigVolume(p.volumeKg, weightUnit).value,
        volumeKg: p.volumeKg,
        sets: 0,
      }));
    }

    const strengthChrono = [...filteredSessions]
      .filter((s) => s.sessionType !== SessionType.STRETCHING && s.totalVolumeKg > 0)
      .reverse()
      .slice(-20);

    return strengthChrono.map((s) => ({
      label: formatShortDayMonth(s.startedAt),
      fullDate: formatDateTime(s.startedAt),
      workoutName: s.workoutNameSnapshot,
      est1RM: 0,
      maxWeightKg: 0,
      volumeTons: bigVolume(s.totalVolumeKg, weightUnit).value,
      volumeKg: Math.round(s.totalVolumeKg),
      sets: s.totalSetsCompleted,
    }));
  }, [filteredSessions, selectedExerciseId, stats.progression, weightUnit]);

  // Dynamic activity breakdown matching the selected period ('week' | 'month' | 'year' | 'all')
  const activityData = useMemo(() => {
    const nowDate = new Date(nowMs);

    if (period === 'week') {
      const days: Array<{
        iso: string;
        weekdayLabel: string;
        dayNum: number;
        sessions: WorkoutSessionDto[];
      }> = [];
      for (const d of isoWeekDays(nowDate)) {
        const iso = toLocalDateIso(d);
        days.push({
          iso,
          weekdayLabel: d.toLocaleDateString(bcp47, { weekday: 'short' }),
          dayNum: d.getDate(),
          sessions: filteredSessions.filter((s) => toLocalDateIso(s.startedAt) === iso),
        });
      }
      return {
        mode: 'days' as const,
        title: t.diary.thisWeekTitle,
        leadingEmptyDays: 0,
        items: days,
      };
    }

    if (period === 'month') {
      const days: Array<{
        iso: string;
        weekdayLabel: string;
        dayNum: number;
        sessions: WorkoutSessionDto[];
      }> = [];
      const firstDay = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - 29);
      const leadingEmptyDays = (firstDay.getDay() + 6) % 7;
      for (let i = 29; i >= 0; i--) {
        const d = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - i);
        const iso = toLocalDateIso(d);
        days.push({
          iso,
          weekdayLabel: d.toLocaleDateString(bcp47, { weekday: 'short' }),
          dayNum: d.getDate(),
          sessions: filteredSessions.filter((s) => toLocalDateIso(s.startedAt) === iso),
        });
      }
      return {
        mode: 'days' as const,
        title: t.diary.last30DaysTitle,
        leadingEmptyDays,
        items: days,
      };
    }

    if (period === 'year') {
      const months: Array<{
        key: string;
        label: string;
        sessions: WorkoutSessionDto[];
        totalSets: number;
        totalVolumeKg: number;
      }> = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - i, 1);
        const ym = toLocalDateIso(d).slice(0, 7);
        const label = d.toLocaleDateString(bcp47, {
          month: 'short',
          year: '2-digit',
        });
        const monthSessions = filteredSessions.filter(
          (s) => toLocalDateIso(s.startedAt).slice(0, 7) === ym,
        );
        months.push({
          key: ym,
          label,
          sessions: monthSessions,
          totalSets: monthSessions.reduce((acc, s) => acc + s.totalSetsCompleted, 0),
          totalVolumeKg: Math.round(monthSessions.reduce((acc, s) => acc + s.totalVolumeKg, 0)),
        });
      }
      return { mode: 'buckets' as const, title: t.diary.last12MonthsTitle, items: months };
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
      const yr = toLocalDateIso(s.startedAt).slice(0, 4);
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

    return { mode: 'buckets' as const, title: t.diary.allTimeYearlyTitle, items: years };
  }, [filteredSessions, period, nowMs, bcp47, t.diary]);

  const periodLabels: Record<'week' | 'month' | 'year' | 'all', string> = {
    week: t.diary.periodWeek,
    month: t.diary.periodMonth,
    year: t.diary.periodYear,
    all: t.diary.periodAll,
  };

  return (
    <div className="min-w-0 max-w-full space-y-6 pb-12">
      {/* Header & Period Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            {t.diary.title}
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm">{t.diary.subtitle}</p>
        </div>

        <Tabs
          value={period}
          onValueChange={(val) => {
            setPeriod(val as 'week' | 'month' | 'year' | 'all');
            setVisibleCount(20);
          }}
          className="w-full sm:w-auto"
        >
          <TabsList className="grid w-full grid-cols-4 sm:inline-flex sm:w-auto">
            {(['week', 'month', 'year', 'all'] as const).map((p) => (
              <TabsTrigger key={p} value={p} className="px-2 text-xs sm:px-3">
                {periodLabels[p]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Filter Bar */}
      <Card className="min-w-0 flex-col items-stretch gap-2.5 p-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold">
          <Filter className="h-3.5 w-3.5 shrink-0" /> {t.diary.filterAnalyticsLabel}
        </div>
        <NativeSelect
          aria-label={t.a11y.filterMuscle}
          value={filterMuscle}
          onChange={(e) => setFilterMuscle(e.target.value as MuscleGroup | 'ALL')}
          className="w-full sm:w-auto"
        >
          <option value="ALL">{t.diary.allMuscleGroups}</option>
          {Object.values(MuscleGroup).map((mg) => (
            <option key={mg} value={mg}>
              {muscleLabel(mg)}
            </option>
          ))}
        </NativeSelect>

        <ExercisePicker
          exercises={catalog}
          value={selectedExerciseId}
          emptyOptionLabel={t.diary.allExercises}
          emptyOptionValue="ALL"
          ariaLabel={t.a11y.filterExercise}
          onValueChange={(val) => setSelectedExerciseId(val || 'ALL')}
          className="w-full sm:w-72"
          triggerClassName="bg-secondary h-8 text-xs"
        />
      </Card>

      <dl className="bg-card divide-border/70 divide-y overflow-hidden rounded-[1.25rem]">
        {[
          {
            label: t.diary.completedSessionsTitle,
            value: String(stats.totalSessions),
            sub: format(t.diary.strengthVsStretchSub, {
              strength: stats.strengthSessions,
              stretch: stats.stretchingSessions,
            }),
          },
          {
            label: t.diary.workingVolumeTitle,
            value: `${formatVolume(stats.totalVolumeKg, weightUnit)} ${unit}`,
            sub: t.diary.workingVolumeSub,
          },
          {
            label: t.diary.completedSetsRepsTitle,
            value: `${stats.totalSets} · ${stats.totalReps} ${t.common.reps}`,
            sub: null,
          },
          {
            label: t.diary.stretchingMobilityTitle,
            value: `${stats.totalStretchMinutes} ${t.common.min}`,
            sub: null,
          },
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 px-5 py-3.5">
            <dt className="min-w-0">
              <span className="block text-[1.0625rem]">{row.label}</span>
              {row.sub && (
                <span className="text-muted-foreground block text-[0.8125rem]">{row.sub}</span>
              )}
            </dt>
            <dd className="text-muted-foreground shrink-0 text-[1.0625rem] tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>

      {/* Period-Aware Training Activity Strip / Breakdown */}
      <Card className="space-y-3 rounded-[1.25rem] p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display flex items-center gap-2 text-base font-bold">
            <CalendarIcon className="text-primary h-4 w-4" /> {activityData.title}
          </h2>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="bg-primary inline-block h-2.5 w-2.5 rounded-sm" />{' '}
              {t.diary.strengthLegend}
            </span>
            <span className="flex items-center gap-1">
              <span className="border-set-stretch inline-block h-2.5 w-2.5 rounded-full border-2" />{' '}
              {t.diary.stretchingLegend}
            </span>
          </div>
        </div>

        {activityData.mode === 'days' ? (
          <div className="space-y-2">
            {period === 'month' && (
              <div className="grid grid-cols-7 gap-2 text-center">
                {t.diary.weekdaysShort.map((weekday) => (
                  <span key={weekday} className="text-muted-foreground text-xs font-semibold">
                    {weekday}
                  </span>
                ))}
              </div>
            )}
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: activityData.leadingEmptyDays }).map((_, idx) => (
                <div
                  key={`empty-${idx}`}
                  aria-hidden="true"
                  className="h-12 rounded-xl border border-transparent"
                />
              ))}
              {activityData.items.map((day) => {
                const hasStrength = day.sessions.some(
                  (s) => s.sessionType !== SessionType.STRETCHING,
                );
                const hasStretch = day.sessions.some(
                  (s) => s.sessionType === SessionType.STRETCHING,
                );
                const dayClass = `relative flex flex-col items-center justify-center rounded-xl border px-1.5 py-2 text-xs transition ${
                  period === 'week' ? 'min-h-16' : 'h-12'
                } ${
                  hasStrength
                    ? 'border-primary/60 bg-primary/12 text-primary font-bold'
                    : hasStretch
                      ? 'border-set-stretch border-2 bg-card text-foreground font-bold'
                      : 'bg-secondary/30 text-muted-foreground'
                }`;
                const dayContent = (
                  <>
                    {period === 'week' && (
                      <span className="text-xs font-medium opacity-75">{day.weekdayLabel}</span>
                    )}
                    <span className="tabular-nums text-xs">{day.dayNum}</span>
                    {day.sessions.length > 0 && (
                      <span className="text-xs">{day.sessions.length}x</span>
                    )}
                    {hasStrength && hasStretch && (
                      <span
                        aria-hidden="true"
                        className="border-set-stretch absolute top-1 right-1 size-2 rounded-full border-2"
                      />
                    )}
                  </>
                );
                if (day.sessions.length === 0) {
                  return (
                    <div key={day.iso} className={dayClass}>
                      {dayContent}
                    </div>
                  );
                }
                return (
                  <button
                    key={day.iso}
                    type="button"
                    onClick={() => setInspectingSession(day.sessions[0]!)}
                    aria-label={format(t.a11y.dayWorkouts, {
                      date: `${day.weekdayLabel} ${day.dayNum}`,
                      count: day.sessions.length,
                    })}
                    className={`${dayClass} focus-visible:ring-ring/50 outline-hidden focus-visible:ring-[3px]`}
                  >
                    {dayContent}
                  </button>
                );
              })}
            </div>
          </div>
        ) : activityData.items.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-xs">
            {t.diary.noSessionsFound}
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
                <button
                  key={bucket.key}
                  type="button"
                  disabled={!hasSessions}
                  onClick={() => {
                    if (bucket.sessions[0]) setInspectingSession(bucket.sessions[0]);
                  }}
                  className={`focus-visible:ring-ring/50 flex flex-col justify-between rounded-2xl border p-3 text-left text-xs outline-hidden transition focus-visible:ring-[3px] ${
                    hasSessions
                      ? 'border-primary/50 bg-primary/12'
                      : 'bg-secondary/30 text-muted-foreground'
                  }`}
                >
                  <span className="flex w-full items-center justify-between">
                    <span className="font-display font-bold">{bucket.label}</span>
                    <span
                      className={`tabular-nums text-xs font-semibold ${
                        hasSessions ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    >
                      {bucket.sessions.length} {t.diary.sessShort}
                    </span>
                  </span>
                  <span className="text-muted-foreground tabular-nums mt-2 block text-xs">
                    {bucket.totalSets} {t.common.sets} ·{' '}
                    {bigVolume(bucket.totalVolumeKg, weightUnit).value} {bigUnit}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Diary Progression Chart (Session Volume & Working Sets OR Exercise e1RM Progression) */}
      <Card className="min-w-0 space-y-4 overflow-hidden rounded-[1.25rem] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-display flex items-center gap-2 text-base font-bold">
              <TrendingUp className="text-primary h-4 w-4" />
              {selectedExerciseId !== 'ALL'
                ? format(t.diary.exerciseProgressionTitle, {
                    name:
                      catalog.find((c) => c.id === selectedExerciseId)?.name ?? t.common.exercise,
                  })
                : t.diary.sessionVolumeProgressionTitle}
            </h2>
            <p className="text-muted-foreground text-xs">
              {selectedExerciseId !== 'ALL'
                ? t.diary.exerciseProgressionSub
                : t.diary.sessionVolumeProgressionSub}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 font-semibold">
              <span className="bg-primary inline-block h-2.5 w-2.5 rounded-sm" />
              {format(selectedExerciseId !== 'ALL' ? t.diary.est1RmLegend : t.diary.volumeTonsLegend, {
                unit: selectedExerciseId !== 'ALL' ? unit : bigUnit,
              })}
            </span>
            <span className="flex items-center gap-1.5 font-semibold">
              <span className="bg-chart-2 inline-block h-2.5 w-2.5 rounded-full" />
              {selectedExerciseId !== 'ALL'
                ? format(t.diary.maxWeightLegend, { unit })
                : t.diary.completedSetsLegend}
            </span>
          </div>
        </div>

        {diaryChartData.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-xs">
            {t.diary.noCompletedStrengthSessions}
          </p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={diaryChartData}
                margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="diaryVolGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.65} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.08} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  unit={selectedExerciseId !== 'ALL' ? unit : bigUnit}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{
                    stroke: 'color-mix(in oklch, var(--muted-foreground) 30%, transparent)',
                    strokeWidth: 1,
                  }}
                  wrapperStyle={{ outline: 'none' }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as
                      { fullDate?: string; workoutName?: string } | undefined;
                    return (
                      <div className="bg-popover/95 text-popover-foreground border-border pointer-events-none max-w-[200px] rounded-xl border px-2.5 py-1.5 text-xs leading-tight shadow-md backdrop-blur-sm">
                        <p className="text-foreground truncate font-semibold">
                          {row?.workoutName ?? String(label ?? '')}
                        </p>
                        {row?.fullDate && (
                          <p className="text-muted-foreground tabular-nums mb-1 text-xs">
                            {row.fullDate}
                          </p>
                        )}
                        <div className="space-y-0.5">
                          {payload.map((item) => {
                            const key = String(item.dataKey);
                            const val = Number(item.value ?? 0);
                            const isPrimary = key === 'volumeTons' || key === 'est1RM';
                            const metricLabel =
                              key === 'volumeTons'
                                ? t.home.volumeLabel
                                : key === 'sets'
                                  ? t.diary.setsSmall
                                  : key === 'est1RM'
                                    ? t.diary.estMaxLabel
                                    : format(t.diary.maxWeightLegend, { unit });
                            const metricValue =
                              key === 'volumeTons'
                                ? `${val} ${bigUnit}`
                                : key === 'sets'
                                  ? `${val} ${t.common.sets}`
                                  : `${val} ${unit}`;

                            return (
                              <div key={key} className="flex items-center justify-between gap-2.5">
                                <span className="text-muted-foreground flex items-center gap-1.5">
                                  <span
                                    className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                                      isPrimary ? 'bg-primary' : 'bg-chart-2'
                                    }`}
                                  />
                                  {metricLabel}
                                </span>
                                <span className="text-foreground tabular-nums font-bold">
                                  {metricValue}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }}
                />
                {selectedExerciseId !== 'ALL' ? (
                  <>
                    <Bar
                      yAxisId="right"
                      dataKey="maxWeightKg"
                      fill="var(--chart-2)"
                      fillOpacity={0.45}
                      radius={[6, 6, 0, 0]}
                      maxBarSize={24}
                    />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="est1RM"
                      stroke="var(--chart-1)"
                      strokeWidth={2.5}
                      fill="url(#diaryVolGrad)"
                    />
                  </>
                ) : (
                  <>
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="volumeTons"
                      stroke="var(--chart-1)"
                      strokeWidth={2.5}
                      fill="url(#diaryVolGrad)"
                    />
                    <Bar
                      yAxisId="right"
                      dataKey="sets"
                      fill="var(--chart-2)"
                      fillOpacity={0.5}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={18}
                    />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Muscle Distribution & Personal Records */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Muscle Group Distribution */}
        <Card className="space-y-3 rounded-[1.25rem] p-5">
          <h2 className="font-display flex items-center gap-2 text-base font-bold">
            <TrendingUp className="text-primary h-4 w-4" /> {t.diary.muscleDistTitle}
          </h2>
          {stats.muscleDistribution.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-xs">
              {t.diary.muscleDistEmpty}
            </p>
          ) : (
            <div className="space-y-2.5">
              {stats.muscleDistribution.map((m) => (
                <div key={m.muscle} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">{m.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {m.sets} {t.common.sets} ({m.pct}%) · {formatVolume(m.volumeKg, weightUnit)} {unit}
                    </span>
                  </div>
                  <Progress value={Math.max(4, m.pct)} className="bg-secondary h-2" />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Personal Records Leaderboard */}
        <Card className="space-y-3 rounded-[1.25rem] p-5">
          <h2 className="font-display flex items-center gap-2 text-base font-bold">
            <Trophy className="text-primary h-4 w-4" /> {t.diary.prLeaderboardTitle}
          </h2>
          {stats.personalRecords.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-xs">
              {t.diary.prLeaderboardEmpty}
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
                    <p className="text-muted-foreground text-xs">
                      {muscleLabel(pr.muscle)} • {pr.date}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular-nums text-primary font-semibold">
                      {weightInUnit(pr.maxWeightKg, weightUnit)} {unit} × {pr.reps}
                    </p>
                    <p className="text-muted-foreground tabular-nums text-xs">
                      {t.diary.estMaxLabel}: {weightInUnit(pr.est1RM, weightUnit)} {unit}
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
          {format(t.diary.timelineTitle, { count: filteredSessions.length })}
        </h2>

        {filteredSessions.length === 0 ? (
          <Card className="rounded-[1.25rem] p-10 text-center">
            <Dumbbell className="text-muted-foreground mx-auto mb-2 h-8 w-8 opacity-50" />
            <p className="font-display text-base font-bold">{t.diary.timelineEmptyTitle}</p>
            <p className="text-muted-foreground mt-1 text-xs">{t.diary.timelineEmptySub}</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredSessions.slice(0, visibleCount).map((session) => (
              <Card
                key={session.clientSessionId}
                data-testid={`diary-session-card-${session.workoutNameSnapshot}`}
                className="hover:border-primary/40 flex-col justify-between gap-4 p-4 transition md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-6"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        session.sessionType === SessionType.STRETCHING ? 'accent' : 'default'
                      }
                      className="text-xs"
                    >
                      {session.sessionType === SessionType.STRETCHING ? (
                        <Sparkles className="h-3 w-3" />
                      ) : (
                        <Dumbbell className="h-3 w-3" />
                      )}
                      {sessionTypeLabel(session.sessionType)}
                    </Badge>
                    <span className="text-muted-foreground tabular-nums text-xs">
                      {formatLongDateTime(session.startedAt, locale)}
                    </span>
                    {session.sourceDevice === SessionSourceDevice.APPLE_WATCH && (
                      <Badge variant="outline" className="gap-1 border-destructive/40 text-xs">
                        <Watch className="h-3 w-3 text-destructive" />
                        {t.diary.recordedOnAppleWatch}
                      </Badge>
                    )}
                    {session.sourceDevice === SessionSourceDevice.IPHONE && (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <Smartphone className="h-3 w-3" />
                        {t.diary.recordedOnIphone}
                      </Badge>
                    )}
                    {session.healthKitWorkoutUuid && (
                      <Badge
                        variant="outline"
                        className="gap-1 border-destructive/40 text-xs text-destructive"
                      >
                        <Heart className="h-3 w-3 fill-destructive text-destructive" />
                        {t.diary.syncedWithAppleHealth}
                      </Badge>
                    )}
                  </div>

                  <h3 className="font-display truncate text-base font-bold">
                    {session.workoutNameSnapshot}
                  </h3>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {session.exercises.map((e) => e.exerciseNameSnapshot).join(' • ')}
                  </p>
                  {(session.activeCaloriesKcal || session.avgHeartRateBpm) && (
                    <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs">
                      {typeof session.activeCaloriesKcal === 'number' &&
                        session.activeCaloriesKcal > 0 && (
                          <span className="tabular-nums inline-flex items-center gap-1 rounded-lg bg-warning/15 px-2 py-0.5 font-semibold text-warning">
                            <Flame className="h-3 w-3" />
                            {Math.round(session.activeCaloriesKcal)} kcal
                          </span>
                        )}
                      {typeof session.avgHeartRateBpm === 'number' &&
                        session.avgHeartRateBpm > 0 && (
                          <span className="tabular-nums inline-flex items-center gap-1 rounded-lg bg-destructive/15 px-2 py-0.5 font-semibold text-destructive">
                            <Heart className="h-3 w-3 fill-destructive" />
                            {t.diary.avgHeartRate}: {session.avgHeartRateBpm} bpm
                            {typeof session.maxHeartRateBpm === 'number' &&
                              session.maxHeartRateBpm > 0 &&
                              ` • ${t.diary.maxHeartRate}: ${session.maxHeartRateBpm} bpm`}
                          </span>
                        )}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t pt-3 md:flex-nowrap md:justify-end md:border-t-0 md:pt-0">
                  <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-2.5">
                    <div className="bg-secondary/60 rounded-xl px-3 py-1.5 text-right text-xs sm:w-[72px]">
                      <span className="text-muted-foreground block text-xs">
                        {t.diary.durationSmall}
                      </span>
                      <strong className="tabular-nums">
                        {Math.max(1, Math.round(session.activeDurationSeconds / 60))}m
                      </strong>
                    </div>
                    <div className="bg-secondary/60 rounded-xl px-3 py-1.5 text-right text-xs sm:w-[56px]">
                      <span className="text-muted-foreground block text-xs">
                        {t.diary.setsSmall}
                      </span>
                      <strong className="tabular-nums">{session.totalSetsCompleted}</strong>
                    </div>
                    <div className="bg-secondary/60 rounded-xl px-3 py-1.5 text-right text-xs sm:w-[104px]">
                      <span className="text-muted-foreground block text-xs">
                        {session.sessionType === SessionType.STRETCHING
                          ? t.diary.stretchSmall
                          : t.diary.volumeSmall}
                      </span>
                      <strong className="tabular-nums text-primary">
                        {session.sessionType === SessionType.STRETCHING
                          ? `${Math.round(session.totalStretchSeconds / 60)}m`
                          : `${formatVolume(session.totalVolumeKg, weightUnit)} ${unit}`}
                      </strong>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      data-testid="diary-session-inspect"
                      variant="secondary"
                      size="sm"
                      onClick={() => setInspectingSession(session)}
                    >
                      <Edit3 className="h-3.5 w-3.5" /> {t.diary.inspectEditBtn}
                    </Button>
                    <Button
                      type="button"
                      data-testid="diary-session-delete"
                      variant="ghost"
                      size="icon"
                      aria-label={format(t.a11y.deleteWorkoutSession, {
                        name: session.workoutNameSnapshot,
                      })}
                      onClick={() => setPendingDelete(session)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
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
                  {format(t.diary.showMoreSessions, {
                    count: filteredSessions.length - visibleCount,
                  })}
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
        <DialogContent className="max-h-[90dvh] overflow-hidden p-4 sm:max-w-2xl sm:p-6">
          {inspectingSession && (
            <div className="flex max-h-[calc(90dvh-2.5rem)] min-w-0 flex-col gap-3 overflow-hidden">
              <DialogHeader className="shrink-0">
                <span className="text-muted-foreground tabular-nums text-xs">
                  {formatDateTime(inspectingSession.startedAt)}
                </span>
                <DialogTitle className="font-display text-xl font-bold">
                  {inspectingSession.workoutNameSnapshot}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {t.diary.inspectModalDesc}
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-0.5">
                {(inspectingSession.activeCaloriesKcal ||
                  inspectingSession.avgHeartRateBpm ||
                  (inspectingSession.heartRateSamples &&
                    inspectingSession.heartRateSamples.length > 0)) && (
                  <div className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-display flex items-center gap-1.5 text-xs font-bold text-destructive">
                        <Heart className="h-3.5 w-3.5 fill-destructive text-destructive" />
                        {t.diary.heartRateCurveTitle}
                      </span>
                      <div className="tabular-nums flex flex-wrap items-center gap-2 text-xs">
                        {typeof inspectingSession.activeCaloriesKcal === 'number' && (
                          <span className="rounded-md bg-warning/15 px-2 py-0.5 font-bold text-warning">
                            {Math.round(inspectingSession.activeCaloriesKcal)} kcal
                          </span>
                        )}
                        {typeof inspectingSession.avgHeartRateBpm === 'number' && (
                          <span className="rounded-md bg-destructive/15 px-2 py-0.5 font-bold text-destructive">
                            {t.diary.avgHeartRate}: {inspectingSession.avgHeartRateBpm} bpm
                          </span>
                        )}
                        {typeof inspectingSession.maxHeartRateBpm === 'number' && (
                          <span className="rounded-md bg-destructive/15 px-2 py-0.5 font-bold text-destructive">
                            {t.diary.maxHeartRate}: {inspectingSession.maxHeartRateBpm} bpm
                          </span>
                        )}
                      </div>
                    </div>

                    {inspectingSession.heartRateSamples &&
                      inspectingSession.heartRateSamples.length > 1 && (
                        <div className="h-36 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                              data={inspectingSession.heartRateSamples.map((pt) => ({
                                minLabel: `${Math.floor(pt.offsetSec / 60)}:${String(pt.offsetSec % 60).padStart(2, '0')}`,
                                bpm: pt.bpm,
                              }))}
                              margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                            >
                              <defs>
                                <linearGradient id="hrCurveGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop
                                    offset="0%"
                                    stopColor="var(--destructive)"
                                    stopOpacity={0.55}
                                  />
                                  <stop
                                    offset="100%"
                                    stopColor="var(--destructive)"
                                    stopOpacity={0.05}
                                  />
                                </linearGradient>
                              </defs>
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="rgba(148,163,184,0.15)"
                              />
                              <XAxis
                                dataKey="minLabel"
                                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis
                                domain={['dataMin - 10', 'dataMax + 10']}
                                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <Area
                                type="monotone"
                                dataKey="bpm"
                                stroke="var(--destructive)"
                                strokeWidth={2}
                                fill="url(#hrCurveGrad)"
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                  </div>
                )}

                {inspectingSession.exercises.map((ex, exIdx) => (
                  <div
                    key={ex.clientExerciseId}
                    className="bg-secondary/30 min-w-0 space-y-2 rounded-2xl border p-3.5 sm:p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-display min-w-0 text-sm font-bold">
                        {exIdx + 1}. {ex.exerciseNameSnapshot}
                      </span>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {muscleLabel(ex.primaryMuscleSnapshot)}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {ex.sets.map((set, sIdx) => (
                        <div
                          key={set.clientSetId}
                          data-set-type={set.setType}
                          className="bg-background flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs"
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <SetTypeBadge
                              size="sm"
                              setType={set.setType}
                              label={getSetBadgeLabels(ex.sets)[sIdx] ?? String(sIdx + 1)}
                              completed={set.completed}
                            />
                            <span
                              className={`tabular-nums shrink-0 font-bold ${SET_TYPE_TEXT_CLASS[set.setType]}`}
                            >
                              {set.setType === SetType.WORKING
                                ? `${t.common.set} ${getSetBadgeLabels(ex.sets)[sIdx]}`
                                : setTypeLabel(set.setType)}
                            </span>
                            {(set.peakHeartRateBpm || set.restEndHeartRateBpm) && (
                              <span className="tabular-nums inline-flex items-center gap-1 rounded-md bg-destructive/15 px-1.5 py-0.5 text-xs font-semibold text-destructive">
                                <Heart className="h-2.5 w-2.5 fill-destructive" />
                                {set.peakHeartRateBpm
                                  ? `${set.peakHeartRateBpm} bpm peak`
                                  : `${set.avgHeartRateBpm ?? '-'} bpm`}
                                {set.restEndHeartRateBpm
                                  ? ` · ${set.restEndHeartRateBpm} bpm recovery`
                                  : ''}
                              </span>
                            )}
                          </div>
                          <div className="ml-auto flex shrink-0 items-center gap-2">
                            <Label className="text-muted-foreground text-xs">{weightUnit}</Label>
                            <NumberInput
                              allowNull
                              step="0.5"
                              min={0}
                              value={set.weight}
                              onValueChange={(val) => {
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
                              className="bg-secondary tabular-nums h-8 w-16 px-2 text-center text-xs sm:h-7"
                            />
                            <Label className="text-muted-foreground text-xs">{t.common.reps}</Label>
                            <NumberInput
                              allowNull
                              min={0}
                              value={set.reps}
                              onValueChange={(val) => {
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
                              className="bg-secondary tabular-nums h-8 w-14 px-2 text-center text-xs sm:h-7"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <DialogFooter className="shrink-0 border-t pt-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setInspectingSession(null)}
                >
                  {t.common.cancel}
                </Button>
                <Button
                  type="button"
                  onClick={async () => {
                    await updateHistoricalSession(inspectingSession);
                    setInspectingSession(null);
                  }}
                >
                  <Check className="h-4 w-4" /> {t.diary.saveCorrectionsBtn}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDestructiveDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        testId="confirm-delete-session"
        title={t.diary.deleteWorkoutTitle}
        description={format(t.diary.deleteWorkoutDesc, {
          name: pendingDelete?.workoutNameSnapshot ?? '',
        })}
        confirmLabel={t.diary.deleteWorkoutBtn}
        onConfirm={async () => {
          if (pendingDelete) await deleteHistoricalSession(pendingDelete.clientSessionId);
        }}
      />
    </div>
  );
}
