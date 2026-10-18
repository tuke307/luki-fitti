'use client';

import React, { useEffect, useState } from 'react';
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
import { computeRemainingRestSeconds } from '@/lib/offline/offline-store';
import {
  computeExerciseProgression,
  formatCompactDelta,
} from '@luki-fitti/common/utils/client';
import { ExerciseVisual } from './exercise-visual';
import {
  ExerciseType,
  MUSCLE_GROUP_LABELS,
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

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [selectedExerciseIdx, setSelectedExerciseIdx] = useState<number>(0);
  const [showSubstituteFor, setShowSubstituteFor] = useState<string | null>(null);
  const [showAddExerciseModal, setShowAddExerciseModal] = useState(false);
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

  if (completedSummary) {
    return (
      <div className="mx-auto max-w-lg space-y-6 py-8 text-center">
        <div className="bg-primary/15 text-primary mx-auto flex h-16 w-16 items-center justify-center rounded-full">
          <Trophy className="h-8 w-8" />
        </div>
        <div>
          <Badge variant="default" className="rounded-full px-3 py-1 text-xs uppercase">
            Session Saved & Queued for Sync
          </Badge>
          <h1 className="font-display mt-3 text-3xl font-bold">
            {completedSummary.workoutNameSnapshot} Complete!
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Logged to your Training Diary and safely persisted in local & server storage.
          </p>
        </div>

        <Card className="grid grid-cols-3 gap-3 rounded-3xl p-5">
          <div>
            <p className="text-muted-foreground text-xs">Duration</p>
            <p className="font-mono-tabular mt-1 text-xl font-bold">
              {Math.max(1, Math.round(completedSummary.activeDurationSeconds / 60))}m
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Completed Sets</p>
            <p className="font-mono-tabular text-primary mt-1 text-xl font-bold">
              {completedSummary.totalSetsCompleted}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">
              {completedSummary.totalStretchSeconds > 0 && completedSummary.totalVolumeKg === 0
                ? 'Stretch Time'
                : 'Total Volume'}
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
            View in Training Diary
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
                {activeSession.status === SessionStatus.PAUSED ? 'Paused' : 'Live Session'}
              </Badge>
              <span className="text-muted-foreground font-mono-tabular text-xs">
                Started{' '}
                {new Date(activeSession.startedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <h1 className="font-display mt-1.5 text-xl font-bold sm:text-2xl">
              {activeSession.workoutNameSnapshot}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-secondary/80 rounded-2xl px-3.5 py-2 text-right">
              <p className="text-muted-foreground text-[10px] font-bold uppercase">Elapsed</p>
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
                <Play className="h-4 w-4 fill-current" /> Resume
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => void pauseSession()}
                className="px-3.5 font-semibold"
              >
                <Pause className="h-4 w-4" /> Pause
              </Button>
            )}
          </div>
        </div>

        {/* Workout Progress Bar & Overview Metrics */}
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold">
              Progress: <strong className="text-primary">{progressPct}%</strong> (
              {activeSession.totalSetsCompleted}/{totalSetsPlanned} sets)
            </span>
            <div className="text-muted-foreground font-mono-tabular flex items-center gap-3">
              <span>{completedExercisesCount} done</span>
              <span>•</span>
              <span>{remainingExercisesCount} left</span>
              <span>•</span>
              <span>{activeSession.totalVolumeKg.toLocaleString()} kg vol</span>
            </div>
          </div>
          <Progress value={progressPct} className="bg-secondary h-2.5" />
        </div>

        {/* Current vs Next Planned Exercise Indicator */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
          <div>
            <span className="text-muted-foreground">Current: </span>
            <strong className="text-foreground">
              {currentExercise?.exerciseNameSnapshot ?? 'None'}
            </strong>
          </div>
          <div>
            <span className="text-muted-foreground">Next Up: </span>
            <strong className="text-accent">
              {nextExercise ? nextExercise.exerciseNameSnapshot : 'Final Exercise'}
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
                  ? 'Rest Timer Active'
                  : restInfo.isPaused
                    ? 'Rest Timer Paused'
                    : 'Rest Timer Ready'}
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
                    Resume
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void pauseRestTimer()}
                  >
                    Pause
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
                  title="Reset Rest Timer"
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
                  Skip Rest
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
          onClick={() => setShowAddExerciseModal(true)}
          className="hover:border-primary h-auto shrink-0 rounded-2xl border px-3.5 py-2.5 text-xs font-bold"
        >
          <Plus className="h-3.5 w-3.5" /> Add Exercise
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
                    Ex
                  </span>
                  <span className="font-mono-tabular text-lg font-black leading-tight">
                    {safeIdx + 1}
                  </span>
                </div>

                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="default" className="text-[11px] uppercase tracking-wider">
                      {MUSCLE_GROUP_LABELS[currentExercise.primaryMuscleSnapshot]}
                    </Badge>
                    <span className="text-muted-foreground font-mono-tabular text-xs font-semibold">
                      of {activeSession.exercises.length} exercises
                    </span>
                    {currentExercise.restSeconds === 0 && (
                      <Badge variant="accent" className="text-[11px] font-bold">
                        <Zap className="h-3 w-3" /> Superset (0s Rest)
                      </Badge>
                    )}
                    {safeIdx > 0 &&
                      activeSession.exercises[safeIdx - 1]?.restSeconds === 0 && (
                        <Badge variant="accent" className="text-[11px] font-bold">
                          <Zap className="h-3 w-3" /> Superset Partner
                        </Badge>
                      )}
                    {currentExercise.origin === SessionExerciseOrigin.SUBSTITUTED && (
                      <Badge variant="warning" className="text-[11px]">
                        Replaced: {currentExercise.replacedExerciseName}
                      </Badge>
                    )}
                    {currentExercise.origin === SessionExerciseOrigin.ADDED && (
                      <Badge variant="accent" className="text-[11px]">
                        Added Unplanned
                      </Badge>
                    )}
                    {currentExercise.status === SessionExerciseStatus.SKIPPED && (
                      <Badge variant="destructive" className="text-[11px]">
                        Skipped
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
                title="Remove from current session (keeps template untouched)"
                className="border-destructive/30 bg-destructive/15 text-destructive hover:bg-destructive hover:text-destructive-foreground size-9 shrink-0 rounded-xl border transition"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Structured Target & Benchmark Strip */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="bg-secondary/40 rounded-2xl border border-white/5 px-3 py-2">
                <span className="text-muted-foreground block text-[10px] font-semibold uppercase tracking-wider">
                  Target Sets × Reps
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
                  Rest Interval
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
                      ? `Last (${progressionInsight.lastSession.workoutName})`
                      : 'Previous Benchmark'}
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
                    First logged session for this exercise
                  </span>
                )}
              </div>
            </div>

            {currentExercise.restSeconds === 0 && activeSession.exercises[safeIdx + 1] && (
              <div className="border-accent/40 bg-accent/15 text-accent flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-bold">
                <span className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 shrink-0" />
                  Superset paired with #{safeIdx + 2}:{' '}
                  {activeSession.exercises[safeIdx + 1]?.exerciseNameSnapshot} (No rest in between)
                </span>
                <Button
                  type="button"
                  variant="accent"
                  size="xs"
                  onClick={() => setSelectedExerciseIdx(safeIdx + 1)}
                >
                  Switch to Partner →
                </Button>
              </div>
            )}
            {safeIdx > 0 && activeSession.exercises[safeIdx - 1]?.restSeconds === 0 && (
              <div className="border-accent/40 bg-accent/10 text-accent flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-bold">
                <span className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 shrink-0" />
                  Superset Partner of #{safeIdx}:{' '}
                  {activeSession.exercises[safeIdx - 1]?.exerciseNameSnapshot}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={() => setSelectedExerciseIdx(safeIdx - 1)}
                >
                  ← Back to #{safeIdx}
                </Button>
              </div>
            )}

            {currentExercise.notes && (
              <p className="border-accent/30 bg-accent/10 text-accent rounded-xl border px-3 py-1.5 text-xs font-medium">
                Note: {currentExercise.notes}
              </p>
            )}

            {/* Exercise Action Bar: Swap, Skip, Reorder */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowSubstituteFor(currentExercise.clientExerciseId)}
                  className="h-8 rounded-xl text-xs font-semibold"
                >
                  <ArrowRightLeft className="text-primary h-3.5 w-3.5" />
                  Swap / Alternative
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void skipExercise(currentExercise.clientExerciseId)}
                  className="h-8 rounded-xl text-xs font-semibold"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  {currentExercise.status === SessionExerciseStatus.SKIPPED ? 'Unskip' : 'Skip'}
                </Button>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => void reorderExercise(currentExercise.clientExerciseId, 'UP')}
                  disabled={safeIdx === 0}
                  title="Move Earlier"
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
                  title="Move Later"
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
                      label: 'Light',
                      hint: 'Light effort — push harder next time (cycles to Sweet Spot)',
                      nextRpe: 8,
                      containerClass: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
                      activeBarClass: 'bg-emerald-400',
                    }
                  : intensityLevel === 2
                    ? {
                        label: 'Sweet Spot',
                        hint: 'Sweet Spot — right on target (cycles to Limit)',
                        nextRpe: 9.5,
                        containerClass: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
                        activeBarClass: 'bg-amber-400',
                      }
                    : intensityLevel === 3
                      ? {
                          label: 'Limit',
                          hint: 'Limit — high fatigue / hold weight (cycles to clear)',
                          nextRpe: null,
                          containerClass: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
                          activeBarClass: 'bg-rose-400',
                        }
                      : {
                          label: 'Effort',
                          hint: 'Tap to log set effort: Light → Sweet Spot → Limit',
                          nextRpe: 7,
                          containerClass:
                            'border-border bg-background text-muted-foreground hover:text-foreground',
                          activeBarClass: 'bg-muted-foreground/30',
                        };

              return (
                <div
                  key={set.clientSetId}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3 transition ${
                    set.completed
                      ? 'border-primary/50 bg-primary/10'
                      : 'bg-secondary/30 border-border'
                  }`}
                >
                  {/* Set Number & Set Type Selector */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono-tabular flex h-9 w-9 items-center justify-center rounded-xl border text-sm font-black transition ${
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
                      <option value={SetType.WARMUP}>Warm-up</option>
                      <option value={SetType.WORKING}>Working</option>
                      <option value={SetType.DROPSET}>Dropset</option>
                      <option value={SetType.FAILURE}>Failure</option>
                      <option value={SetType.STRETCH}>Stretch</option>
                    </NativeSelect>
                  </div>

                  {/* Weight / Duration & Reps Steppers */}
                  <div className="flex flex-wrap items-center gap-2">
                    {!isStretchSet ? (
                      <div className="flex items-center gap-1">
                        <div className="bg-background flex items-center rounded-xl border px-1.5 py-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() =>
                              void updateSet(currentExercise.clientExerciseId, set.clientSetId, {
                                weight: Math.max(0, (set.weight ?? 0) - 2.5),
                              })
                            }
                            className="text-muted-foreground hover:text-foreground h-6 px-2 font-bold"
                          >
                            -2.5
                          </Button>
                          <input
                            type="number"
                            step="0.5"
                            aria-label={`Set ${sIdx + 1} weight`}
                            value={set.weight ?? ''}
                            onChange={(e) =>
                              void updateSet(currentExercise.clientExerciseId, set.clientSetId, {
                                weight: e.target.value === '' ? null : Number(e.target.value),
                              })
                            }
                            placeholder="0"
                            className="font-mono-tabular w-14 bg-transparent text-center text-sm font-bold outline-none"
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
                            className="text-primary h-6 px-2 font-bold"
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
                      <div className="bg-background flex items-center rounded-xl border px-2 py-1">
                        <input
                          type="number"
                          aria-label={`Set ${sIdx + 1} duration seconds`}
                          value={set.durationSeconds ?? 45}
                          onChange={(e) =>
                            void updateSet(currentExercise.clientExerciseId, set.clientSetId, {
                              durationSeconds: Number(e.target.value),
                            })
                          }
                          className="font-mono-tabular w-14 bg-transparent text-center text-sm font-bold outline-none"
                        />
                        <span className="text-muted-foreground text-xs">sec</span>
                      </div>
                    )}

                    {/* Reps Stepper */}
                    <div className="flex items-center gap-1">
                      <div className="bg-background flex items-center rounded-xl border px-1.5 py-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() =>
                            void updateSet(currentExercise.clientExerciseId, set.clientSetId, {
                              reps: Math.max(0, (set.reps ?? 0) - 1),
                            })
                          }
                          className="text-muted-foreground hover:text-foreground h-6 px-2 font-bold"
                        >
                          -1
                        </Button>
                        <input
                          type="number"
                          aria-label={`Set ${sIdx + 1} reps`}
                          value={set.reps ?? ''}
                          onChange={(e) =>
                            void updateSet(currentExercise.clientExerciseId, set.clientSetId, {
                              reps: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                          placeholder="reps"
                          className="font-mono-tabular w-12 bg-transparent text-center text-sm font-bold outline-none"
                        />
                        <span className="text-muted-foreground text-[10px] font-semibold">
                          reps
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
                          className="text-primary h-6 px-2 font-bold"
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

                    {/* 3-Bar Intensity Meter */}
                    <button
                      type="button"
                      aria-label={`Set ${sIdx + 1} intensity: ${intensityMeta.label}`}
                      title={intensityMeta.hint}
                      onClick={() =>
                        void updateSet(currentExercise.clientExerciseId, set.clientSetId, {
                          rpe: intensityMeta.nextRpe,
                        })
                      }
                      className={`flex h-9 items-center gap-2 rounded-xl border px-2.5 text-xs font-bold transition active:scale-95 ${intensityMeta.containerClass}`}
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
                  </div>

                  {/* Complete Set Large Tap Button & Delete Set */}
                  <div className="flex items-center gap-1.5">
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
                      {set.completed ? 'Done' : 'Log Set'}
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
                <Plus className="h-3.5 w-3.5" /> Add Working Set
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
                + Warm-up Set
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
                Next Exercise: {activeSession.exercises[safeIdx + 1]?.exerciseNameSnapshot} →
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <Card className="rounded-3xl p-8 text-center">
          <Dumbbell className="text-muted-foreground mx-auto mb-2 h-8 w-8" />
          <p className="font-display text-base font-bold">No exercises in this session yet</p>
          <div className="mt-3 flex justify-center">
            <Button type="button" onClick={() => setShowAddExerciseModal(true)}>
              + Add First Exercise
            </Button>
          </div>
        </Card>
      )}

      {/* Session Notes & Finish / Abandon Footer */}
      <Card className="space-y-4 rounded-3xl p-5">
        <div className="space-y-1.5">
          <Label htmlFor="session-notes" className="text-xs font-semibold">
            Session Notes
          </Label>
          <Input
            id="session-notes"
            value={sessionNotes}
            onChange={(e) => setSessionNotes(e.target.value)}
            placeholder="Energy levels, machine settings, or PR notes..."
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
            Abandon Session
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
            Finish & Save Workout
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
        <DialogContent className="sm:max-w-md">
          {currentExercise && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-lg font-bold">
                  Replace {currentExercise.exerciseNameSnapshot}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Swapping an exercise records what you actually performed in this session without
                  modifying your saved workout template.
                </DialogDescription>
              </DialogHeader>

              {currentExercise.alternativeExerciseIds.length > 0 && (
                <div className="space-y-2">
                  <p className="text-primary text-xs font-bold uppercase">
                    Predefined Template Alternatives
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
                        <span className="text-primary text-[11px]">Use Backup →</span>
                      </Button>
                    );
                  })}
                </div>
              )}

              <div className="space-y-2 pt-2">
                <p className="text-muted-foreground text-xs font-bold uppercase">
                  Same Muscle Group ({MUSCLE_GROUP_LABELS[currentExercise.primaryMuscleSnapshot]})
                </p>
                {catalog
                  .filter(
                    (c) =>
                      c.primaryMuscleGroup === currentExercise.primaryMuscleSnapshot &&
                      c.id !== currentExercise.exerciseId,
                  )
                  .map((alt) => (
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
                      <span className="text-muted-foreground text-[11px]">{alt.equipment}</span>
                    </Button>
                  ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Unplanned Exercise Modal */}
      <Dialog open={showAddExerciseModal} onOpenChange={setShowAddExerciseModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-bold">
              Add Unplanned Exercise
            </DialogTitle>
            <DialogDescription className="text-xs">
              Select an exercise from the catalog to add to your active session.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {catalog.map((ex) => (
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
                    {MUSCLE_GROUP_LABELS[ex.primaryMuscleGroup]} • {ex.equipment}
                  </p>
                </div>
                <span className="text-primary font-bold">+ Add</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Abandon Session Confirmation */}
      <AlertDialog open={showAbandonConfirm} onOpenChange={setShowAbandonConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive font-display flex items-center gap-2 text-lg font-bold">
              <AlertTriangle className="h-5 w-5" />
              Discard Active Session?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              This will discard your current in-progress session without saving it to your diary.
              Your workout template will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Training</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await abandonSession();
                setShowAbandonConfirm(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard Session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
