'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Play,
  Pause,
  Check,
  Plus,
  SkipForward,
  ArrowRightLeft,
  ArrowUp,
  ArrowDown,
  Trash2,
  Timer,
  RotateCcw,
  CheckCircle2,
  Dumbbell,
  Trophy,
  AlertTriangle,
  Zap,
  Search,
  X,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@luki-fitti/ui/components/ui/alert-dialog';
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
import { Input } from '@luki-fitti/ui/components/ui/input';
import { Label } from '@luki-fitti/ui/components/ui/label';
import { NativeSelect } from '@luki-fitti/ui/components/ui/native-select';
import { Progress } from '@luki-fitti/ui/components/ui/progress';
import { useGym } from '@/providers/gym/gym-context';
import { useLocale } from '@/providers/i18n/locale-context';
import { computeRemainingRestSeconds } from '@/lib/offline/offline-store';
import {
  computeExerciseProgression,
  formatCompactDelta,
  formatDateTime,
} from '@luki-fitti/common/utils/client';
import { filterExercisesByQuery } from './exercise-picker';
import { ExerciseVisual } from './exercise-visual';
import { NumberInput } from './number-input';
import {
  ExerciseType,
  MuscleGroup,
  SessionExerciseOrigin,
  SessionExerciseStatus,
  SessionStatus,
  SetType,
} from '@luki-fitti/common/enums';
import type { WorkoutSessionDto } from '@luki-fitti/common/schemas';

interface ActiveSessionViewProps {
  onNavigateToDiary: () => void;
  onNavigateToWorkouts: () => void;
}

