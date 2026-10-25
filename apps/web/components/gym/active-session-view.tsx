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
  ChevronRight,
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
import { useAuth } from '@/providers/auth/auth-context';
import { useGym } from '@/providers/gym/gym-context';
import { useLocale } from '@/providers/i18n/locale-context';
import { computeRemainingRestSeconds } from '@/lib/offline/offline-store';
import { triggerWorkoutNotification } from '@/lib/notifications/notification-manager';
import {
  computeExerciseProgression,
  computeWorkoutExerciseSuggestion,
  formatCompactDelta,
  formatDateTime,
  formatRestDurationMinSec,
  groupExercisesIntoBlocks,
} from '@luki-fitti/common/utils/client';
import { filterExercisesByQuery } from './exercise-picker';
import { ExerciseVisual } from './exercise-visual';
import { NumberInput } from './number-input';
import { RainbowExerciseSuggestionCard } from './rainbow-suggestion-card';
import {
  ExerciseType,
  MuscleGroup,
  SessionExerciseOrigin,
  SessionExerciseStatus,
  SessionStatus,
  SetType,
} from '@luki-fitti/common/enums';
import type { SessionExerciseDto, WorkoutSessionDto } from '@luki-fitti/common/schemas';

interface ActiveSessionViewProps {
  onNavigateToDiary: () => void;
  onNavigateToWorkouts: () => void;
}

