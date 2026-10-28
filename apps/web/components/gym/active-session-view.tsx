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
  CheckCircle2,
  Dumbbell,
  Trophy,
  AlertTriangle,
  Zap,
  Search,
  X,
  ChevronRight,
  MoreHorizontal,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@luki-fitti/ui/components/ui/dropdown-menu';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { Label } from '@luki-fitti/ui/components/ui/label';
import { Progress } from '@luki-fitti/ui/components/ui/progress';
import { useAuth } from '@/providers/auth/auth-context';
import { useGym } from '@/providers/gym/gym-context';
import { useLocale } from '@/providers/i18n/locale-context';
import { computeRemainingRestSeconds } from '@/lib/offline/offline-store';
import { triggerWorkoutNotification } from '@/lib/notifications/notification-manager';
import {
  computeExerciseProgression,
  computeWorkoutExerciseSuggestion,
  formatRestDurationMinSec,
  groupExercisesIntoBlocks,
  type ExerciseRenderBlock,
} from '@luki-fitti/common/utils/client';
import { filterExercisesByQuery } from './exercise-picker';
import { ExerciseVisual } from './exercise-visual';
import { RainbowExerciseSuggestionCard } from './rainbow-suggestion-card';
import { alignSetSuggestions, SessionSetRow } from './session-set-row';
import { getSetBadgeLabels } from './set-type-badge';
import { SwipeRow } from './swipe-row';
import { formatVolume, unitLabel } from '@/lib/format/weight';
import {
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
    addSetToExercise,
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
    dismissedSuggestions,
    dismissSuggestion,
  } = useGym();
  const { t, format, muscleLabel, equipmentLabel } = useLocale();

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
        <div className="bg-primary/12 text-primary mx-auto flex h-16 w-16 items-center justify-center rounded-full">
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
                : `${formatVolume(completedSummary.totalVolumeKg, completedSummary.weightUnit)} ${unitLabel(completedSummary.weightUnit)}`}
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

  const totalSetsPlanned = activeSession.exercises.reduce((acc, e) => acc + e.sets.length, 0);
  const progressPct =
    totalSetsPlanned > 0
      ? Math.min(100, Math.round((activeSession.totalSetsCompleted / totalSetsPlanned) * 100))
      : 0;

  const safeIdx = Math.min(
    Math.max(0, selectedExerciseIdx),
    Math.max(0, activeSession.exercises.length - 1),
  );
  const substituteTarget =
    activeSession.exercises.find((e) => e.clientExerciseId === showSubstituteFor) ?? null;
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
      ? Math.max(
          0,
          Math.min(100, Math.round((restInfo.remainingSeconds / restInfo.totalSeconds) * 100)),
        )
      : 0;

  const exerciseBlocks = groupExercisesIntoBlocks(activeSession.exercises);

  const sessionSuggestion =
    suggestionsEnabled && activeSession.exercises.length > 0
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
          dismissed: dismissedSuggestions,
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

  const openSubstitute = (ex: SessionExerciseDto) => {
    setSubstituteSearch('');
    setShowSubstituteFor(ex.clientExerciseId);
  };

  const exerciseSwipeActions = (
    ex: SessionExerciseDto,
  ): Pick<React.ComponentProps<typeof SwipeRow>, 'leadingActions' | 'trailingActions'> => ({
    leadingActions: [
      {
        id: 'swap',
        label: t.session.swapAlternativeBtn,
        icon: ArrowRightLeft,
        tone: 'neutral',
        testId: `swipe-swap-${ex.clientExerciseId}`,
        onSelect: () => openSubstitute(ex),
      },
      {
        id: 'skip',
        label:
          ex.status === SessionExerciseStatus.SKIPPED ? t.session.unskipBtn : t.session.skipBtn,
        icon: SkipForward,
        tone: 'accent',
        testId: `swipe-skip-${ex.clientExerciseId}`,
        onSelect: () => void skipExercise(ex.clientExerciseId),
      },
    ],
    trailingActions: [
      {
        id: 'remove',
        label: t.common.delete,
        icon: Trash2,
        tone: 'destructive',
        testId: `swipe-remove-${ex.clientExerciseId}`,
        onSelect: () => void removeExerciseFromSession(ex.clientExerciseId),
      },
    ],
  });

  /** Same actions as the swipe, for every input: pointer, keyboard, touch and screen readers. */
  const renderExerciseMenu = (ex: SessionExerciseDto, idx: number) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={format(t.workouts.moreActionsLabel, { name: ex.exerciseNameSnapshot })}
          className="text-muted-foreground -mt-1 -mr-1 size-11 shrink-0"
        >
          <MoreHorizontal className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => openSubstitute(ex)}>
          <ArrowRightLeft /> {t.session.swapAlternativeBtn}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void skipExercise(ex.clientExerciseId)}>
          <SkipForward />
          {ex.status === SessionExerciseStatus.SKIPPED ? t.session.unskipBtn : t.session.skipBtn}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={idx === 0}
          onSelect={() => void reorderExercise(ex.clientExerciseId, 'UP')}
        >
          <ArrowUp /> {t.session.moveEarlierTitle}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={idx === activeSession.exercises.length - 1}
          onSelect={() => void reorderExercise(ex.clientExerciseId, 'DOWN')}
        >
          <ArrowDown /> {t.session.moveLaterTitle}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => void removeExerciseFromSession(ex.clientExerciseId)}
        >
          <Trash2 /> {t.session.removeFromSessionTitle}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const progressionFor = (ex: SessionExerciseDto) => {
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
    return {
      catEx,
      insight,
      suggestions: alignSetSuggestions(ex, insight),
      labels: getSetBadgeLabels(ex.sets),
    };
  };

  const renderLastSessionLine = (insight: ReturnType<typeof progressionFor>['insight']) => (
    <p className="text-muted-foreground text-[0.8125rem] tabular-nums">
      {insight.lastSession ? (
        <>
          {format(t.session.lastSessionFrom, { name: insight.lastSession.workoutName })}:{' '}
          <span className="text-foreground">
            {insight.lastSession.workingSets
              .slice(0, 4)
              .map(
                (ws) =>
                  `${ws.weightNormalized} ${activeSession.weightUnit.toLowerCase()} × ${ws.reps}`,
              )
              .join(' · ')}
          </span>
        </>
      ) : (
        t.session.firstLoggedSession
      )}
    </p>
  );

  const renderStatusChips = (ex: SessionExerciseDto) => {
    const chips = [
      ex.origin === SessionExerciseOrigin.SUBSTITUTED
        ? format(t.session.replacedBadge, { name: ex.replacedExerciseName ?? '' })
        : null,
      ex.origin === SessionExerciseOrigin.ADDED ? t.session.addedUnplannedBadge : null,
      ex.status === SessionExerciseStatus.SKIPPED ? t.session.skippedBadge : null,
    ].filter((c): c is string => Boolean(c));
    return chips.length > 0 ? (
      <p className="text-warning mt-0.5 text-[0.8125rem] font-medium">{chips.join(' · ')}</p>
    ) : null;
  };

  const renderCollapsedExerciseHeader = (ex: SessionExerciseDto, idx: number) => {
    const doneSets = ex.sets.filter((s) => s.completed).length;
    const isCompleted = ex.status === SessionExerciseStatus.COMPLETED;
    const isSkipped = ex.status === SessionExerciseStatus.SKIPPED;
    const catEx = catalog.find((c) => c.id === ex.exerciseId);

    return (
      <SwipeRow
        key={ex.clientExerciseId}
        className="rounded-[1.25rem]"
        {...exerciseSwipeActions(ex)}
      >
        <button
          type="button"
          data-testid={`vertical-exercise-row-${idx + 1}`}
          onClick={() => setSelectedExerciseIdx(idx)}
          className={`bg-card flex w-full items-center justify-between gap-3 rounded-[1.25rem] p-3 text-left transition-colors ${
            isSkipped ? 'opacity-60' : 'hover:bg-secondary/40'
          }`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={`tabular-nums flex size-8 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-semibold ${
                isCompleted ? 'bg-success text-success-foreground' : 'bg-secondary text-foreground'
              }`}
            >
              {isCompleted ? <Check className="h-4 w-4 stroke-[3]" /> : idx + 1}
            </span>

            <ExerciseVisual
              exercise={{
                id: ex.exerciseId ?? ex.clientExerciseId,
                slug: catEx?.slug,
                name: ex.exerciseNameSnapshot,
                primaryMuscleGroup: ex.primaryMuscleSnapshot,
                media: catEx?.media,
                isSystem: catEx?.isSystem,
              }}
              variant="thumbnail"
              className="h-10 w-12 shrink-0"
            />

            <div className="min-w-0">
              <p className={`truncate text-[0.9375rem] font-medium ${isSkipped ? 'line-through' : ''}`}>
                {ex.exerciseNameSnapshot}
              </p>
              <p className="text-muted-foreground truncate text-[0.8125rem] tabular-nums">
                {muscleLabel(ex.primaryMuscleSnapshot)} · {formatExercisePillText(ex)}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="text-muted-foreground text-[0.8125rem] tabular-nums">
              {doneSets}/{ex.sets.length}
            </span>
            <ChevronRight className="text-muted-foreground h-4 w-4" />
          </div>
        </button>
      </SwipeRow>
    );
  };

  const renderExpandedExerciseCard = (ex: SessionExerciseDto, idx: number) => {
    const { catEx, insight, suggestions, labels } = progressionFor(ex);
    const repsText =
      ex.targetRepsMin && ex.targetRepsMax && ex.targetRepsMin !== ex.targetRepsMax
        ? `${ex.targetRepsMin}–${ex.targetRepsMax}`
        : `${ex.targetRepsMin ?? 10}`;
    const goalLine = [
      muscleLabel(ex.primaryMuscleSnapshot),
      `${ex.plannedSets}×${repsText}${ex.targetWeight ? ` · ${ex.targetWeight} ${activeSession.weightUnit.toLowerCase()}` : ''}`,
      ex.restSeconds > 0
        ? `${ex.restSeconds} ${t.common.sec} ${t.session.restIntervalLabel.toLowerCase()}`
        : null,
    ]
      .filter(Boolean)
      .join(' · ');

    return (
      <section
        key={ex.clientExerciseId}
        data-testid={`active-exercise-card-${idx + 1}`}
        className="bg-card space-y-3 rounded-[1.25rem] p-4"
      >
        <SwipeRow className="-m-1 rounded-xl" {...exerciseSwipeActions(ex)}>
          <div data-testid={`exercise-header-${idx + 1}`} className="flex items-start gap-3 p-1">
            <ExerciseVisual
              exercise={{
                id: ex.exerciseId,
                slug: catEx?.slug,
                name: ex.exerciseNameSnapshot,
                primaryMuscleGroup: ex.primaryMuscleSnapshot,
                media: catEx?.media,
                isSystem: catEx?.isSystem,
              }}
              variant="thumbnail"
              className="h-14 w-16"
            />
            <div className="min-w-0 flex-1">
              <h2 className="text-[1.25rem] leading-snug font-semibold">{ex.exerciseNameSnapshot}</h2>
              <p className="text-muted-foreground text-[0.8125rem] tabular-nums">{goalLine}</p>
              {renderStatusChips(ex)}
            </div>
            {renderExerciseMenu(ex, idx)}
          </div>
        </SwipeRow>

        {renderLastSessionLine(insight)}

        {ex.notes && (
          <p className="bg-secondary text-secondary-foreground rounded-xl px-3 py-2 text-[0.8125rem]">
            {format(t.session.notePrefix, { note: ex.notes })}
          </p>
        )}

        <div className="divide-border/60 divide-y">
          {ex.sets.map((set, sIdx) => (
            <SessionSetRow
              key={set.clientSetId}
              exercise={ex}
              set={set}
              setIndex={sIdx}
              badgeLabel={labels[sIdx] ?? String(sIdx + 1)}
              suggestion={suggestions[sIdx] ?? null}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void addSetToExercise(ex.clientExerciseId, SetType.WORKING)}
            className="font-bold"
          >
            <Plus className="h-3.5 w-3.5" /> {t.session.addWorkingSetBtn}
          </Button>

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
      </section>
    );
  };

  /**
   * Supersets are logged round by round: set 1 of every exercise sits directly together, so
   * finishing A1 puts B1 right underneath instead of in another card further down.
   */
  const renderSupersetBlock = (block: ExerciseRenderBlock<SessionExerciseDto>) => {
    const members = block.items.map(({ item: ex, globalIndex }, i) => ({
      ex,
      globalIndex,
      letter: String.fromCharCode(65 + i),
      ...progressionFor(ex),
    }));
    const rounds = Math.max(0, ...members.map((m) => m.ex.sets.length));

    return (
      <div
        key={`active-superset-${block.startIndex}`}
        data-testid="active-superset-block"
        className="bg-secondary/60 overflow-hidden rounded-[1.25rem]"
      >
        <div className="text-foreground flex items-center justify-between gap-2 px-4 pt-3.5 pb-1">
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
          <Zap aria-hidden="true" className="text-primary h-4 w-4 shrink-0" />
        </div>

        <div className="space-y-2.5 p-3">
          {members.map(({ ex, globalIndex, letter, catEx, insight }) => (
            <SwipeRow
              key={ex.clientExerciseId}
              className="rounded-[1.25rem]"
              {...exerciseSwipeActions(ex)}
            >
              <div
                data-testid={`superset-exercise-${letter}`}
                className={`bg-card space-y-1.5 rounded-[1.25rem] p-3 ${
                  ex.status === SessionExerciseStatus.SKIPPED ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="bg-primary/12 text-primary flex size-8 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-bold">
                    {letter}
                  </span>
                  <ExerciseVisual
                    exercise={{
                      id: ex.exerciseId ?? ex.clientExerciseId,
                      slug: catEx?.slug,
                      name: ex.exerciseNameSnapshot,
                      primaryMuscleGroup: ex.primaryMuscleSnapshot,
                      media: catEx?.media,
                      isSystem: catEx?.isSystem,
                    }}
                    variant="thumbnail"
                    className="h-10 w-12 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-[0.9375rem] font-semibold ${
                        ex.status === SessionExerciseStatus.SKIPPED ? 'line-through' : ''
                      }`}
                    >
                      {ex.exerciseNameSnapshot}
                    </p>
                    <p className="text-muted-foreground truncate text-[0.8125rem] tabular-nums">
                      {muscleLabel(ex.primaryMuscleSnapshot)} · {formatExercisePillText(ex)}
                    </p>
                    {renderStatusChips(ex)}
                  </div>
                  {renderExerciseMenu(ex, globalIndex)}
                </div>
                {renderLastSessionLine(insight)}
                {ex.notes && (
                  <p className="bg-secondary text-secondary-foreground rounded-xl px-3 py-2 text-[0.8125rem]">
                    {format(t.session.notePrefix, { note: ex.notes })}
                  </p>
                )}
              </div>
            </SwipeRow>
          ))}

          {Array.from({ length: rounds }, (_, r) => (
            <div
              key={r}
              data-testid={`superset-round-${r + 1}`}
              className="bg-card rounded-[1.25rem] px-3 pt-2.5 pb-1.5"
            >
              <p className="text-muted-foreground text-[0.8125rem] font-semibold tabular-nums">
                {format(t.session.supersetRoundLabel, { round: r + 1, total: rounds })}
              </p>
              <div className="divide-border/60 divide-y">
                {members.map(({ ex, letter, labels, suggestions }) => {
                  const set = ex.sets[r];
                  const contextLabel = `${letter} · ${ex.exerciseNameSnapshot}`;
                  return set ? (
                    <SessionSetRow
                      key={set.clientSetId}
                      exercise={ex}
                      set={set}
                      setIndex={r}
                      badgeLabel={labels[r] ?? String(r + 1)}
                      suggestion={suggestions[r] ?? null}
                      contextLabel={contextLabel}
                      testId={`superset-set-row-${letter}${r + 1}`}
                    />
                  ) : (
                    <p
                      key={`${ex.clientExerciseId}-missing-${r}`}
                      className="text-muted-foreground py-2.5 pl-11 text-[0.8125rem]"
                    >
                      {contextLabel} · –
                    </p>
                  );
                })}
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              void addSetToExercise(
                members.map((m) => m.ex.clientExerciseId),
                SetType.WORKING,
              )
            }
            className="bg-card font-bold"
          >
            <Plus className="h-3.5 w-3.5" /> {t.session.addSupersetRoundBtn}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 pb-36 md:pb-16">
      <header className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <p
              className={`text-[0.8125rem] font-semibold ${
                activeSession.status === SessionStatus.PAUSED ? 'text-warning' : 'text-primary'
              }`}
            >
              {activeSession.status === SessionStatus.PAUSED
                ? t.session.pausedBadge
                : t.session.liveSessionBadge}
            </p>
            <h1 className="text-[1.75rem] leading-tight font-bold">
              {activeSession.workoutNameSnapshot}
            </h1>
          </div>
          {activeSession.status === SessionStatus.PAUSED ? (
            <Button
              type="button"
              size="sm"
              onClick={() => void resumeSession()}
              className="shrink-0"
            >
              <Play className="h-4 w-4 fill-current" /> {t.session.resumeBtn}
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void pauseSession()}
              className="shrink-0"
            >
              <Pause className="h-4 w-4" /> {t.session.pauseBtn}
            </Button>
          )}
        </div>

        <div className="bg-card space-y-3 rounded-[1.25rem] p-4">
          <dl className="grid grid-cols-3 gap-2">
            <div>
              <dt className="text-muted-foreground text-[0.8125rem]">{t.session.elapsedLabel}</dt>
              <dd className="font-rounded text-[1.375rem] font-semibold">
                {formatTimer(elapsedSeconds)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[0.8125rem]">{t.session.completedSetsLabel}</dt>
              <dd className="font-rounded text-[1.375rem] font-semibold">
                {activeSession.totalSetsCompleted}
                <span className="text-muted-foreground text-[0.9375rem] font-medium">
                  {' '}
                  / {totalSetsPlanned}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[0.8125rem]">{t.session.totalVolumeLabel}</dt>
              <dd className="font-rounded text-[1.375rem] font-semibold">
                {formatVolume(activeSession.totalVolumeKg, activeSession.weightUnit)}
                <span className="text-muted-foreground text-[0.9375rem] font-medium">
                  {' '}
                  {unitLabel(activeSession.weightUnit)}
                </span>
              </dd>
            </div>
          </dl>
          <Progress
            value={progressPct}
            aria-label={`${t.session.progressLabel} ${progressPct}%`}
            className="bg-secondary h-1.5"
          />
          {nextExercise && (
            <p className="text-muted-foreground truncate text-[0.8125rem]">
              {t.session.nextUpLabel}
              <span className="text-foreground font-medium">
                {nextExercise.exerciseNameSnapshot}
              </span>
            </p>
          )}
        </div>
      </header>

      {/* Vertical Collapsible Exercise Stack (Eliminates Horizontal Scrolling) */}
      {activeSession.exercises.length > 0 ? (
        <div data-testid="vertical-exercise-stack" className="space-y-3">
          {exerciseBlocks.map((block) => {
            if (block.type === 'superset') return renderSupersetBlock(block);

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
                await dismissSuggestion(sug);
                await addExerciseToSession(sug.suggestedExercise.id);
                setSelectedExerciseIdx(activeSession.exercises.length);
              }}
              onSwap={
                sessionSuggestion.stallingExerciseId
                  ? async (sug) => {
                      const targetEx = activeSession.exercises.find(
                        (e) => e.exerciseId === sug.stallingExerciseId,
                      );
                      if (targetEx) {
                        await dismissSuggestion(sug);
                        await substituteExercise(
                          targetEx.clientExerciseId,
                          sug.suggestedExercise.id,
                        );
                      }
                    }
                  : undefined
              }
              onDismiss={() => void dismissSuggestion(sessionSuggestion)}
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
              className="w-full sm:w-auto sm:px-6"
            >
              <Plus className="h-4 w-4" /> {t.session.addExerciseBtn}
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
      <section className="bg-card space-y-4 rounded-[1.25rem] p-4">
        <div className="space-y-1.5">
          <Label htmlFor="session-notes" className="text-muted-foreground text-[0.8125rem] font-medium">
            {t.session.sessionNotesLabel}
          </Label>
          <Input
            id="session-notes"
            value={sessionNotes}
            onChange={(e) => setSessionNotes(e.target.value)}
            placeholder={t.session.sessionNotesPlaceholder}
          />
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowAbandonConfirm(true)}
            className="text-destructive hover:bg-destructive/10"
          >
            {t.session.abandonSessionBtn}
          </Button>

          <Button
            type="button"
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
                      volume: formatVolume(finished.totalVolumeKg, finished.weightUnit),
                      unit: unitLabel(finished.weightUnit),
                    }),
                    tag: 'luki-fitti-workout-complete',
                    playSound: user?.preferences?.restTimerSound ?? true,
                    showToast: true,
                  });
                }
              }
            }}
            size="lg"
            className="w-full sm:w-auto"
          >
            <CheckCircle2 className="h-4 w-4" />
            {t.session.finishSaveWorkoutBtn}
          </Button>
        </div>
      </section>

      {/* Floating rest timer: full controls while resting, a single preset row when idle */}
      <div
        data-testid="sticky-rest-timer-dock"
        className="fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-md md:sticky md:inset-x-auto md:bottom-6 md:max-w-none"
      >
        <Card className="material-bar border-border/60 overflow-hidden rounded-[1.5rem] border px-3 py-2 shadow-[0_8px_30px_rgb(0_0_0/0.12)] sm:px-4">
          {(restInfo.isRunning || restInfo.isPaused) && restInfo.totalSeconds > 0 && (
            <div className="bg-secondary -mx-3 -mt-2 mb-2 h-1 overflow-hidden sm:-mx-4">
              <div
                className="bg-primary h-full transition-[width] duration-300"
                style={{ width: `${restProgressPct}%` }}
              />
            </div>
          )}

          {restInfo.isRunning || restInfo.isPaused ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-muted-foreground text-[0.8125rem] font-medium">
                  {restInfo.isRunning ? t.session.restTimerActive : t.session.restTimerPaused}
                </p>
                <p className="font-rounded text-[1.375rem] leading-tight font-semibold">
                  {formatTimer(restInfo.remainingSeconds)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11 px-3"
                  onClick={() => void adjustRestTimer(-15)}
                >
                  -15s
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11 px-3"
                  onClick={() => void adjustRestTimer(15)}
                >
                  +15s
                </Button>
                {restInfo.isPaused ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    aria-label={t.session.resumeBtn}
                    onClick={() => void resumeRestTimer()}
                  >
                    <Play className="h-4 w-4 fill-current" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    aria-label={t.session.pauseBtn}
                    onClick={() => void pauseRestTimer()}
                  >
                    <Pause className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  type="button"
                  size="icon"
                  aria-label={t.session.skipRestBtn}
                  title={t.session.skipRestBtn}
                  onClick={() => void skipRestTimer()}
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            /* Idle: one quiet row of presets instead of a 0:00 clock. */
            <div className="flex items-center justify-between gap-2">
              <p className="text-muted-foreground flex items-center gap-1.5 text-[0.8125rem] font-medium">
                <Timer aria-hidden="true" className="h-4 w-4" />
                {t.session.restStartLabel}
              </p>
              <div className="flex shrink-0 items-center gap-1.5">
                {[60, 90, 150].map((sec) => (
                  <Button
                    key={sec}
                    type="button"
                    variant="secondary"
                    className="h-11 px-3.5"
                    onClick={() => void startRestTimer(sec)}
                  >
                    {sec === 150 ? '2:30' : `${sec}s`}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Substitute / Replace Exercise Modal */}
      <Dialog
        open={Boolean(substituteTarget)}
        onOpenChange={(open) => {
          if (!open) setShowSubstituteFor(null);
        }}
      >
        <DialogContent className="max-h-[88dvh] overflow-hidden p-4 sm:max-w-md sm:p-5">
          {substituteTarget && (
            <div className="flex max-h-[calc(88dvh-2.5rem)] min-w-0 flex-col gap-3 overflow-hidden">
              <DialogHeader className="shrink-0">
                <DialogTitle className="font-display text-lg font-bold">
                  {format(t.session.replaceModalTitle, {
                    name: substituteTarget.exerciseNameSnapshot,
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
                {!substituteSearch.trim() && substituteTarget.alternativeExerciseIds.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-primary text-xs font-bold">
                      {t.session.predefinedAlternatives}
                    </p>
                    {substituteTarget.alternativeExerciseIds.map((altId) => {
                      const alt = catalog.find((c) => c.id === altId);
                      if (!alt) return null;
                      return (
                        <Button
                          key={alt.id}
                          type="button"
                          variant="outline"
                          onClick={async () => {
                            await substituteExercise(substituteTarget.clientExerciseId, alt.id);
                            setShowSubstituteFor(null);
                          }}
                          className="bg-primary/12 border-primary/40 hover:bg-primary/12 flex h-auto w-full items-center justify-between rounded-2xl p-3.5 text-left text-xs font-bold"
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
                          muscle: muscleLabel(substituteTarget.primaryMuscleSnapshot),
                        })}
                  </p>
                  {filterExercisesByQuery(
                    catalog.filter((c) => c.id !== substituteTarget.exerciseId),
                    substituteSearch,
                    substituteSearch.trim() ? 'ALL' : substituteTarget.primaryMuscleSnapshot,
                  ).map((alt) => (
                    <Button
                      key={alt.id}
                      type="button"
                      variant="secondary"
                      onClick={async () => {
                        await substituteExercise(substituteTarget.clientExerciseId, alt.id);
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