export function ActiveSessionView({
  onNavigateToDiary,
  onNavigateToWorkouts,
}: ActiveSessionViewProps) {
  const {
    catalog,
    activeSession,
    historySessions,
    updateSet,
    toggleCompleteSet,
    addSetToExercise,
    removeSetFromExercise,
    skipExercise,
    substituteExercise,
    addExerciseToSession,
    removeExerciseFromSession,
    reorderExercise,
    startRestTimer,
    pauseRestTimer,
    resumeRestTimer,
    adjustRestTimer,
    skipRestTimer,
    pauseSession,
    resumeSession,
    finishSession,
    abandonSession,
  } = useGym();
  const { t, format, muscleLabel, equipmentLabel, setTypeLabel } = useLocale();

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [selectedExerciseIdx, setSelectedExerciseIdx] = useState<number>(0);
  const [showSubstituteFor, setShowSubstituteFor] = useState<string | null>(null);
  const [substituteSearch, setSubstituteSearch] = useState('');
  const [showAddExerciseModal, setShowAddExerciseModal] = useState(false);
  const [addExerciseSearch, setAddExerciseSearch] = useState('');
  const [addExerciseMuscle, setAddExerciseMuscle] = useState<MuscleGroup | 'ALL'>('ALL');
  const [sessionNotes, setSessionNotes] = useState('');
  const [completedSummary, setCompletedSummary] = useState<WorkoutSessionDto | null>(null);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!activeSession && !completedSummary) {
      onNavigateToWorkouts();
    }
  }, [activeSession, completedSummary, onNavigateToWorkouts]);

  const filteredAddExercises = useMemo(
    () => filterExercisesByQuery(catalog, addExerciseSearch, addExerciseMuscle),
    [catalog, addExerciseSearch, addExerciseMuscle],
  );

  if (completedSummary) {
    return (
      <div className="mx-auto max-w-lg space-y-6 py-8 text-center">
        <div className="bg-primary/15 text-primary mx-auto flex h-16 w-16 items-center justify-center rounded-full">
          <Trophy className="h-8 w-8" />
        </div>
        <div>
          <Badge variant="default" className="rounded-full px-3 py-1 text-xs uppercase">
            {t.session.savedQueuedBadge}
          </Badge>
          <h1 className="font-display mt-3 text-3xl font-bold">
            {format(t.session.completeTitle, { name: completedSummary.workoutNameSnapshot })}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{t.session.completeSub}</p>
        </div>

        <Card className="grid grid-cols-3 gap-3 rounded-3xl p-5">
          <div>
            <p className="text-muted-foreground text-xs">{t.session.durationLabel}</p>
            <p className="font-mono-tabular mt-1 text-xl font-bold">
              {Math.max(1, Math.round(completedSummary.activeDurationSeconds / 60))}m
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">{t.session.completedSetsLabel}</p>
            <p className="font-mono-tabular text-primary mt-1 text-xl font-bold">
              {completedSummary.totalSetsCompleted}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">
              {completedSummary.totalStretchSeconds > 0 && completedSummary.totalVolumeKg === 0
                ? t.session.stretchTimeLabel
                : t.session.totalVolumeLabel}
            </p>
            <p className="font-mono-tabular mt-1 text-xl font-bold">
              {completedSummary.totalStretchSeconds > 0 && completedSummary.totalVolumeKg === 0
                ? `${Math.round(completedSummary.totalStretchSeconds / 60)}m`
                : `${completedSummary.totalVolumeKg.toLocaleString()} kg`}
            </p>
          </div>
        </Card>

        <div className="flex justify-center gap-3">
          <Button
            type="button"
            size="lg"
            onClick={() => {
              setCompletedSummary(null);
              onNavigateToDiary();
            }}
            className="text-sm shadow-sm"
          >
            {t.session.viewInDiaryBtn}
          </Button>
        </div>
      </div>
    );
  }

  if (!activeSession) {
    return null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Active Session HUD
  // ───────────────────────────────────────────────────────────────────────────
  const elapsedSeconds =
    activeSession.status === SessionStatus.PAUSED
      ? activeSession.activeDurationSeconds
      : Math.max(0, Math.floor((nowMs - Date.parse(activeSession.startedAt)) / 1000));

  const formatTimer = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const remSec = sec % 60;
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;
  };

  const completedExercisesCount = activeSession.exercises.filter(
    (e) => e.status === SessionExerciseStatus.COMPLETED,
  ).length;
  const skippedExercisesCount = activeSession.exercises.filter(
    (e) => e.status === SessionExerciseStatus.SKIPPED,
  ).length;
  const remainingExercisesCount = Math.max(
    0,
    activeSession.exercises.length - completedExercisesCount - skippedExercisesCount,
  );

  const totalSetsPlanned = activeSession.exercises.reduce((acc, e) => acc + e.sets.length, 0);
  const progressPct =
    totalSetsPlanned > 0
      ? Math.min(100, Math.round((activeSession.totalSetsCompleted / totalSetsPlanned) * 100))
      : 0;

  const safeIdx = Math.min(
    Math.max(0, selectedExerciseIdx),
    Math.max(0, activeSession.exercises.length - 1),
  );
  const currentExercise = activeSession.exercises[safeIdx] ?? null;
  const nextExercise =
    activeSession.exercises
      .slice(safeIdx + 1)
      .find(
        (e) =>
          e.status !== SessionExerciseStatus.COMPLETED &&
          e.status !== SessionExerciseStatus.SKIPPED,
      ) ?? null;

  const restInfo = computeRemainingRestSeconds(activeSession, nowMs);

  const currentCatalogExercise = currentExercise
    ? (catalog.find((c) => c.id === currentExercise.exerciseId) ?? null)
    : null;

  const progressionInsight = currentExercise
    ? computeExerciseProgression({
        exerciseId: currentExercise.exerciseId,
        exerciseName: currentExercise.exerciseNameSnapshot,
        historySessions,
        catalogExercise: currentCatalogExercise,
        plannedSets: currentExercise.plannedSets,
        targetRepsMin: currentExercise.targetRepsMin,
        targetRepsMax: currentExercise.targetRepsMax,
        targetWeight: currentExercise.targetWeight,
        weightUnit: activeSession.weightUnit,
        currentSets: currentExercise.sets,
      })
    : null;

  let workingSetRenderCounter = 0;

  return (
    <div className="space-y-5 pb-12">
      {/* Top Telemetry Banner */}
      <Card className="border-primary/30 relative overflow-hidden rounded-3xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="solid" className="rounded-full px-2.5 py-0.5 text-[11px] uppercase">
                {activeSession.status === SessionStatus.PAUSED
                  ? t.session.pausedBadge
                  : t.session.liveSessionBadge}
              </Badge>
              <span className="text-muted-foreground font-mono-tabular text-xs">
                {format(t.session.startedAt, { date: formatDateTime(activeSession.startedAt) })}
              </span>
            </div>
            <h1 className="font-display mt-1.5 text-xl font-bold sm:text-2xl">
              {activeSession.workoutNameSnapshot}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-secondary/80 rounded-2xl px-3.5 py-2 text-right">
              <p className="text-muted-foreground text-[10px] font-bold uppercase">
                {t.session.elapsedLabel}
              </p>
              <p className="font-mono-tabular text-primary text-lg font-extrabold">
                {formatTimer(elapsedSeconds)}
              </p>
            </div>

            {activeSession.status === SessionStatus.PAUSED ? (
              <Button
                type="button"
                size="lg"
                onClick={() => void resumeSession()}
                className="px-3.5"
              >
                <Play className="h-4 w-4 fill-current" /> {t.session.resumeBtn}
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => void pauseSession()}
                className="px-3.5 font-semibold"
              >
                <Pause className="h-4 w-4" /> {t.session.pauseBtn}
              </Button>
            )}
          </div>
        </div>

        {/* Workout Progress Bar & Overview Metrics */}
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold">
              {t.session.progressLabel} <strong className="text-primary">{progressPct}%</strong>{' '}
              {format(t.session.setsProgress, {
                done: activeSession.totalSetsCompleted,
                total: totalSetsPlanned,
              })}
            </span>
            <div className="text-muted-foreground font-mono-tabular flex items-center gap-3">
              <span>{format(t.session.doneCount, { count: completedExercisesCount })}</span>
              <span>•</span>
              <span>{format(t.session.leftCount, { count: remainingExercisesCount })}</span>
              <span>•</span>
              <span>
                {format(t.session.volCount, {
                  volume: activeSession.totalVolumeKg.toLocaleString(),
                })}
              </span>
            </div>
          </div>
          <Progress value={progressPct} className="bg-secondary h-2.5" />
        </div>

        {/* Current vs Next Planned Exercise Indicator */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
          <div>
            <span className="text-muted-foreground">{t.session.currentLabel}</span>
            <strong className="text-foreground">
              {currentExercise?.exerciseNameSnapshot ?? t.session.noneLabel}
            </strong>
          </div>
          <div>
            <span className="text-muted-foreground">{t.session.nextUpLabel}</span>
            <strong className="text-accent">
              {nextExercise ? nextExercise.exerciseNameSnapshot : t.session.finalExercise}
            </strong>
          </div>
        </div>
      </Card>

      {/* Persistent Timestamp Rest Timer Bar */}
      <Card
        className={`p-4 transition ${
          restInfo.isRunning || restInfo.isPaused
            ? 'bg-accent/10 border-accent/50'
            : 'bg-card border-border'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                restInfo.isRunning
                  ? 'bg-accent text-accent-foreground'
                  : 'bg-secondary text-muted-foreground'
              }`}
            >
              <Timer className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold tracking-wider uppercase">
                {restInfo.isRunning
                  ? t.session.restTimerActive
                  : restInfo.isPaused
                    ? t.session.restTimerPaused
                    : t.session.restTimerReady}
              </p>
              <p className="font-mono-tabular text-2xl font-extrabold">
                {formatTimer(restInfo.remainingSeconds)}
                {restInfo.totalSeconds > 0 && (
                  <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                    / {formatTimer(restInfo.totalSeconds)}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void startRestTimer(60)}
            >
              60s
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void startRestTimer(90)}
            >
              90s
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void startRestTimer(150)}
            >
              2m30s
            </Button>

            {(restInfo.isRunning || restInfo.isPaused) && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void adjustRestTimer(-15)}
                  className="font-bold"
                >
                  -15s
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void adjustRestTimer(15)}
                  className="font-bold"
                >
                  +15s
                </Button>
                {restInfo.isPaused ? (
                  <Button
                    type="button"
                    variant="accent"
                    size="sm"
                    onClick={() => void resumeRestTimer()}
                  >
                    {t.session.resumeBtn}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void pauseRestTimer()}
                  >
                    {t.session.pauseBtn}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() =>
                    void startRestTimer(
                      activeSession.restTimerDurationSec ?? currentExercise?.restSeconds ?? 90,
                    )
                  }
                  title={t.session.resetRestTimerTitle}
                  className="size-8"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => void skipRestTimer()}
                >
                  {t.session.skipRestBtn}
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Horizontal Exercise Selector Pills (Return to any exercise or jump ahead) */}
      <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto pb-1">
        {activeSession.exercises.map((ex, idx) => {
          const isCurrent = idx === safeIdx;
          const doneSets = ex.sets.filter((s) => s.completed).length;
          return (
            <Button
              key={ex.clientExerciseId}
              type="button"
              variant="outline"
              onClick={() => setSelectedExerciseIdx(idx)}
              className={`h-auto shrink-0 rounded-2xl px-3.5 py-2.5 text-left text-xs transition ${
                isCurrent
                  ? 'border-primary bg-primary/15 text-foreground font-bold'
                  : ex.status === SessionExerciseStatus.COMPLETED
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : ex.status === SessionExerciseStatus.SKIPPED
                      ? 'bg-secondary/40 text-muted-foreground line-through opacity-60'
                      : 'bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              <span
                className={`font-mono-tabular flex h-6 w-6 items-center justify-center rounded-lg text-xs font-black ${
                  isCurrent
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : ex.status === SessionExerciseStatus.COMPLETED
                      ? 'bg-emerald-500/25 text-emerald-300'
                      : 'bg-secondary text-foreground/80'
                }`}
              >
                {idx + 1}
              </span>
              <span className="max-w-[140px] truncate">{ex.exerciseNameSnapshot}</span>
              <span className="font-mono-tabular rounded-md bg-black/30 px-1.5 py-0.5 text-[10px]">
                {doneSets}/{ex.sets.length}
              </span>
            </Button>
          );
        })}

        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setAddExerciseSearch('');
            setAddExerciseMuscle('ALL');
            setShowAddExerciseModal(true);
          }}
          className="hover:border-primary h-auto shrink-0 rounded-2xl border px-3.5 py-2.5 text-xs font-bold"
        >
          <Plus className="h-3.5 w-3.5" /> {t.session.addExerciseBtn}
        </Button>
      </div>

      {/* Active Exercise Card & Fast Set Entry */}
      {currentExercise ? (
        <Card className="border-primary/25 from-card via-card to-secondary/20 relative space-y-5 overflow-hidden rounded-3xl border bg-gradient-to-b p-4 shadow-lg sm:p-6">
          {/* Card Header: Upper-Left Number Badge + Title + Upper-Right Red Trash Button */}
          <div className="flex flex-col gap-4 border-b border-white/5 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3.5">
                {/* Upper-Left Corner Exercise Number Badge */}
                <div className="border-primary/40 from-primary/25 to-accent/15 text-primary flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl border bg-gradient-to-br shadow-inner">
                  <span className="text-primary/70 text-[9px] font-extrabold uppercase leading-none tracking-wider">
                    {t.session.exShort}
                  </span>
                  <span className="font-mono-tabular text-lg font-black leading-tight">
                    {safeIdx + 1}
                  </span>
                </div>

                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="default" className="text-[11px] uppercase tracking-wider">
                      {muscleLabel(currentExercise.primaryMuscleSnapshot)}
                    </Badge>
                    <span className="text-muted-foreground font-mono-tabular text-xs font-semibold">
                      {format(t.session.ofExercises, { count: activeSession.exercises.length })}
                    </span>
                    {currentExercise.restSeconds === 0 && (
                      <Badge variant="accent" className="text-[11px] font-bold">
                        <Zap className="h-3 w-3" /> {t.session.supersetZeroRest}
                      </Badge>
                    )}
                    {safeIdx > 0 &&
                      activeSession.exercises[safeIdx - 1]?.restSeconds === 0 && (
                        <Badge variant="accent" className="text-[11px] font-bold">
                          <Zap className="h-3 w-3" /> {t.session.supersetPartner}
                        </Badge>
                      )}
                    {currentExercise.origin === SessionExerciseOrigin.SUBSTITUTED && (
                      <Badge variant="warning" className="text-[11px]">
                        {format(t.session.replacedBadge, {
                          name: currentExercise.replacedExerciseName ?? '',
                        })}
                      </Badge>
                    )}
                    {currentExercise.origin === SessionExerciseOrigin.ADDED && (
                      <Badge variant="accent" className="text-[11px]">
                        {t.session.addedUnplannedBadge}
                      </Badge>
                    )}
                    {currentExercise.status === SessionExerciseStatus.SKIPPED && (
                      <Badge variant="destructive" className="text-[11px]">
                        {t.session.skippedBadge}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <ExerciseVisual
                      exercise={{
                        id: currentExercise.exerciseId,
                        slug: currentCatalogExercise?.slug,
                        name: currentExercise.exerciseNameSnapshot,
                        primaryMuscleGroup: currentExercise.primaryMuscleSnapshot,
                        media: currentCatalogExercise?.media,
                      }}
                      variant="thumbnail"
                      className="h-12 w-16"
                    />
                    <h2 className="font-display text-xl font-extrabold tracking-tight sm:text-3xl">
                      {currentExercise.exerciseNameSnapshot}
                    </h2>
                  </div>
                </div>
              </div>

              {/* Upper-Right Corner Red Trash Button */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => void removeExerciseFromSession(currentExercise.clientExerciseId)}
                aria-label="Remove exercise from session"
                title={t.session.removeFromSessionTitle}
                className="border-destructive/30 bg-destructive/15 text-destructive hover:bg-destructive hover:text-destructive-foreground size-9 shrink-0 rounded-xl border transition"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Structured Target & Benchmark Strip */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="bg-secondary/40 rounded-2xl border border-white/5 px-3 py-2">
                <span className="text-muted-foreground block text-[10px] font-semibold uppercase tracking-wider">
                  {t.session.targetSetsRepsLabel}
                </span>
                <span className="font-mono-tabular text-foreground mt-0.5 block text-sm font-extrabold">
                  {currentExercise.plannedSets} ×{' '}
                  {currentExercise.targetRepsMin &&
                  currentExercise.targetRepsMax &&
                  currentExercise.targetRepsMin !== currentExercise.targetRepsMax
                    ? `${currentExercise.targetRepsMin}–${currentExercise.targetRepsMax}`
                    : (currentExercise.targetRepsMin ?? 10)}
                </span>
              </div>

              <div className="bg-secondary/40 rounded-2xl border border-white/5 px-3 py-2">
                <span className="text-muted-foreground block text-[10px] font-semibold uppercase tracking-wider">
                  {t.session.restIntervalLabel}
                </span>
                <span className="font-mono-tabular text-foreground mt-0.5 block text-sm font-extrabold">
                  {currentExercise.restSeconds}s
                  {currentExercise.targetWeight
                    ? ` • ${currentExercise.targetWeight}${activeSession.weightUnit.toLowerCase()}`
                    : ''}
                </span>
              </div>

              <div className="bg-secondary/40 col-span-2 rounded-2xl border border-white/5 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">
                    {progressionInsight?.lastSession
                      ? format(t.session.lastSessionFrom, {
                          name: progressionInsight.lastSession.workoutName,
                        })
                      : t.session.previousBenchmark}
                  </span>
                  {progressionInsight && progressionInsight.ewma1RM > 0 && (
                    <span className="text-primary font-mono-tabular text-[10px] font-bold">
                      e1RM {progressionInsight.ewma1RM}
                      {activeSession.weightUnit.toLowerCase()}
                    </span>
                  )}
                </div>
                {progressionInsight?.lastSession ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {progressionInsight.lastSession.workingSets.slice(0, 4).map((ws, i) => (
                      <Badge
                        key={i}
                        variant="secondary"
                        className="font-mono-tabular px-1.5 py-0.5 text-[10px] font-semibold"
                      >
                        {ws.weightNormalized}
                        {activeSession.weightUnit.toLowerCase()} × {ws.reps}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground mt-0.5 block text-xs">
                    {t.session.firstLoggedSession}
                  </span>
                )}
              </div>
            </div>

            {currentExercise.restSeconds === 0 && activeSession.exercises[safeIdx + 1] && (
              <div className="border-accent/40 bg-accent/15 text-accent flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-bold">
                <span className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 shrink-0" />
                  {format(t.session.supersetPairedBanner, {
                    index: safeIdx + 2,
                    name: activeSession.exercises[safeIdx + 1]?.exerciseNameSnapshot ?? '',
                  })}
                </span>
                <Button
                  type="button"
                  variant="accent"
                  size="xs"
                  onClick={() => setSelectedExerciseIdx(safeIdx + 1)}
                >
                  {t.session.switchToPartnerBtn}
                </Button>
              </div>
            )}
            {safeIdx > 0 && activeSession.exercises[safeIdx - 1]?.restSeconds === 0 && (
              <div className="border-accent/40 bg-accent/10 text-accent flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-bold">
                <span className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 shrink-0" />
                  {format(t.session.supersetPartnerOfBanner, {
                    index: safeIdx,
                    name: activeSession.exercises[safeIdx - 1]?.exerciseNameSnapshot ?? '',
                  })}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={() => setSelectedExerciseIdx(safeIdx - 1)}
                >
                  {format(t.session.backToExerciseBtn, { index: safeIdx })}
                </Button>
              </div>
            )}

            {currentExercise.notes && (
              <p className="border-accent/30 bg-accent/10 text-accent rounded-xl border px-3 py-1.5 text-xs font-medium">
                {format(t.session.notePrefix, { note: currentExercise.notes })}
              </p>
            )}

            {/* Exercise Action Bar: Swap, Skip, Reorder */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSubstituteSearch('');
                    setShowSubstituteFor(currentExercise.clientExerciseId);
                  }}
                  className="h-8 rounded-xl text-xs font-semibold"
                >
                  <ArrowRightLeft className="text-primary h-3.5 w-3.5" />
                  {t.session.swapAlternativeBtn}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void skipExercise(currentExercise.clientExerciseId)}
                  className="h-8 rounded-xl text-xs font-semibold"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  {currentExercise.status === SessionExerciseStatus.SKIPPED
                    ? t.session.unskipBtn
                    : t.session.skipBtn}
                </Button>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => void reorderExercise(currentExercise.clientExerciseId, 'UP')}
                  disabled={safeIdx === 0}
                  title={t.session.moveEarlierTitle}
                  className="size-8 rounded-xl"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => void reorderExercise(currentExercise.clientExerciseId, 'DOWN')}
                  disabled={safeIdx === activeSession.exercises.length - 1}
                  title={t.session.moveLaterTitle}
                  className="size-8 rounded-xl"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Sets Table — Ergonomic One-Handed Gym Controls */}
          <div className="space-y-2.5 pt-2">
            {currentExercise.sets.map((set, sIdx) => {
              const isStretchSet =
                currentExercise.exerciseTypeSnapshot === ExerciseType.STRETCHING ||
                currentExercise.exerciseTypeSnapshot === ExerciseType.MOBILITY ||
                set.setType === SetType.STRETCH;
              const isWorkingType =
                !isStretchSet && set.setType !== SetType.WARMUP && set.setType !== SetType.STRETCH;

              const setSuggestion =
                isWorkingType && progressionInsight
                  ? (progressionInsight.setSuggestions[workingSetRenderCounter++] ??
                    progressionInsight.setSuggestions[
                      progressionInsight.setSuggestions.length - 1
                    ] ??
                    null)
                  : null;

              const dynamicWeightDelta =
                setSuggestion?.suggestedWeight !== null &&
                setSuggestion?.suggestedWeight !== undefined &&
                (set.weight ?? setSuggestion.lastWeight ?? 0) > 0
                  ? Math.round(
                      (setSuggestion.suggestedWeight -
                        (set.weight ?? setSuggestion.lastWeight ?? 0)) *
                        100,
                    ) / 100
                  : 0;

              const dynamicRepsDelta =
                setSuggestion?.suggestedReps !== null &&
                setSuggestion?.suggestedReps !== undefined &&
                (set.reps ?? setSuggestion.lastReps ?? 0) > 0
                  ? setSuggestion.suggestedReps - (set.reps ?? setSuggestion.lastReps ?? 0)
                  : 0;

              const weightBadgeLabel = !set.completed
                ? formatCompactDelta(dynamicWeightDelta)
                : null;
              const repsBadgeLabel = !set.completed ? formatCompactDelta(dynamicRepsDelta) : null;

              const intensityLevel =
                set.rpe === null || set.rpe === undefined
                  ? 0
                  : set.rpe <= 7.5
                    ? 1
                    : set.rpe < 9.5
                      ? 2
                      : 3;

              const intensityMeta =
                intensityLevel === 1
                  ? {
                      label: t.session.intensityLight,
                      hint: t.session.intensityLightHint,
                      nextRpe: 8,
                      containerClass: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
                      activeBarClass: 'bg-emerald-400',
                    }
                  : intensityLevel === 2
                    ? {
                        label: t.session.intensitySweetSpot,
                        hint: t.session.intensitySweetSpotHint,
                        nextRpe: 9.5,
                        containerClass: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
                        activeBarClass: 'bg-amber-400',
                      }
                    : intensityLevel === 3
                      ? {
                          label: t.session.intensityLimit,
                          hint: t.session.intensityLimitHint,
                          nextRpe: null,
                          containerClass: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
                          activeBarClass: 'bg-rose-400',
                        }
                      : {
                          label: t.session.intensityEffort,
                          hint: t.session.intensityEffortHint,
                          nextRpe: 7,
                          containerClass:
                            'border-border bg-background text-muted-foreground hover:text-foreground',
                          activeBarClass: 'bg-muted-foreground/30',
                        };

              return (
                <div
                  key={set.clientSetId}
                  data-testid={`session-set-row-${sIdx + 1}`}
                  className={`flex flex-col gap-2.5 rounded-2xl border p-3 transition sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2 ${
                    set.completed
                      ? 'border-primary/50 bg-primary/10'
                      : 'bg-secondary/30 border-border'
                  }`}
                >
                  {/* Set Number, Set Type Selector, and Mobile-Right Intensity + Delete */}
                  <div className="flex items-center justify-between gap-2 sm:justify-start">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-mono-tabular flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-sm font-black transition ${
                          set.completed
                            ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                            : set.setType === SetType.WARMUP
                              ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                              : set.setType === SetType.STRETCH
                                ? 'border-accent/40 bg-accent/15 text-accent'
                                : 'border-primary/35 bg-primary/15 text-primary'
                        }`}
                      >
                        {sIdx + 1}
                      </span>
                      <NativeSelect
                        aria-label={`Set ${sIdx + 1} type`}
                        value={set.setType}
                        onChange={(e) =>
                          void updateSet(currentExercise.clientExerciseId, set.clientSetId, {
                            setType: e.target.value as SetType,
                          })
                        }
                        className={`h-8 rounded-lg px-2 py-1 pr-6 text-[11px] font-bold uppercase ${
                          set.setType === SetType.WARMUP
                            ? 'bg-amber-500/20 text-amber-300'
                            : set.setType === SetType.STRETCH
                              ? 'bg-accent/20 text-accent'
                              : 'bg-background text-foreground'
                        }`}
                      >
                        <option value={SetType.WARMUP}>{setTypeLabel(SetType.WARMUP)}</option>
                        <option value={SetType.WORKING}>{setTypeLabel(SetType.WORKING)}</option>
                        <option value={SetType.DROPSET}>{setTypeLabel(SetType.DROPSET)}</option>
                        <option value={SetType.FAILURE}>{setTypeLabel(SetType.FAILURE)}</option>
                        <option value={SetType.STRETCH}>{setTypeLabel(SetType.STRETCH)}</option>
                      </NativeSelect>
                    </div>

                    {/* Mobile Top-Right: 3-Bar Intensity Meter + Delete Set */}
                    <div className="flex items-center gap-1.5 sm:hidden">
                      <button
                        type="button"
                        aria-label={`Set ${sIdx + 1} intensity: ${intensityMeta.label}`}
                        title={intensityMeta.hint}
                        onClick={() =>
                          void updateSet(currentExercise.clientExerciseId, set.clientSetId, {
                            rpe: intensityMeta.nextRpe,
                          })
                        }
                        className={`flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-bold transition active:scale-95 ${intensityMeta.containerClass}`}
                      >
                        <span className="flex items-end gap-0.5" aria-hidden="true">
                          {[1, 2, 3].map((barIdx) => {
                            const barHeight =
                              barIdx === 1 ? 'h-2' : barIdx === 2 ? 'h-3' : 'h-4';
                            const isFilled = barIdx <= intensityLevel;
                            return (
                              <span
                                key={barIdx}
                                className={`w-1 rounded-full transition-colors ${barHeight} ${
                                  isFilled
                                    ? intensityMeta.activeBarClass
                                    : 'bg-muted-foreground/25'
                                }`}
                              />
                            );
                          })}
                        </span>
                        <span>{intensityMeta.label}</span>
                      </button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          void removeSetFromExercise(
                            currentExercise.clientExerciseId,
                            set.clientSetId,
                          )
                        }
                        aria-label={`Delete set ${sIdx + 1}`}
                        className="text-destructive/80 hover:bg-destructive/15 hover:text-destructive size-8 rounded-xl"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Weight / Duration & Reps Steppers */}
                  <div className="flex flex-wrap items-center gap-2">
                    {!isStretchSet ? (
                      <div className="flex items-center gap-1">
                        <div className="bg-background flex h-10 items-center rounded-xl border px-1 sm:h-auto sm:px-1.5 sm:py-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() =>
                              void updateSet(currentExercise.clientExerciseId, set.clientSetId, {
                                weight: Math.max(0, (set.weight ?? 0) - 2.5),
                              })
                            }
                            className="text-muted-foreground hover:text-foreground h-8 px-2 font-bold sm:h-6"
                          >
                            -2.5
                          </Button>
                          <NumberInput
                            variant="bare"
                            allowNull
                            step="0.5"
                            min={0}
                            aria-label={`Set ${sIdx + 1} weight`}
                            value={set.weight}
                            onValueChange={(val) =>
                              void updateSet(currentExercise.clientExerciseId, set.clientSetId, {
                                weight: val,
                              })
                            }
                            placeholder="0"
                            className="font-mono-tabular w-13 bg-transparent text-center text-sm font-bold outline-none sm:w-14"
                          />
                          <span className="text-muted-foreground text-[10px] font-semibold">
                            {set.weightUnit.toLowerCase()}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() =>
                              void updateSet(currentExercise.clientExerciseId, set.clientSetId, {
                                weight: (set.weight ?? 0) + 2.5,
                              })
                            }
                            className="text-primary h-8 px-2 font-bold sm:h-6"
                          >
                            +2.5
                          </Button>
                        </div>
                        {weightBadgeLabel &&
                          setSuggestion &&
                          setSuggestion.suggestedWeight !== null && (
                            <Badge
                              asChild
                              variant={dynamicWeightDelta > 0 ? 'success' : 'warning'}
                              className="font-mono-tabular cursor-pointer rounded-lg px-1.5 py-1 text-[11px] font-extrabold transition hover:scale-105"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  void updateSet(
                                    currentExercise.clientExerciseId,
                                    set.clientSetId,
                                    {
                                      weight: setSuggestion.suggestedWeight,
                                      ...(setSuggestion.suggestedReps !== null
                                        ? { reps: setSuggestion.suggestedReps }
                                        : {}),
                                    },
                                  )
                                }
                                aria-label={`Apply suggested weight ${weightBadgeLabel}`}
                                title={`${weightBadgeLabel} ${set.weightUnit.toLowerCase()}`}
                              >
                                {weightBadgeLabel}
                              </button>
                            </Badge>
                          )}
                      </div>
                    ) : (
                      <div className="bg-background flex h-10 items-center rounded-xl border px-2 py-1 sm:h-auto">
                        <NumberInput
                          variant="bare"
                          min={0}
                          fallbackValue={45}
                          aria-label={`Set ${sIdx + 1} duration seconds`}
                          value={set.durationSeconds ?? 45}
                          onValueChange={(val) =>
                            void updateSet(currentExercise.clientExerciseId, set.clientSetId, {
                              durationSeconds: val,
                            })
                          }
                          className="font-mono-tabular w-14 bg-transparent text-center text-sm font-bold outline-none"
                        />
                        <span className="text-muted-foreground text-xs">{t.common.sec}</span>
                      </div>
                    )}

                    {/* Reps Stepper */}
                    <div className="flex items-center gap-1">
                      <div className="bg-background flex h-10 items-center rounded-xl border px-1 sm:h-auto sm:px-1.5 sm:py-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() =>
                            void updateSet(currentExercise.clientExerciseId, set.clientSetId, {
                              reps: Math.max(0, (set.reps ?? 0) - 1),
                            })
                          }
                          className="text-muted-foreground hover:text-foreground h-8 px-2 font-bold sm:h-6"
                        >
                          -1
                        </Button>
                        <NumberInput
                          variant="bare"
                          allowNull
                          min={0}
                          aria-label={`Set ${sIdx + 1} reps`}
                          value={set.reps}
                          onValueChange={(val) =>
                            void updateSet(currentExercise.clientExerciseId, set.clientSetId, {
                              reps: val,
                            })
                          }
                          placeholder={t.common.reps}
                          className="font-mono-tabular w-11 bg-transparent text-center text-sm font-bold outline-none sm:w-12"
                        />
                        <span className="text-muted-foreground text-[10px] font-semibold">
                          {t.common.reps}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() =>
                            void updateSet(currentExercise.clientExerciseId, set.clientSetId, {
                              reps: (set.reps ?? 0) + 1,
                            })
                          }
                          className="text-primary h-8 px-2 font-bold sm:h-6"
                        >
                          +1
                        </Button>
                      </div>
                      {repsBadgeLabel && setSuggestion && setSuggestion.suggestedReps !== null && (
                        <Badge
                          asChild
                          variant={dynamicRepsDelta > 0 ? 'accent' : 'warning'}
                          className="font-mono-tabular cursor-pointer rounded-lg px-1.5 py-1 text-[11px] font-extrabold transition hover:scale-105"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              void updateSet(currentExercise.clientExerciseId, set.clientSetId, {
                                reps: setSuggestion.suggestedReps,
                              })
                            }
                            aria-label={`Apply suggested reps ${repsBadgeLabel}`}
                            title={`${repsBadgeLabel} reps`}
                          >
                            {repsBadgeLabel}
                          </button>
                        </Badge>
                      )}
                    </div>

                    {/* Desktop 3-Bar Intensity Meter */}
                    <button
                      type="button"
                      aria-label={`Set ${sIdx + 1} intensity: ${intensityMeta.label}`}
                      title={intensityMeta.hint}
                      onClick={() =>
                        void updateSet(currentExercise.clientExerciseId, set.clientSetId, {
                          rpe: intensityMeta.nextRpe,
                        })
                      }
                      className={`hidden h-9 items-center gap-2 rounded-xl border px-2.5 text-xs font-bold transition active:scale-95 sm:flex ${intensityMeta.containerClass}`}
                    >
                      <span className="flex items-end gap-0.5" aria-hidden="true">
                        {[1, 2, 3].map((barIdx) => {
                          const barHeight =
                            barIdx === 1 ? 'h-2' : barIdx === 2 ? 'h-3' : 'h-4';
                          const isFilled = barIdx <= intensityLevel;
                          return (
                            <span
                              key={barIdx}
                              className={`w-1 rounded-full transition-colors ${barHeight} ${
                                isFilled
                                  ? intensityMeta.activeBarClass
                                  : 'bg-muted-foreground/25'
                              }`}
                            />
                          );
                        })}
                      </span>
                      <span>{intensityMeta.label}</span>
                    </button>

                    {/* Mobile Inline Log Set Button (fills remaining space or full width) */}
                    <Button
                      type="button"
                      variant={set.completed ? 'default' : 'secondary'}
                      onClick={() =>
                        void toggleCompleteSet(currentExercise.clientExerciseId, set.clientSetId)
                      }
                      aria-label={set.completed ? 'Mark set incomplete' : 'Complete set'}
                      className={`h-10 min-w-[88px] flex-1 font-extrabold sm:hidden ${
                        !set.completed ? 'hover:bg-primary/20' : ''
                      }`}
                    >
                      <Check className="h-4 w-4 stroke-[3]" />
                      {set.completed ? t.session.doneSetBtn : t.session.logSetBtn}
                    </Button>
                  </div>

                  {/* Desktop Complete Set Large Tap Button & Delete Set */}
                  <div className="hidden items-center gap-1.5 sm:flex">
                    <Button
                      type="button"
                      variant={set.completed ? 'default' : 'secondary'}
                      onClick={() =>
                        void toggleCompleteSet(currentExercise.clientExerciseId, set.clientSetId)
                      }
                      aria-label={set.completed ? 'Mark set incomplete' : 'Complete set'}
                      className={`h-10 min-w-[96px] font-extrabold ${
                        !set.completed ? 'hover:bg-primary/20' : ''
                      }`}
                    >
                      <Check className="h-4 w-4 stroke-[3]" />
                      {set.completed ? t.session.doneSetBtn : t.session.logSetBtn}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        void removeSetFromExercise(
                          currentExercise.clientExerciseId,
                          set.clientSetId,
                        )
                      }
                      aria-label={`Delete set ${sIdx + 1}`}
                      className="text-destructive/80 hover:bg-destructive/15 hover:text-destructive size-8 rounded-xl"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Set Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  void addSetToExercise(currentExercise.clientExerciseId, SetType.WORKING)
                }
                className="font-bold"
              >
                <Plus className="h-3.5 w-3.5" /> {t.session.addWorkingSetBtn}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  void addSetToExercise(currentExercise.clientExerciseId, SetType.WARMUP)
                }
                className="bg-secondary/60 text-muted-foreground hover:text-foreground font-semibold"
              >
                {t.session.addWarmupSetBtn}
              </Button>
            </div>

            {safeIdx < activeSession.exercises.length - 1 && (
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => setSelectedExerciseIdx(safeIdx + 1)}
                className="h-auto p-0 text-xs font-bold"
              >
                {format(t.session.nextExerciseLink, {
                  name: activeSession.exercises[safeIdx + 1]?.exerciseNameSnapshot ?? '',
                })}
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <Card className="rounded-3xl p-8 text-center">
          <Dumbbell className="text-muted-foreground mx-auto mb-2 h-8 w-8" />
          <p className="font-display text-base font-bold">{t.session.noExercisesYet}</p>
          <div className="mt-3 flex justify-center">
            <Button type="button" onClick={() => setShowAddExerciseModal(true)}>
              {t.session.addFirstExerciseBtn}
            </Button>
          </div>
        </Card>
      )}

      {/* Session Notes & Finish / Abandon Footer */}
      <Card className="space-y-4 rounded-3xl p-5">
        <div className="space-y-1.5">
          <Label htmlFor="session-notes" className="text-xs font-semibold">
            {t.session.sessionNotesLabel}
          </Label>
          <Input
            id="session-notes"
            value={sessionNotes}
            onChange={(e) => setSessionNotes(e.target.value)}
            placeholder={t.session.sessionNotesPlaceholder}
            className="text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="destructive"
            size="lg"
            onClick={() => setShowAbandonConfirm(true)}
            className="bg-destructive/15 text-destructive hover:bg-destructive/25"
          >
            {t.session.abandonSessionBtn}
          </Button>

          <Button
            type="button"
            size="lg"
            onClick={async () => {
              const finished = await finishSession(sessionNotes || undefined);
              if (finished) setCompletedSummary(finished);
            }}
            className="text-sm shadow-sm"
          >
            <CheckCircle2 className="h-4 w-4" />
            {t.session.finishSaveWorkoutBtn}
          </Button>
        </div>
      </Card>

      {/* Substitute / Replace Exercise Modal */}
      <Dialog
        open={Boolean(showSubstituteFor && currentExercise)}
        onOpenChange={(open) => {
          if (!open) setShowSubstituteFor(null);
        }}
      >
        <DialogContent className="max-h-[88dvh] overflow-hidden p-4 sm:max-w-md sm:p-5">
          {currentExercise && (
            <div className="flex max-h-[calc(88dvh-2.5rem)] min-w-0 flex-col gap-3 overflow-hidden">
              <DialogHeader className="shrink-0">
                <DialogTitle className="font-display text-lg font-bold">
                  {format(t.session.replaceModalTitle, {
                    name: currentExercise.exerciseNameSnapshot,
                  })}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {t.session.replaceModalDesc}
                </DialogDescription>
              </DialogHeader>

              <div className="relative shrink-0">
                <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  type="search"
                  value={substituteSearch}
                  onChange={(e) => setSubstituteSearch(e.target.value)}
                  placeholder={t.picker.searchPlaceholder}
                  aria-label={t.picker.searchPlaceholder}
                  className="h-9 pr-8 pl-9 text-xs"
                />
                {substituteSearch && (
                  <button
                    type="button"
                    onClick={() => setSubstituteSearch('')}
                    aria-label={t.common.clear}
                    className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                {!substituteSearch.trim() && currentExercise.alternativeExerciseIds.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-primary text-xs font-bold uppercase">
                      {t.session.predefinedAlternatives}
                    </p>
                    {currentExercise.alternativeExerciseIds.map((altId) => {
                      const alt = catalog.find((c) => c.id === altId);
                      if (!alt) return null;
                      return (
                        <Button
                          key={alt.id}
                          type="button"
                          variant="outline"
                          onClick={async () => {
                            await substituteExercise(currentExercise.clientExerciseId, alt.id);
                            setShowSubstituteFor(null);
                          }}
                          className="bg-primary/15 border-primary/40 hover:bg-primary/25 flex h-auto w-full items-center justify-between rounded-2xl p-3.5 text-left text-xs font-bold"
                        >
                          <span>{alt.name}</span>
                          <span className="text-primary text-[11px]">{t.session.useBackupBtn}</span>
                        </Button>
                      );
                    })}
                  </div>
                )}

                <div className="space-y-2 pt-1">
                  <p className="text-muted-foreground text-xs font-bold uppercase">
                    {substituteSearch.trim()
                      ? t.session.allCatalogExercises
                      : format(t.session.sameMuscleGroup, {
                          muscle: muscleLabel(currentExercise.primaryMuscleSnapshot),
                        })}
                  </p>
                  {filterExercisesByQuery(
                    catalog.filter((c) => c.id !== currentExercise.exerciseId),
                    substituteSearch,
                    substituteSearch.trim() ? 'ALL' : currentExercise.primaryMuscleSnapshot,
                  ).map((alt) => (
                    <Button
                      key={alt.id}
                      type="button"
                      variant="secondary"
                      onClick={async () => {
                        await substituteExercise(currentExercise.clientExerciseId, alt.id);
                        setShowSubstituteFor(null);
                      }}
                      className="flex h-auto w-full items-center justify-between rounded-xl p-3 text-left text-xs font-medium"
                    >
                      <span>{alt.name}</span>
                      <span className="text-muted-foreground text-[11px]">
                        {equipmentLabel(alt.equipment)}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Unplanned Exercise Modal */}
      <Dialog open={showAddExerciseModal} onOpenChange={setShowAddExerciseModal}>
        <DialogContent className="max-h-[88dvh] overflow-hidden p-4 sm:max-w-md sm:p-5">
          <div className="flex max-h-[calc(88dvh-2.5rem)] min-w-0 flex-col gap-3 overflow-hidden">
            <DialogHeader className="shrink-0">
              <DialogTitle className="font-display text-lg font-bold">
                {t.session.addUnplannedTitle}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {t.session.addUnplannedDesc}
              </DialogDescription>
            </DialogHeader>

            <div className="relative shrink-0">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                type="search"
                value={addExerciseSearch}
                onChange={(e) => setAddExerciseSearch(e.target.value)}
                placeholder={t.picker.searchPlaceholder}
                aria-label={t.picker.searchPlaceholder}
                className="h-10 pr-8 pl-9 text-xs sm:h-9"
              />
              {addExerciseSearch && (
                <button
                  type="button"
                  onClick={() => setAddExerciseSearch('')}
                  aria-label={t.common.clear}
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 p-1"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="scrollbar-hide -mx-1 flex shrink-0 items-center gap-1.5 overflow-x-auto px-1 pb-0.5 sm:flex-wrap sm:overflow-visible">
              <Button
                type="button"
                variant={addExerciseMuscle === 'ALL' ? 'default' : 'secondary'}
                size="xs"
                onClick={() => setAddExerciseMuscle('ALL')}
                className="h-7 shrink-0 px-2.5 text-[11px]"
              >
                {t.picker.allMuscles}
              </Button>
              {Object.values(MuscleGroup).map((mg) => (
                <Button
                  key={mg}
                  type="button"
                  variant={addExerciseMuscle === mg ? 'default' : 'secondary'}
                  size="xs"
                  onClick={() => setAddExerciseMuscle(mg)}
                  className="h-7 shrink-0 px-2.5 text-[11px]"
                >
                  {muscleLabel(mg)}
                </Button>
              ))}
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {filteredAddExercises.map((ex) => (
                <Button
                  key={ex.id}
                  type="button"
                  variant="secondary"
                  onClick={async () => {
                    await addExerciseToSession(ex.id);
                    setSelectedExerciseIdx(activeSession.exercises.length);
                    setShowAddExerciseModal(false);
                  }}
                  className="flex h-auto w-full items-center justify-between rounded-xl p-3 text-left text-xs"
                >
                  <div>
                    <p className="font-bold">{ex.name}</p>
                    <p className="text-muted-foreground text-[11px] font-normal">
                      {muscleLabel(ex.primaryMuscleGroup)} • {equipmentLabel(ex.equipment)}
                    </p>
                  </div>
                  <span className="text-primary font-bold">{t.session.addShortBtn}</span>
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Abandon Session Confirmation */}
      <AlertDialog open={showAbandonConfirm} onOpenChange={setShowAbandonConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive font-display flex items-center gap-2 text-lg font-bold">
              <AlertTriangle className="h-5 w-5" />
              {t.session.discardModalTitle}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              {t.session.discardModalDesc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.session.keepTrainingBtn}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await abandonSession();
                setShowAbandonConfirm(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.session.discardSessionBtn}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