export function ActiveSessionView({
  onNavigateToDiary,
  onNavigateToWorkouts,
}: ActiveSessionViewProps) {
  const { user } = useAuth();
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
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  const suggestionsEnabled = user?.preferences?.exerciseSuggestionsEnabled ?? true;

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
          <Badge variant="default" className="rounded-full px-3 py-1 text-xs">
            {t.session.savedQueuedBadge}
          </Badge>
          <h1 className="font-display mt-3 text-3xl font-bold">
            {format(t.session.completeTitle, { name: completedSummary.workoutNameSnapshot })}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{t.session.completeSub}</p>
        </div>

        <Card className="grid grid-cols-3 gap-3 rounded-[1.25rem] p-5">
          <div>
            <p className="text-muted-foreground text-xs">{t.session.durationLabel}</p>
            <p className="tabular-nums mt-1 text-xl font-bold">
              {Math.max(1, Math.round(completedSummary.activeDurationSeconds / 60))}m
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">{t.session.completedSetsLabel}</p>
            <p className="tabular-nums text-primary mt-1 text-xl font-bold">
              {completedSummary.totalSetsCompleted}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">
              {completedSummary.totalStretchSeconds > 0 && completedSummary.totalVolumeKg === 0
                ? t.session.stretchTimeLabel
                : t.session.totalVolumeLabel}
            </p>
            <p className="tabular-nums mt-1 text-xl font-bold">
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
            className="text-sm"
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
  // Active Session HUD & Calculations
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
  const restProgressPct =
    restInfo.totalSeconds > 0
      ? Math.max(0, Math.min(100, Math.round((restInfo.remainingSeconds / restInfo.totalSeconds) * 100)))
      : 0;

  const exerciseBlocks = groupExercisesIntoBlocks(activeSession.exercises);

  const sessionSuggestion =
    suggestionsEnabled && !suggestionDismissed && activeSession.exercises.length > 0
      ? computeWorkoutExerciseSuggestion({
          workoutName: activeSession.workoutNameSnapshot,
          exercises: activeSession.exercises.map((ex) => ({
            exerciseId: ex.exerciseId,
            exerciseName: ex.exerciseNameSnapshot,
            primaryMuscleGroup: ex.primaryMuscleSnapshot,
            plannedSets: ex.plannedSets,
            targetRepsMin: ex.targetRepsMin,
            targetRepsMax: ex.targetRepsMax,
            targetWeight: ex.targetWeight,
          })),
          catalog,
          historySessions,
          weightUnit: activeSession.weightUnit,
        })
      : null;

  const formatExercisePillText = (ex: SessionExerciseDto) => {
    const repsPart =
      ex.targetRepsMin && ex.targetRepsMax && ex.targetRepsMin !== ex.targetRepsMax
        ? `${ex.targetRepsMin}–${ex.targetRepsMax}`
        : `${ex.targetRepsMin ?? 10}`;
    const weightPart = ex.targetWeight
      ? ` ${ex.targetWeight} ${activeSession.weightUnit.toLowerCase()}`
      : '';
    return `${ex.plannedSets}×${repsPart}${weightPart}`;
  };

  const renderCollapsedExerciseHeader = (
    ex: SessionExerciseDto,
    idx: number,
    supersetStepNumber?: number,
  ) => {
    const doneSets = ex.sets.filter((s) => s.completed).length;
    const isCompleted = ex.status === SessionExerciseStatus.COMPLETED;
    const isSkipped = ex.status === SessionExerciseStatus.SKIPPED;
    const catEx = catalog.find((c) => c.id === ex.exerciseId);

    return (
      <button
        key={ex.clientExerciseId}
        type="button"
        data-testid={`vertical-exercise-row-${idx + 1}`}
        onClick={() => setSelectedExerciseIdx(idx)}
        className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition ${
          isCompleted
            ? 'border-success/40 bg-success/10 hover:bg-success/15'
            : isSkipped
              ? 'bg-secondary/30 border-border opacity-60'
              : 'bg-card hover:border-primary/40 border-border'
        }`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`tabular-nums flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
              isCompleted
                ? 'bg-success text-success-foreground'
                : supersetStepNumber
                  ? 'text-accent border border-border bg-secondary'
                  : 'bg-secondary text-foreground'
            }`}
          >
            {isCompleted ? (
              <Check className="h-4 w-4 stroke-[3]" />
            ) : (
              (supersetStepNumber ?? idx + 1)
            )}
          </span>

          <ExerciseVisual
            exercise={{
              id: ex.exerciseId ?? ex.clientExerciseId,
              slug: catEx?.slug,
              name: ex.exerciseNameSnapshot,
              primaryMuscleGroup: ex.primaryMuscleSnapshot,
              media: catEx?.media,
            }}
            variant="thumbnail"
            className="h-10 w-12 shrink-0"
          />

          <div className="min-w-0">
            <p
              className={`font-display truncate text-sm font-bold ${
                isSkipped ? 'line-through' : ''
              }`}
            >
              {ex.exerciseNameSnapshot}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="bg-accent/20 text-accent tabular-nums rounded-md px-1.5 py-0.5 font-semibold">
                {formatExercisePillText(ex)}
              </span>
              <span className="text-muted-foreground">
                {muscleLabel(ex.primaryMuscleSnapshot)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Badge
            variant={isCompleted ? 'success' : 'secondary'}
            className="tabular-nums px-2 py-0.5 text-xs font-bold"
          >
            {doneSets}/{ex.sets.length} {t.common.sets}
          </Badge>
          <ChevronRight className="text-muted-foreground h-4 w-4" />
        </div>
      </button>
    );
  };

  const renderExpandedExerciseCard = (
    ex: SessionExerciseDto,
    idx: number,
    supersetStepNumber?: number,
  ) => {
    const catEx = catalog.find((c) => c.id === ex.exerciseId) ?? null;
    const insight = computeExerciseProgression({
      exerciseId: ex.exerciseId,
      exerciseName: ex.exerciseNameSnapshot,
      historySessions,
      catalogExercise: catEx,
      plannedSets: ex.plannedSets,
      targetRepsMin: ex.targetRepsMin,
      targetRepsMax: ex.targetRepsMax,
      targetWeight: ex.targetWeight,
      weightUnit: activeSession.weightUnit,
      currentSets: ex.sets,
    });

    let workingSetRenderCounter = 0;

    return (
      <Card
        key={ex.clientExerciseId}
        data-testid={`active-exercise-card-${idx + 1}`}
        className="border-primary/35 relative space-y-5 overflow-hidden rounded-[1.25rem] border p-4 sm:p-6"
      >
        {/* Card Header: Upper-Left Number Badge + Title + Upper-Right Red Trash Button */}
        <div className="flex flex-col gap-4 border-b border-border pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3.5">
              {/* Upper-Left Corner Exercise Number Badge */}
              <div className="border-primary/40 text-primary flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl border">
                <span className="text-primary/70 text-xs font-semibold leading-none">
                  {supersetStepNumber ? `#${supersetStepNumber}` : t.session.exShort}
                </span>
                <span className="tabular-nums text-lg font-bold leading-tight">
                  {idx + 1}
                </span>
              </div>

              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="default" className="text-xs">
                    {muscleLabel(ex.primaryMuscleSnapshot)}
                  </Badge>
                  <span className="text-muted-foreground tabular-nums text-xs font-semibold">
                    {format(t.session.ofExercises, { count: activeSession.exercises.length })}
                  </span>
                  {ex.restSeconds === 0 && (
                    <Badge variant="accent" className="text-xs font-bold">
                      <Zap className="h-3 w-3" /> {t.session.supersetZeroRest}
                    </Badge>
                  )}
                  {idx > 0 && activeSession.exercises[idx - 1]?.restSeconds === 0 && (
                    <Badge variant="accent" className="text-xs font-bold">
                      <Zap className="h-3 w-3" /> {t.session.supersetPartner}
                    </Badge>
                  )}
                  {ex.origin === SessionExerciseOrigin.SUBSTITUTED && (
                    <Badge variant="warning" className="text-xs">
                      {format(t.session.replacedBadge, {
                        name: ex.replacedExerciseName ?? '',
                      })}
                    </Badge>
                  )}
                  {ex.origin === SessionExerciseOrigin.ADDED && (
                    <Badge variant="accent" className="text-xs">
                      {t.session.addedUnplannedBadge}
                    </Badge>
                  )}
                  {ex.status === SessionExerciseStatus.SKIPPED && (
                    <Badge variant="destructive" className="text-xs">
                      {t.session.skippedBadge}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <ExerciseVisual
                    exercise={{
                      id: ex.exerciseId,
                      slug: catEx?.slug,
                      name: ex.exerciseNameSnapshot,
                      primaryMuscleGroup: ex.primaryMuscleSnapshot,
                      media: catEx?.media,
                    }}
                    variant="thumbnail"
                    className="h-12 w-16"
                  />
                  <h2 className="font-display text-xl font-semibold tracking-tight sm:text-3xl">
                    {ex.exerciseNameSnapshot}
                  </h2>
                </div>
              </div>
            </div>

            {/* Upper-Right Corner Red Trash Button */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => void removeExerciseFromSession(ex.clientExerciseId)}
              aria-label="Remove exercise from session"
              title={t.session.removeFromSessionTitle}
              className="border-destructive/30 bg-destructive/15 text-destructive hover:bg-destructive hover:text-destructive-foreground size-9 shrink-0 rounded-xl border transition"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Structured Target & Benchmark Strip */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="bg-secondary/40 rounded-2xl border border-border px-3 py-2">
              <span className="text-muted-foreground block text-xs font-semibold">
                {t.session.targetSetsRepsLabel}
              </span>
              <span className="tabular-nums text-foreground mt-0.5 block text-sm font-semibold">
                {ex.plannedSets} ×{' '}
                {ex.targetRepsMin && ex.targetRepsMax && ex.targetRepsMin !== ex.targetRepsMax
                  ? `${ex.targetRepsMin}–${ex.targetRepsMax}`
                  : (ex.targetRepsMin ?? 10)}
              </span>
            </div>

            <div className="bg-secondary/40 rounded-2xl border border-border px-3 py-2">
              <span className="text-muted-foreground block text-xs font-semibold">
                {t.session.restIntervalLabel}
              </span>
              <span className="tabular-nums text-foreground mt-0.5 block text-sm font-semibold">
                {ex.restSeconds}s
                {ex.targetWeight ? ` • ${ex.targetWeight}${activeSession.weightUnit.toLowerCase()}` : ''}
              </span>
            </div>

            <div className="bg-secondary/40 col-span-2 rounded-2xl border border-border px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs font-semibold">
                  {insight.lastSession
                    ? format(t.session.lastSessionFrom, {
                        name: insight.lastSession.workoutName,
                      })
                    : t.session.previousBenchmark}
                </span>
                {insight.ewma1RM > 0 && (
                  <span className="text-primary tabular-nums text-xs font-bold">
                    e1RM {insight.ewma1RM}
                    {activeSession.weightUnit.toLowerCase()}
                  </span>
                )}
              </div>
              {insight.lastSession ? (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {insight.lastSession.workingSets.slice(0, 4).map((ws, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className="tabular-nums px-1.5 py-0.5 text-xs font-semibold"
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

          {ex.restSeconds === 0 && activeSession.exercises[idx + 1] && (
            <div className="border-accent/40 bg-accent/15 text-accent flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-bold">
              <span className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 shrink-0" />
                {format(t.session.supersetPairedBanner, {
                  index: idx + 2,
                  name: activeSession.exercises[idx + 1]?.exerciseNameSnapshot ?? '',
                })}
              </span>
              <Button
                type="button"
                variant="accent"
                size="xs"
                onClick={() => setSelectedExerciseIdx(idx + 1)}
              >
                {t.session.switchToPartnerBtn}
              </Button>
            </div>
          )}
          {idx > 0 && activeSession.exercises[idx - 1]?.restSeconds === 0 && (
            <div className="border-accent/40 bg-accent/10 text-accent flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-bold">
              <span className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 shrink-0" />
                {format(t.session.supersetPartnerOfBanner, {
                  index: idx,
                  name: activeSession.exercises[idx - 1]?.exerciseNameSnapshot ?? '',
                })}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="xs"
                onClick={() => setSelectedExerciseIdx(idx - 1)}
              >
                {format(t.session.backToExerciseBtn, { index: idx })}
              </Button>
            </div>
          )}

          {ex.notes && (
            <p className="border-accent/30 bg-accent/10 text-accent rounded-xl border px-3 py-1.5 text-xs font-medium">
              {format(t.session.notePrefix, { note: ex.notes })}
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
                  setShowSubstituteFor(ex.clientExerciseId);
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
                onClick={() => void skipExercise(ex.clientExerciseId)}
                className="h-8 rounded-xl text-xs font-semibold"
              >
                <SkipForward className="h-3.5 w-3.5" />
                {ex.status === SessionExerciseStatus.SKIPPED
                  ? t.session.unskipBtn
                  : t.session.skipBtn}
              </Button>
            </div>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => void reorderExercise(ex.clientExerciseId, 'UP')}
                disabled={idx === 0}
                title={t.session.moveEarlierTitle}
                className="size-8 rounded-xl"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => void reorderExercise(ex.clientExerciseId, 'DOWN')}
                disabled={idx === activeSession.exercises.length - 1}
                title={t.session.moveLaterTitle}
                className="size-8 rounded-xl"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Sets Table — Ergonomic One-Handed Gym Controls with Clear Logged State */}
        <div className="space-y-2.5 pt-2">
          {ex.sets.map((set, sIdx) => {
            const isStretchSet =
              ex.exerciseTypeSnapshot === ExerciseType.STRETCHING ||
              set.setType === SetType.STRETCH;
            const isWorkingType =
              !isStretchSet && set.setType !== SetType.WARMUP && set.setType !== SetType.STRETCH;

            const setSuggestion =
              isWorkingType && insight
                ? (insight.setSuggestions[workingSetRenderCounter++] ??
                  insight.setSuggestions[insight.setSuggestions.length - 1] ??
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

            const weightBadgeLabel = !set.completed ? formatCompactDelta(dynamicWeightDelta) : null;
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
                    containerClass: 'border-success/40 bg-success/10 text-success',
                    activeBarClass: 'bg-success',
                  }
                : intensityLevel === 2
                  ? {
                      label: t.session.intensitySweetSpot,
                      hint: t.session.intensitySweetSpotHint,
                      nextRpe: 9.5,
                      containerClass: 'border-warning/40 bg-warning/10 text-warning',
                      activeBarClass: 'bg-warning',
                    }
                  : intensityLevel === 3
                    ? {
                        label: t.session.intensityLimit,
                        hint: t.session.intensityLimitHint,
                        nextRpe: null,
                        containerClass: 'border-destructive/40 bg-destructive/10 text-destructive',
                        activeBarClass: 'bg-destructive',
                      }
                    : {
                        label: t.session.intensityEffort,
                        hint: t.session.intensityEffortHint,
                        nextRpe: 7,
                        containerClass:
                          'border-border bg-background text-muted-foreground hover:text-foreground',
                        activeBarClass: 'bg-muted-foreground/30',
                      };

            const loggedPrescriptionSummary = isStretchSet
              ? `${set.durationSeconds ?? 45} ${t.common.sec}`
              : `${set.weight ?? 0}${set.weightUnit.toLowerCase()} × ${set.reps ?? 0}`;

            return (
              <div
                key={set.clientSetId}
                data-testid={`session-set-row-${sIdx + 1}`}
                data-set-logged={set.completed ? 'true' : 'false'}
                className={`flex flex-col gap-2.5 rounded-2xl border p-3 transition-all sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2 ${
                  set.completed
                    ? 'border-success/50 bg-success/10'
                    : 'bg-secondary/30 border-border'
                }`}
              >
                {/* Set Number / Checkmark Badge, Set Type Selector, Logged Summary Pill, and Mobile-Right Intensity + Delete */}
                <div className="flex items-center justify-between gap-2 sm:justify-start">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`tabular-nums flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-sm font-bold transition-transform ${
                        set.completed
                          ? 'scale-105 border-success bg-success text-success-foreground'
                          : set.setType === SetType.WARMUP
                            ? 'border-warning/40 bg-warning/15 text-warning'
                            : set.setType === SetType.STRETCH
                              ? 'border-accent/40 bg-accent/15 text-accent'
                              : 'border-primary/35 bg-primary/15 text-primary'
                      }`}
                    >
                      {set.completed ? (
                        <Check className="h-4 w-4 stroke-[3]" />
                      ) : (
                        sIdx + 1
                      )}
                    </span>

                    <NativeSelect
                      aria-label={`Set ${sIdx + 1} type`}
                      value={set.setType}
                      onChange={(e) =>
                        void updateSet(ex.clientExerciseId, set.clientSetId, {
                          setType: e.target.value as SetType,
                        })
                      }
                      className={`h-8 rounded-lg px-2 py-1 pr-6 text-xs font-bold ${
                        set.setType === SetType.WARMUP
                          ? 'bg-warning/20 text-warning'
                          : set.setType === SetType.STRETCH
                            ? 'bg-accent/20 text-accent'
                            : 'bg-background text-foreground'
                      }`}
                    >
                      <option value={SetType.WARMUP}>{setTypeLabel(SetType.WARMUP)}</option>
                      <option value={SetType.WORKING}>{setTypeLabel(SetType.WORKING)}</option>
                      <option value={SetType.DROPSET}>{setTypeLabel(SetType.DROPSET)}</option>
                      <option value={SetType.STRETCH}>{setTypeLabel(SetType.STRETCH)}</option>
                    </NativeSelect>

                    {set.completed && (
                      <span
                        data-testid="logged-set-summary-pill"
                        className="tabular-nums inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/20 px-2.5 py-0.5 text-xs font-semibold text-success"
                      >
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                        {loggedPrescriptionSummary}
                      </span>
                    )}
                  </div>

                  {/* Mobile Top-Right: 3-Bar Intensity Meter + Delete Set */}
                  <div className="flex items-center gap-1.5 sm:hidden">
                    <button
                      type="button"
                      aria-label={`Set ${sIdx + 1} intensity: ${intensityMeta.label}`}
                      title={intensityMeta.hint}
                      onClick={() =>
                        void updateSet(ex.clientExerciseId, set.clientSetId, {
                          rpe: intensityMeta.nextRpe,
                        })
                      }
                      className={`flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-bold transition active:scale-95 ${intensityMeta.containerClass}`}
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
                        void removeSetFromExercise(ex.clientExerciseId, set.clientSetId)
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
                            void updateSet(ex.clientExerciseId, set.clientSetId, {
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
                            void updateSet(ex.clientExerciseId, set.clientSetId, {
                              weight: val,
                            })
                          }
                          placeholder="0"
                          className="tabular-nums w-13 bg-transparent text-center text-sm font-bold outline-none sm:w-14"
                        />
                        <span className="text-muted-foreground text-xs font-semibold">
                          {set.weightUnit.toLowerCase()}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() =>
                            void updateSet(ex.clientExerciseId, set.clientSetId, {
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
                            className="tabular-nums cursor-pointer rounded-lg px-1.5 py-1 text-xs font-semibold transition hover:scale-105"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                void updateSet(ex.clientExerciseId, set.clientSetId, {
                                  weight: setSuggestion.suggestedWeight,
                                  ...(setSuggestion.suggestedReps !== null
                                    ? { reps: setSuggestion.suggestedReps }
                                    : {}),
                                })
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
                          void updateSet(ex.clientExerciseId, set.clientSetId, {
                            durationSeconds: val,
                          })
                        }
                        className="tabular-nums w-14 bg-transparent text-center text-sm font-bold outline-none"
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
                          void updateSet(ex.clientExerciseId, set.clientSetId, {
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
                          void updateSet(ex.clientExerciseId, set.clientSetId, {
                            reps: val,
                          })
                        }
                        placeholder={t.common.reps}
                        className="tabular-nums w-11 bg-transparent text-center text-sm font-bold outline-none sm:w-12"
                      />
                      <span className="text-muted-foreground text-xs font-semibold">
                        {t.common.reps}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() =>
                          void updateSet(ex.clientExerciseId, set.clientSetId, {
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
                        className="tabular-nums cursor-pointer rounded-lg px-1.5 py-1 text-xs font-semibold transition hover:scale-105"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            void updateSet(ex.clientExerciseId, set.clientSetId, {
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
                      void updateSet(ex.clientExerciseId, set.clientSetId, {
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

                  {/* Mobile Inline Log Set / Logged Status Button */}
                  <Button
                    type="button"
                    variant={set.completed ? 'default' : 'secondary'}
                    onClick={() => void toggleCompleteSet(ex.clientExerciseId, set.clientSetId)}
                    aria-label={set.completed ? 'Mark set incomplete' : 'Complete set'}
                    className={`h-10 min-w-[104px] flex-1 font-semibold transition active:scale-95 sm:hidden ${
                      set.completed
                        ? 'bg-success text-success-foreground hover:bg-success'
                        : 'hover:bg-primary/20'
                    }`}
                  >
                    {set.completed ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 stroke-[2.5]" />
                        <span className="tabular-nums">
                          {loggedPrescriptionSummary} • {t.session.doneSetBtn}
                        </span>
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 stroke-[3]" />
                        {t.session.logSetBtn}
                      </>
                    )}
                  </Button>
                </div>

                {/* Desktop Complete Set Large Tap Button & Delete Set */}
                <div className="hidden items-center gap-1.5 sm:flex">
                  <Button
                    type="button"
                    variant={set.completed ? 'default' : 'secondary'}
                    onClick={() => void toggleCompleteSet(ex.clientExerciseId, set.clientSetId)}
                    aria-label={set.completed ? 'Mark set incomplete' : 'Complete set'}
                    className={`h-10 min-w-[116px] font-semibold transition active:scale-95 ${
                      set.completed
                        ? 'bg-success text-success-foreground hover:bg-success'
                        : 'hover:bg-primary/20'
                    }`}
                  >
                    {set.completed ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 stroke-[2.5]" />
                        <span className="tabular-nums">
                          {loggedPrescriptionSummary} • {t.session.doneSetBtn}
                        </span>
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 stroke-[3]" />
                        {t.session.logSetBtn}
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void removeSetFromExercise(ex.clientExerciseId, set.clientSetId)}
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
              onClick={() => void addSetToExercise(ex.clientExerciseId, SetType.WORKING)}
              className="font-bold"
            >
              <Plus className="h-3.5 w-3.5" /> {t.session.addWorkingSetBtn}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void addSetToExercise(ex.clientExerciseId, SetType.WARMUP)}
              className="bg-secondary/60 text-muted-foreground hover:text-foreground font-semibold"
            >
              {t.session.addWarmupSetBtn}
            </Button>
          </div>

          {idx < activeSession.exercises.length - 1 && (
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => setSelectedExerciseIdx(idx + 1)}
              className="h-auto p-0 text-xs font-bold"
            >
              {format(t.session.nextExerciseLink, {
                name: activeSession.exercises[idx + 1]?.exerciseNameSnapshot ?? '',
              })}
            </Button>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-5 pb-36 md:pb-16">
      {/* Top Telemetry Banner */}
      <Card className="border-primary/30 relative overflow-hidden rounded-[1.25rem] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="solid" className="rounded-full px-2.5 py-0.5 text-xs">
                {activeSession.status === SessionStatus.PAUSED
                  ? t.session.pausedBadge
                  : t.session.liveSessionBadge}
              </Badge>
              <span className="text-muted-foreground tabular-nums text-xs">
                {format(t.session.startedAt, { date: formatDateTime(activeSession.startedAt) })}
              </span>
            </div>
            <h1 className="font-display mt-1.5 text-xl font-bold sm:text-2xl">
              {activeSession.workoutNameSnapshot}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-secondary/80 rounded-2xl px-3.5 py-2 text-right">
              <p className="text-muted-foreground text-xs font-bold">
                {t.session.elapsedLabel}
              </p>
              <p className="tabular-nums text-primary text-lg font-semibold">
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
            <div className="text-muted-foreground tabular-nums flex items-center gap-3">
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

      {/* Vertical Collapsible Exercise Stack (Eliminates Horizontal Scrolling) */}
      {activeSession.exercises.length > 0 ? (
        <div data-testid="vertical-exercise-stack" className="space-y-3">
          {exerciseBlocks.map((block) => {
            if (block.type === 'superset') {
              return (
                <div
                  key={`active-superset-${block.startIndex}`}
                  data-testid="active-superset-block"
                  className="border-accent/45 bg-card/60 overflow-hidden rounded-[1.25rem] border shadow-md"
                >
                  {/* Gymlife Dark Superset Header Banner */}
                  <div className="flex items-center justify-between gap-2 border-b border-border bg-secondary px-4 py-3 text-foreground">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-semibold sm:text-sm">
                        <span className="text-accent">{t.workouts.supersetHeaderLabel}</span>
                        <span className="tabular-nums text-foreground">
                          {format(t.workouts.supersetRoundsFormat, { rounds: block.rounds })}
                        </span>
                      </div>
                      <p className="tabular-nums mt-0.5 text-xs text-muted-foreground">
                        {format(t.workouts.supersetSubtitleFormat, {
                          rest: formatRestDurationMinSec(block.roundRestSeconds),
                        })}
                      </p>
                    </div>
                    <Badge variant="accent" className="px-2.5 py-0.5 text-xs font-bold">
                      <Zap className="h-3 w-3" /> {block.items.length} ex
                    </Badge>
                  </div>

                  {/* Superset Items Vertically Stacked */}
                  <div className="space-y-2.5 p-3">
                    {block.items.map(({ item: ex, globalIndex, stepNumber }) =>
                      globalIndex === safeIdx
                        ? renderExpandedExerciseCard(ex, globalIndex, stepNumber)
                        : renderCollapsedExerciseHeader(ex, globalIndex, stepNumber),
                    )}
                  </div>
                </div>
              );
            }

            const { item: ex, globalIndex } = block.items[0]!;
            return globalIndex === safeIdx
              ? renderExpandedExerciseCard(ex, globalIndex)
              : renderCollapsedExerciseHeader(ex, globalIndex);
          })}

          {/* Maximum 1 Rainbow Smart Exercise Suggestion per Workout */}
          {sessionSuggestion && (
            <RainbowExerciseSuggestionCard
              suggestion={sessionSuggestion}
              weightUnit={activeSession.weightUnit}
              testId="session-rainbow-suggestion"
              onAdd={async (sug) => {
                await addExerciseToSession(sug.suggestedExercise.id);
                setSelectedExerciseIdx(activeSession.exercises.length);
                setSuggestionDismissed(true);
              }}
              onSwap={
                sessionSuggestion.stallingExerciseId
                  ? async (sug) => {
                      const targetEx = activeSession.exercises.find(
                        (e) => e.exerciseId === sug.stallingExerciseId,
                      );
                      if (targetEx) {
                        await substituteExercise(
                          targetEx.clientExerciseId,
                          sug.suggestedExercise.id,
                        );
                        setSuggestionDismissed(true);
                      }
                    }
                  : undefined
              }
              onDismiss={() => setSuggestionDismissed(true)}
            />
          )}

          <div className="flex justify-center pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setAddExerciseSearch('');
                setAddExerciseMuscle('ALL');
                setShowAddExerciseModal(true);
              }}
              className="hover:border-primary w-full rounded-2xl border py-3 text-xs font-bold sm:w-auto sm:px-6"
            >
              <Plus className="h-3.5 w-3.5" /> {t.session.addExerciseBtn}
            </Button>
          </div>
        </div>
      ) : (
        <Card className="rounded-[1.25rem] p-8 text-center">
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
      <Card className="space-y-4 rounded-[1.25rem] p-5">
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
              if (finished) {
                setCompletedSummary(finished);
                if (user?.preferences?.notificationsEnabled ?? true) {
                  void triggerWorkoutNotification({
                    title: t.session.workoutCompleteNotifTitle,
                    body: format(t.session.workoutCompleteNotifBody, {
                      name: finished.workoutNameSnapshot,
                      sets: finished.totalSetsCompleted,
                      volume: finished.totalVolumeKg.toLocaleString(),
                    }),
                    tag: 'luki-fitti-workout-complete',
                    playSound: user?.preferences?.restTimerSound ?? true,
                    showToast: true,
                  });
                }
              }
            }}
            className="text-sm"
          >
            <CheckCircle2 className="h-4 w-4" />
            {t.session.finishSaveWorkoutBtn}
          </Button>
        </div>
      </Card>

      {/* Always-Visible Floating / Sticky Bottom Rest Timer HUD */}
      <div
        data-testid="sticky-rest-timer-dock"
        className="fixed right-3 bottom-[calc(4.15rem+env(safe-area-inset-bottom))] left-3 z-30 mx-auto max-w-6xl md:sticky md:right-auto md:bottom-4 md:left-auto"
      >
        <Card
          className={`overflow-hidden rounded-2xl border p-3 shadow-xl backdrop-blur-xl transition-all sm:px-4 sm:py-3.5 ${
            restInfo.isRunning || restInfo.isPaused
              ? 'border-accent/60 bg-card/95 ring-accent/30 ring-1'
              : 'bg-card/90 border-border/80'
          }`}
        >
          {(restInfo.isRunning || restInfo.isPaused) && restInfo.totalSeconds > 0 && (
            <div className="bg-secondary/60 -mx-3 -mt-3 mb-2.5 h-1.5 overflow-hidden sm:-mx-4 sm:-mt-3.5">
              <div
                className="bg-accent h-full transition-all duration-300"
                style={{ width: `${restProgressPct}%` }}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  restInfo.isRunning
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-secondary text-muted-foreground'
                }`}
              >
                <Timer className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold">
                  {restInfo.isRunning
                    ? t.session.restTimerActive
                    : restInfo.isPaused
                      ? t.session.restTimerPaused
                      : t.session.restTimerReady}
                </p>
                <p className="tabular-nums text-lg leading-tight font-semibold sm:text-xl">
                  {formatTimer(restInfo.remainingSeconds)}
                  {restInfo.totalSeconds > 0 && (
                    <span className="text-muted-foreground ml-1 text-xs font-normal">
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
                className="h-8 px-2.5 text-xs"
              >
                60s
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void startRestTimer(90)}
                className="h-8 px-2.5 text-xs"
              >
                90s
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void startRestTimer(150)}
                className="h-8 px-2.5 text-xs"
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
                    className="h-8 px-2.5 text-xs font-bold"
                  >
                    -15s
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void adjustRestTimer(15)}
                    className="h-8 px-2.5 text-xs font-bold"
                  >
                    +15s
                  </Button>
                  {restInfo.isPaused ? (
                    <Button
                      type="button"
                      variant="accent"
                      size="sm"
                      onClick={() => void resumeRestTimer()}
                      className="h-8 px-2.5 text-xs"
                    >
                      {t.session.resumeBtn}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void pauseRestTimer()}
                      className="h-8 px-2.5 text-xs"
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
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => void skipRestTimer()}
                    className="h-8 px-2.5 text-xs"
                  >
                    {t.session.skipRestBtn}
                  </Button>
                </>
              )}
            </div>
          </div>
        </Card>
      </div>

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
                    <p className="text-primary text-xs font-bold">
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
                          <span className="text-primary text-xs">{t.session.useBackupBtn}</span>
                        </Button>
                      );
                    })}
                  </div>
                )}

                <div className="space-y-2 pt-1">
                  <p className="text-muted-foreground text-xs font-bold">
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
                      <span className="text-muted-foreground text-xs">
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
                className="h-7 shrink-0 px-2.5 text-xs"
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
                  className="h-7 shrink-0 px-2.5 text-xs"
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
                    <p className="text-muted-foreground text-xs font-normal">
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
