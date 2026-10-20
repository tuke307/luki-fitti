'use client';

import React, { useState } from 'react';
import {
  Folder,
  FolderPlus,
  Plus,
  Play,
  Copy,
  Trash2,
  Edit3,
  ArrowUp,
  ArrowDown,
  ArrowRightLeft,
  Dumbbell,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Zap,
  History,
  Calendar,
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@luki-fitti/ui/components/ui/collapsible';
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
import { toast } from '@luki-fitti/ui/components/ui/sonner';
import { useAuth } from '@/providers/auth/auth-context';
import { useGym } from '@/providers/gym/gym-context';
import { useLocale } from '@/providers/i18n/locale-context';
import {
  computeWorkoutExerciseSuggestion,
  formatDate,
  formatDateTime,
  formatRestDurationMinSec,
  groupExercisesIntoBlocks,
  type WorkoutExerciseSuggestion,
} from '@luki-fitti/common/utils/client';
import { SessionStatus } from '@luki-fitti/common/enums';
import { ExercisePicker } from './exercise-picker';
import { ExerciseVisual } from './exercise-visual';
import { NumberInput } from './number-input';
import { RainbowExerciseSuggestionCard } from './rainbow-suggestion-card';
import type {
  TemplateExerciseInputDto,
  WorkoutFolderDto,
  WorkoutTemplateDto,
} from '@luki-fitti/common/schemas';

interface WorkoutsViewProps {
  onStartSessionNavigation: () => void;
}

export function WorkoutsView({ onStartSessionNavigation }: WorkoutsViewProps) {
  const {
    catalog,
    folders,
    unfiledTemplates,
    historySessions,
    weightUnit,
    createFolder,
    renameFolder,
    reorderFolder,
    deleteFolder,
    createTemplate,
    updateTemplate,
    duplicateTemplate,
    moveTemplate,
    deleteTemplate,
    startWorkoutFromTemplate,
  } = useGym();
  const { user } = useAuth();
  const { t, format, muscleLabel } = useLocale();
  const suggestionsEnabled = user?.preferences?.exerciseSuggestionsEnabled ?? true;

  const [dismissedSuggestions, setDismissedSuggestions] = useState<Record<string, boolean>>({});
  const [builderSuggestionDismissed, setBuilderSuggestionDismissed] = useState(false);

  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderColor, setFolderColor] = useState('#CCFF00');

  const [editingTemplate, setEditingTemplate] = useState<WorkoutTemplateDto | null>(null);
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplDesc, setTplDesc] = useState('');
  const [tplFolderId, setTplFolderId] = useState<string | null>(null);
  const [tplDurationMin, setTplDurationMin] = useState(60);
  const [tplExercises, setTplExercises] = useState<TemplateExerciseInputDto[]>([]);

  const [confirmDelete, setConfirmDelete] = useState<{
    type: 'folder' | 'template';
    id: string;
    name: string;
  } | null>(null);

  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [highlightedTemplateId, setHighlightedTemplateId] = useState<string | null>(null);

  const toggleFolderCollapsed = (folderId: string) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  const allFolderIds = [
    ...folders.map((f) => f.id),
    ...(unfiledTemplates.length > 0 ? ['__unfiled__'] : []),
  ];
  const areAllCollapsed =
    allFolderIds.length > 0 && allFolderIds.every((id) => Boolean(collapsedFolders[id]));

  const toggleAllFolders = () => {
    if (areAllCollapsed) {
      setCollapsedFolders({});
    } else {
      const next: Record<string, boolean> = {};
      for (const id of allFolderIds) {
        next[id] = true;
      }
      setCollapsedFolders(next);
    }
  };

  const openNewTemplateBuilder = (defaultFolderId: string | null = null) => {
    setEditingTemplate(null);
    setBuilderSuggestionDismissed(false);
    setTplName('');
    setTplDesc('');
    setTplFolderId(defaultFolderId);
    setTplDurationMin(60);
    const firstEx = catalog[0];
    setTplExercises(
      firstEx
        ? [
            {
              exerciseId: firstEx.id,
              orderIndex: 0,
              plannedSets: 3,
              warmupSets: 1,
              targetRepsMin: 8,
              targetRepsMax: 12,
              targetWeight: 60,
              weightUnit,
              restSeconds: 90,
              targetDurationSeconds: null,
              targetDistanceMeters: null,
              notes: '',
              alternativeExerciseIds: firstEx.alternativeExerciseIds.slice(0, 2),
            },
          ]
        : [],
    );
    setShowTemplateBuilder(true);
  };

  const openEditTemplateBuilder = (tpl: WorkoutTemplateDto) => {
    setEditingTemplate(tpl);
    setBuilderSuggestionDismissed(false);
    setTplName(tpl.name);
    setTplDesc(tpl.description ?? '');
    setTplFolderId(tpl.folderId);
    setTplDurationMin(tpl.estimatedDurationMinutes ?? 60);
    setTplExercises(
      tpl.exercises.map((ex, idx) => ({
        id: ex.id,
        exerciseId: ex.exerciseId,
        orderIndex: idx,
        plannedSets: ex.plannedSets,
        warmupSets: ex.warmupSets,
        targetRepsMin: ex.targetRepsMin,
        targetRepsMax: ex.targetRepsMax,
        targetWeight: ex.targetWeight,
        weightUnit: ex.weightUnit,
        restSeconds: ex.restSeconds,
        targetDurationSeconds: ex.targetDurationSeconds,
        targetDistanceMeters: ex.targetDistanceMeters,
        notes: ex.notes ?? '',
        alternativeExerciseIds: ex.alternativeExerciseIds ?? [],
      })),
    );
    setShowTemplateBuilder(true);
  };

  const handleSaveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;
    if (editingFolderId) {
      await renameFolder(editingFolderId, folderName.trim(), folderColor);
    } else {
      await createFolder({ name: folderName.trim(), color: folderColor });
    }
    setFolderName('');
    setEditingFolderId(null);
    setShowFolderModal(false);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplName.trim()) return;
    const payload = {
      name: tplName.trim(),
      description: tplDesc.trim() || null,
      folderId: tplFolderId,
      estimatedDurationMinutes: tplDurationMin,
      exercises: tplExercises.map((ex, idx) => ({ ...ex, orderIndex: idx })),
    };

    if (editingTemplate) {
      await updateTemplate(editingTemplate.id, payload);
    } else {
      await createTemplate(payload);
    }
    setShowTemplateBuilder(false);
    setEditingTemplate(null);
  };

  const handleDuplicateTemplate = async (tpl: WorkoutTemplateDto) => {
    const duplicated = await duplicateTemplate(tpl.id);
    if (!duplicated) return;

    toast.success(format(t.workouts.duplicatedToast, { name: duplicated.name }));
    setHighlightedTemplateId(duplicated.id);

    window.setTimeout(() => {
      setHighlightedTemplateId((prev) => (prev === duplicated.id ? null : prev));
    }, 2600);

    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        const el = document.querySelector<HTMLElement>(`[data-template-id="${duplicated.id}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.focus({ preventScroll: true });
        }
      }, 60);
    });
  };

  const getTemplateSessionStats = (tpl: WorkoutTemplateDto) => {
    const matched = historySessions.filter(
      (s) =>
        s.status === SessionStatus.COMPLETED &&
        (s.templateId
          ? s.templateId === tpl.id
          : s.workoutNameSnapshot.trim().toLowerCase() === tpl.name.trim().toLowerCase()),
    );
    const sorted = [...matched].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return {
      totalCount: matched.length,
      lastSessionDate: sorted[0]?.startedAt ?? null,
    };
  };

  const getFolderSessionStats = (folder: WorkoutFolderDto) => {
    const tplIds = new Set(folder.templates.map((t) => t.id));
    const matched = historySessions.filter(
      (s) => s.status === SessionStatus.COMPLETED && s.templateId && tplIds.has(s.templateId),
    );
    const sorted = [...matched].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return {
      totalCount: matched.length,
      lastSessionDate: sorted[0]?.startedAt ?? null,
      lastWorkoutName: sorted[0]?.workoutNameSnapshot ?? null,
    };
  };

  const handleAddSuggestionToTemplate = async (
    tpl: WorkoutTemplateDto,
    suggestion: WorkoutExerciseSuggestion,
  ) => {
    const existingExercises: TemplateExerciseInputDto[] = tpl.exercises.map((ex, idx) => ({
      id: ex.id,
      exerciseId: ex.exerciseId,
      orderIndex: idx,
      plannedSets: ex.plannedSets,
      warmupSets: ex.warmupSets,
      targetRepsMin: ex.targetRepsMin,
      targetRepsMax: ex.targetRepsMax,
      targetWeight: ex.targetWeight,
      weightUnit: ex.weightUnit,
      restSeconds: ex.restSeconds,
      targetDurationSeconds: ex.targetDurationSeconds,
      targetDistanceMeters: ex.targetDistanceMeters,
      notes: ex.notes ?? '',
      alternativeExerciseIds: ex.alternativeExerciseIds ?? [],
    }));

    const newSlot: TemplateExerciseInputDto = {
      exerciseId: suggestion.suggestedExercise.id,
      orderIndex: existingExercises.length,
      plannedSets: suggestion.recommendedSets,
      warmupSets: 0,
      targetRepsMin: suggestion.recommendedRepsMin,
      targetRepsMax: suggestion.recommendedRepsMax,
      targetWeight: suggestion.recommendedWeight,
      weightUnit,
      restSeconds: suggestion.recommendedRestSeconds,
      targetDurationSeconds: null,
      targetDistanceMeters: null,
      notes: '',
      alternativeExerciseIds: suggestion.suggestedExercise.alternativeExerciseIds.slice(0, 2),
    };

    await updateTemplate(tpl.id, {
      name: tpl.name,
      description: tpl.description,
      folderId: tpl.folderId,
      estimatedDurationMinutes: tpl.estimatedDurationMinutes ?? 60,
      exercises: [...existingExercises, newSlot],
    });
  };

  const renderTemplateCard = (tpl: WorkoutTemplateDto) => {
    const tplStats = getTemplateSessionStats(tpl);
    const isHighlighted = highlightedTemplateId === tpl.id;
    const blocks = groupExercisesIntoBlocks(tpl.exercises);
    const folderName = folders.find((f) => f.id === tpl.folderId)?.name ?? null;

    const templateSuggestion =
      suggestionsEnabled && !dismissedSuggestions[tpl.id]
        ? computeWorkoutExerciseSuggestion({
            workoutName: tpl.name,
            folderName,
            exercises: tpl.exercises.map((ex) => {
              const exObj = ex.exercise ?? catalog.find((c) => c.id === ex.exerciseId);
              return {
                exerciseId: ex.exerciseId,
                exerciseName: exObj?.name ?? null,
                primaryMuscleGroup: exObj?.primaryMuscleGroup ?? null,
                plannedSets: ex.plannedSets,
                targetRepsMin: ex.targetRepsMin,
                targetRepsMax: ex.targetRepsMax,
                targetWeight: ex.targetWeight,
              };
            }),
            catalog,
            historySessions,
            weightUnit,
          })
        : null;

    const formatTargetPillText = (ex: WorkoutTemplateDto['exercises'][number]) => {
      const repsPart =
        ex.targetRepsMin && ex.targetRepsMax && ex.targetRepsMin !== ex.targetRepsMax
          ? `${ex.targetRepsMin}–${ex.targetRepsMax}`
          : `${ex.targetRepsMin ?? 10}`;
      const weightPart = ex.targetWeight
        ? ` ${ex.targetWeight} ${weightUnit.toLowerCase()}`
        : '';
      return `${ex.plannedSets}×${repsPart}${weightPart}`;
    };

    return (
      <Card
        key={tpl.id}
        data-template-id={tpl.id}
        data-testid={`template-card-${tpl.name}`}
        tabIndex={-1}
        className={`hover:border-primary/40 min-w-0 justify-between overflow-hidden p-4 transition duration-300 outline-none sm:p-5 ${
          isHighlighted ? 'border-primary ring-primary/40 ring-2' : ''
        }`}
      >
        <div>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-display text-base font-bold sm:text-lg">{tpl.name}</h3>
              {tpl.description && (
                <p className="text-muted-foreground mt-0.5 text-xs">{tpl.description}</p>
              )}
            </div>
            <Badge variant="secondary" className="font-mono-tabular shrink-0 px-2.5 py-1 text-xs">
              {tpl.exercises.length} ex • ~{tpl.estimatedDurationMinutes ?? 60}m
            </Badge>
          </div>

          {/* Session Telemetry Strip: Total Completed & Last Session Date */}
          <div className="bg-secondary/40 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs">
            <span className="flex items-center gap-1.5 font-semibold">
              <History className="text-primary h-3.5 w-3.5 shrink-0" />
              {t.workouts.totalLabel}{' '}
              <strong className="font-mono-tabular text-primary">
                {tplStats.totalCount}{' '}
                {tplStats.totalCount === 1 ? t.common.session : t.common.sessions}
              </strong>
            </span>
            <span className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              {t.workouts.lastLabel}{' '}
              <strong className="font-mono-tabular text-foreground">
                {tplStats.lastSessionDate
                  ? formatDateTime(tplStats.lastSessionDate)
                  : t.workouts.neverTrained}
              </strong>
            </span>
          </div>

          {/* Ordered Exercise List Preview (Gymlife-style Rows & Superset Containers) */}
          <div className="mt-3.5 space-y-2.5">
            {blocks.map((block) => {
              if (block.type === 'superset') {
                return (
                  <div
                    key={`superset-${block.startIndex}`}
                    data-testid="superset-block-card"
                    className="border-accent/40 bg-card overflow-hidden rounded-2xl border shadow-sm"
                  >
                    {/* Gymlife Dark Superset Header Banner */}
                    <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-zinc-950 px-3.5 py-2.5 text-white">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-extrabold tracking-wide uppercase">
                          <span className="text-accent">{t.workouts.supersetHeaderLabel}</span>
                          <span className="font-mono-tabular text-white">
                            {format(t.workouts.supersetRoundsFormat, { rounds: block.rounds })}
                          </span>
                        </div>
                        <p className="font-mono-tabular mt-0.5 text-[11px] text-zinc-300">
                          {format(t.workouts.supersetSubtitleFormat, {
                            rest: formatRestDurationMinSec(block.roundRestSeconds),
                          })}
                        </p>
                      </div>
                      <Badge
                        variant="accent"
                        className="px-2 py-0.5 text-[10px] font-bold uppercase"
                      >
                        <Zap className="h-2.5 w-2.5" /> {block.items.length} ex
                      </Badge>
                    </div>

                    {/* Grouped Superset Exercise Rows */}
                    <div className="divide-border/60 divide-y">
                      {block.items.map(({ item: ex, globalIndex, stepNumber }) => {
                        const exObj = ex.exercise ?? catalog.find((c) => c.id === ex.exerciseId);
                        const altNames = (ex.alternativeExerciseIds ?? [])
                          .map((id) => catalog.find((c) => c.id === id)?.name)
                          .filter(Boolean);

                        return (
                          <div
                            key={ex.id ?? globalIndex}
                            className="bg-secondary/25 flex items-center justify-between gap-2.5 px-3 py-2.5 text-xs"
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div className="relative shrink-0">
                                <span
                                  data-testid="superset-step-badge"
                                  className="text-accent font-mono-tabular absolute -top-1 -left-1 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-white/15 bg-zinc-950 text-[10px] font-black shadow-sm"
                                >
                                  {stepNumber}
                                </span>
                                {exObj && (
                                  <ExerciseVisual
                                    exercise={exObj}
                                    variant="thumbnail"
                                    className="h-10 w-12"
                                  />
                                )}
                              </div>

                              <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="truncate font-semibold">
                                    {exObj?.name ?? 'Exercise'}
                                  </span>
                                  {exObj && (
                                    <span className="text-muted-foreground text-[10px]">
                                      ({muscleLabel(exObj.primaryMuscleGroup)})
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="bg-accent/20 text-accent font-mono-tabular inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-extrabold">
                                    {formatTargetPillText(ex)}
                                  </span>
                                  {altNames.length > 0 && (
                                    <Badge
                                      variant="default"
                                      title={format(t.workouts.backupsTitle, {
                                        names: altNames.join(', '),
                                      })}
                                      className="px-1.5 py-0.5 text-[10px]"
                                    >
                                      <ArrowRightLeft className="h-2.5 w-2.5" />
                                      {altNames.length}{' '}
                                      {altNames.length > 1
                                        ? t.workouts.backupPlural
                                        : t.workouts.backupSingular}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              const { item: ex, globalIndex } = block.items[0]!;
              const exObj = ex.exercise ?? catalog.find((c) => c.id === ex.exerciseId);
              const altNames = (ex.alternativeExerciseIds ?? [])
                .map((id) => catalog.find((c) => c.id === id)?.name)
                .filter(Boolean);

              return (
                <div
                  key={ex.id ?? globalIndex}
                  className="bg-secondary/50 flex items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 text-xs"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    {exObj && (
                      <ExerciseVisual
                        exercise={exObj}
                        variant="thumbnail"
                        className="h-10 w-12 shrink-0"
                      />
                    )}
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-primary font-mono-tabular font-bold">
                          {globalIndex + 1}.
                        </span>
                        <span className="truncate font-semibold">{exObj?.name ?? 'Exercise'}</span>
                        {exObj && (
                          <span className="text-muted-foreground text-[10px]">
                            ({muscleLabel(exObj.primaryMuscleGroup)})
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="bg-accent/20 text-accent font-mono-tabular inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-extrabold">
                          {formatTargetPillText(ex)}
                        </span>
                        {altNames.length > 0 && (
                          <Badge
                            variant="default"
                            title={format(t.workouts.backupsTitle, { names: altNames.join(', ') })}
                            className="px-1.5 py-0.5 text-[10px]"
                          >
                            <ArrowRightLeft className="h-2.5 w-2.5" />
                            {altNames.length}{' '}
                            {altNames.length > 1
                              ? t.workouts.backupPlural
                              : t.workouts.backupSingular}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="bg-secondary text-foreground font-mono-tabular rounded-lg border px-2 py-0.5 text-[10px] font-bold">
                      {ex.restSeconds} {t.common.sec}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Maximum 1 Rainbow Exercise Suggestion per Workout */}
            {templateSuggestion && (
              <div className="pt-1">
                <RainbowExerciseSuggestionCard
                  suggestion={templateSuggestion}
                  weightUnit={weightUnit}
                  compact
                  testId={`template-suggestion-${tpl.id}`}
                  onAdd={(sug) => void handleAddSuggestionToTemplate(tpl, sug)}
                  onDismiss={() =>
                    setDismissedSuggestions((prev) => ({ ...prev, [tpl.id]: true }))
                  }
                />
              </div>
            )}
          </div>
        </div>

        {/* Template Actions */}
        <div className="mt-5 flex flex-col gap-2.5 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              data-testid="template-action-edit"
              variant="secondary"
              size="sm"
              onClick={() => openEditTemplateBuilder(tpl)}
            >
              <Edit3 className="h-3.5 w-3.5" /> {t.workouts.editBtn}
            </Button>
            <Button
              type="button"
              data-testid="template-action-duplicate"
              variant="secondary"
              size="sm"
              onClick={() => void handleDuplicateTemplate(tpl)}
              title={t.workouts.duplicateTitle}
            >
              <Copy className="h-3.5 w-3.5" /> {t.workouts.duplicateBtn}
            </Button>
            <NativeSelect
              data-testid="template-action-move"
              aria-label={`Move ${tpl.name} to folder`}
              value={tpl.folderId ?? ''}
              onChange={(e) => void moveTemplate(tpl.id, e.target.value || null)}
              className="bg-secondary h-8 max-w-[165px] truncate text-xs"
            >
              <option value="">{t.workouts.unfiledOption}</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {format(t.workouts.folderPrefix, { name: f.name })}
                </option>
              ))}
            </NativeSelect>
            <Button
              type="button"
              data-testid="template-action-delete"
              variant="ghost"
              size="icon"
              aria-label={`Delete workout ${tpl.name}`}
              onClick={() => setConfirmDelete({ type: 'template', id: tpl.id, name: tpl.name })}
              className="text-muted-foreground hover:text-destructive size-8"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <Button
            type="button"
            data-testid="template-action-start"
            onClick={async () => {
              await startWorkoutFromTemplate(tpl.id);
              onStartSessionNavigation();
            }}
            className="w-full sm:w-auto"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            {t.workouts.startSessionBtn}
          </Button>
        </div>
      </Card>
    );
  };

  return (
    <div className="min-w-0 max-w-full space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            {t.workouts.title}
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm">{t.workouts.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {allFolderIds.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={toggleAllFolders}
              className="text-muted-foreground hover:text-foreground"
            >
              {areAllCollapsed ? (
                <>
                  <ChevronsUpDown className="h-4 w-4" />
                  {t.workouts.expandAll}
                </>
              ) : (
                <>
                  <ChevronsDownUp className="h-4 w-4" />
                  {t.workouts.collapseAll}
                </>
              )}
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setEditingFolderId(null);
              setFolderName('');
              setFolderColor('#CCFF00');
              setShowFolderModal(true);
            }}
          >
            <FolderPlus className="h-4 w-4" />
            {t.workouts.newFolder}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => openNewTemplateBuilder(folders[0]?.id ?? null)}
          >
            <Plus className="h-4 w-4" />
            {t.workouts.newWorkout}
          </Button>
        </div>
      </div>

      {/* Folders Section */}
      {folders.map((folder, folderIdx) => {
        const isCollapsed = Boolean(collapsedFolders[folder.id]);
        const folderStats = getFolderSessionStats(folder);
        return (
          <Collapsible
            key={folder.id}
            open={!isCollapsed}
            onOpenChange={() => toggleFolderCollapsed(folder.id)}
            className="min-w-0 space-y-3"
          >
            {/* Mobile-First Folder Header: Full-width Title on Top, Controls & Reorder Below on Mobile */}
            <div className="bg-card/60 flex flex-col gap-2.5 rounded-2xl border p-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} folder ${folder.name}`}
                  className="hover:text-primary flex w-full min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left transition"
                >
                  {isCollapsed ? (
                    <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronDown className="text-muted-foreground h-4 w-4 shrink-0" />
                  )}
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-full"
                    style={{ backgroundColor: folder.color || '#CCFF00' }}
                  />
                  <Folder className="text-primary h-5 w-5 shrink-0" />
                  <h2 className="font-display min-w-0 flex-1 truncate text-base font-extrabold tracking-tight sm:text-lg">
                    {folder.name}
                  </h2>
                  <Badge
                    variant="secondary"
                    className="shrink-0 rounded-full px-2.5 py-0.5 text-xs"
                  >
                    {folder.templates.length}{' '}
                    {folder.templates.length === 1 ? t.common.workout : t.common.workouts}
                  </Badge>
                </button>
              </CollapsibleTrigger>

              {/* Folder Telemetry + Reorder & Edit Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 sm:justify-end sm:border-t-0 sm:pt-0">
                <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="font-mono-tabular font-semibold">
                    {format(t.workouts.totalSessionsCount, { count: folderStats.totalCount })}
                  </span>
                  <span>•</span>
                  <span>
                    {t.workouts.lastLabel}{' '}
                    <strong className="font-mono-tabular text-foreground">
                      {folderStats.lastSessionDate ? formatDate(folderStats.lastSessionDate) : '—'}
                    </strong>
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={folderIdx === 0}
                    onClick={() => void reorderFolder(folder.id, 'UP')}
                    aria-label={`Move folder ${folder.name} up`}
                    title={t.workouts.moveUpTitle}
                    className="size-7 rounded-lg"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={folderIdx === folders.length - 1}
                    onClick={() => void reorderFolder(folder.id, 'DOWN')}
                    aria-label={`Move folder ${folder.name} down`}
                    title={t.workouts.moveDownTitle}
                    className="size-7 rounded-lg"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => openNewTemplateBuilder(folder.id)}
                    className="text-primary hover:bg-primary/10 font-semibold"
                  >
                    {t.workouts.addWorkoutShort}
                  </Button>
                  <Button
                    type="button"
                    data-testid={`folder-rename-${folder.name}`}
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setEditingFolderId(folder.id);
                      setFolderName(folder.name);
                      setFolderColor(folder.color);
                      setShowFolderModal(true);
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {t.workouts.renameBtn}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete folder ${folder.name}`}
                    onClick={() =>
                      setConfirmDelete({ type: 'folder', id: folder.id, name: folder.name })
                    }
                    className="text-muted-foreground hover:text-destructive size-7"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            <CollapsibleContent>
              {folder.templates.length === 0 ? (
                <Card className="bg-card/50 text-muted-foreground border-dashed p-6 text-center text-xs">
                  {t.workouts.emptyFolderText}
                </Card>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {folder.templates.map(renderTemplateCard)}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      {/* Unfiled Workouts Section */}
      {unfiledTemplates.length > 0 && (
        <Collapsible
          open={!collapsedFolders['__unfiled__']}
          onOpenChange={() => toggleFolderCollapsed('__unfiled__')}
          className="space-y-3"
        >
          <div className="flex items-center justify-between border-b pb-2.5">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="hover:text-primary flex cursor-pointer items-center gap-2 text-left transition"
              >
                {collapsedFolders['__unfiled__'] ? (
                  <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                ) : (
                  <ChevronDown className="text-muted-foreground h-4 w-4 shrink-0" />
                )}
                <Dumbbell className="text-muted-foreground h-5 w-5" />
                <h2 className="font-display text-lg font-bold">
                  {t.workouts.unfiledWorkoutsTitle}
                </h2>
                <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-xs">
                  {unfiledTemplates.length}
                </Badge>
              </button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <div className="grid gap-4 lg:grid-cols-2">
              {unfiledTemplates.map(renderTemplateCard)}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Folder Create/Rename Modal */}
      <Dialog open={showFolderModal} onOpenChange={setShowFolderModal}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={handleSaveFolder} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="font-display text-lg font-bold">
                {editingFolderId ? t.workouts.renameFolderTitle : t.workouts.createFolderTitle}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {t.workouts.folderModalDesc}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="folder-name" className="text-xs font-semibold">
                {t.workouts.folderNameLabel}
              </Label>
              <Input
                id="folder-name"
                required
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder={t.workouts.folderNamePlaceholder}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{t.workouts.accentColorLabel}</Label>
              <div className="flex gap-2">
                {['#CCFF00', '#00E5FF', '#FF6B00', '#A855F7', '#22C55E'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFolderColor(c)}
                    className={`h-7 w-7 rounded-full border-2 transition ${
                      folderColor === c ? 'scale-110 border-white' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowFolderModal(false)}>
                {t.common.cancel}
              </Button>
              <Button type="submit">{t.workouts.saveFolderBtn}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Destructive Action Confirmation Modal */}
      <AlertDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive font-display flex items-center gap-2.5 text-lg font-bold">
              <AlertTriangle className="h-5 w-5" />
              {confirmDelete?.type === 'folder'
                ? t.workouts.deleteFolderTitle
                : t.workouts.deleteTemplateTitle}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              {t.workouts.deleteConfirmPrefix} <strong>{confirmDelete?.name}</strong>?{' '}
              {confirmDelete?.type === 'folder'
                ? t.workouts.deleteFolderWarning
                : t.workouts.deleteTemplateWarning}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmDelete) return;
                if (confirmDelete.type === 'folder') {
                  await deleteFolder(confirmDelete.id);
                } else {
                  await deleteTemplate(confirmDelete.id);
                }
                setConfirmDelete(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.workouts.confirmDeleteBtn}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Workout Template Builder Modal */}
      <Dialog open={showTemplateBuilder} onOpenChange={setShowTemplateBuilder}>
        <DialogContent className="max-h-[92dvh] overflow-hidden p-4 sm:max-w-3xl sm:p-6">
          <form
            onSubmit={handleSaveTemplate}
            className="flex max-h-[calc(92dvh-2.5rem)] min-w-0 flex-col gap-3 overflow-hidden"
          >
            <DialogHeader className="shrink-0 border-b pb-3">
              <DialogTitle className="font-display text-lg font-bold sm:text-xl">
                {editingTemplate
                  ? format(t.workouts.editTemplateModalTitle, { name: editingTemplate.name })
                  : t.workouts.createTemplateModalTitle}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {t.workouts.templateModalDesc}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-0.5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="tpl-name" className="text-xs font-semibold">
                    {t.workouts.workoutNameLabel}
                  </Label>
                  <Input
                    id="tpl-name"
                    required
                    value={tplName}
                    onChange={(e) => setTplName(e.target.value)}
                    placeholder={t.workouts.workoutNamePlaceholder}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">{t.workouts.folderLabel}</Label>
                  <NativeSelect
                    value={tplFolderId ?? ''}
                    onChange={(e) => setTplFolderId(e.target.value || null)}
                    className="w-full"
                  >
                    <option value="">{t.workouts.unfiledNoFolder}</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="tpl-desc" className="text-xs font-semibold">
                    {t.workouts.notesFocusLabel}
                  </Label>
                  <Input
                    id="tpl-desc"
                    value={tplDesc}
                    onChange={(e) => setTplDesc(e.target.value)}
                    placeholder={t.workouts.notesFocusPlaceholder}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="tpl-duration" className="text-xs font-semibold">
                    {t.workouts.estDurationLabel}
                  </Label>
                  <NumberInput
                    id="tpl-duration"
                    min={10}
                    max={240}
                    fallbackValue={60}
                    value={tplDurationMin}
                    onValueChange={(val) => setTplDurationMin(val)}
                    className="text-xs"
                  />
                </div>
              </div>

              {/* Ordered Exercises Editor */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold">
                    {format(t.workouts.orderedExercisesTitle, { count: tplExercises.length })}
                  </h3>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const ex = catalog[0];
                      if (!ex) return;
                      setTplExercises((prev) => [
                        ...prev,
                        {
                          exerciseId: ex.id,
                          orderIndex: prev.length,
                          plannedSets: 3,
                          warmupSets: 0,
                          targetRepsMin: 8,
                          targetRepsMax: 12,
                          targetWeight: 40,
                          weightUnit,
                          restSeconds: 90,
                          targetDurationSeconds: null,
                          targetDistanceMeters: null,
                          notes: '',
                          alternativeExerciseIds: ex.alternativeExerciseIds.slice(0, 2),
                        },
                      ]);
                    }}
                  >
                    {t.workouts.addExerciseSlotBtn}
                  </Button>
                </div>

                {tplExercises.map((slot, idx) => {
                  const isSupersetWithNext = slot.restSeconds === 0 && idx < tplExercises.length - 1;
                  const isSupersetFromPrev = idx > 0 && tplExercises[idx - 1]?.restSeconds === 0;

                  return (
                    <React.Fragment key={idx}>
                      <div
                        className={`bg-secondary/40 min-w-0 space-y-3 rounded-2xl border p-3 sm:p-4 ${
                          isSupersetWithNext || isSupersetFromPrev
                            ? 'border-accent/60 bg-accent/5'
                            : ''
                        }`}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex w-full min-w-0 flex-1 items-center gap-2">
                            <span className="bg-primary text-primary-foreground font-mono-tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                              {idx + 1}
                            </span>
                            <ExercisePicker
                              exercises={catalog}
                              value={slot.exerciseId}
                              onValueChange={(newExerciseId) => {
                                const selectedEx = catalog.find((c) => c.id === newExerciseId);
                                setTplExercises((prev) =>
                                  prev.map((item, i) =>
                                    i === idx
                                      ? {
                                          ...item,
                                          exerciseId: newExerciseId,
                                          alternativeExerciseIds:
                                            selectedEx?.alternativeExerciseIds.slice(0, 2) ?? [],
                                        }
                                      : item,
                                  ),
                                );
                              }}
                              className="w-full flex-1"
                            />
                          </div>

                          <div className="flex shrink-0 flex-wrap items-center justify-between gap-1.5 sm:justify-end">
                            {idx < tplExercises.length - 1 && (
                              <Button
                                type="button"
                                variant={isSupersetWithNext ? 'accent' : 'secondary'}
                                size="xs"
                                onClick={() =>
                                  setTplExercises((prev) =>
                                    prev.map((item, i) =>
                                      i === idx
                                        ? {
                                            ...item,
                                            restSeconds: item.restSeconds === 0 ? 90 : 0,
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                title={t.workouts.supersetBtnTitle}
                                className="font-bold"
                              >
                                <Zap className="h-3 w-3 shrink-0" />
                                {isSupersetWithNext
                                  ? format(t.workouts.supersetWithActive, { index: idx + 2 })
                                  : format(t.workouts.supersetWithInactive, { index: idx + 2 })}
                              </Button>
                            )}
                            <div className="ml-auto flex items-center gap-1 sm:ml-0">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                disabled={idx === 0}
                                onClick={() =>
                                  setTplExercises((prev) => {
                                    const copy = [...prev];
                                    const [m] = copy.splice(idx, 1);
                                    if (m) copy.splice(idx - 1, 0, m);
                                    return copy;
                                  })
                                }
                                title={t.workouts.moveUpTitle}
                                className="size-7"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                disabled={idx === tplExercises.length - 1}
                                onClick={() =>
                                  setTplExercises((prev) => {
                                    const copy = [...prev];
                                    const [m] = copy.splice(idx, 1);
                                    if (m) copy.splice(idx + 1, 0, m);
                                    return copy;
                                  })
                                }
                                title={t.workouts.moveDownTitle}
                                className="size-7"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                onClick={() =>
                                  setTplExercises((prev) => prev.filter((_, i) => i !== idx))
                                }
                                className="text-destructive font-semibold"
                              >
                                {t.common.remove}
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Sets, Warmups, Rep Range, Target Weight, Rest — compact 3-col on mobile */}
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-2.5">
                          <div>
                            <Label className="text-muted-foreground mb-1 truncate text-[10px] font-semibold uppercase">
                              {t.workouts.workingSetsLabel}
                            </Label>
                            <NumberInput
                              min={1}
                              max={20}
                              fallbackValue={3}
                              value={slot.plannedSets}
                              onValueChange={(val) =>
                                setTplExercises((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, plannedSets: val } : item,
                                  ),
                                )
                              }
                              className="font-mono-tabular h-9 text-xs sm:h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-muted-foreground mb-1 truncate text-[10px] font-semibold uppercase">
                              {t.workouts.warmupSetsLabel}
                            </Label>
                            <NumberInput
                              min={0}
                              max={10}
                              fallbackValue={0}
                              value={slot.warmupSets ?? 0}
                              onValueChange={(val) =>
                                setTplExercises((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, warmupSets: val } : item,
                                  ),
                                )
                              }
                              className="font-mono-tabular h-9 text-xs sm:h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-muted-foreground mb-1 truncate text-[10px] font-semibold uppercase">
                              {t.workouts.minRepsLabel}
                            </Label>
                            <NumberInput
                              min={1}
                              max={100}
                              fallbackValue={8}
                              value={slot.targetRepsMin ?? 8}
                              onValueChange={(val) =>
                                setTplExercises((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, targetRepsMin: val } : item,
                                  ),
                                )
                              }
                              className="font-mono-tabular h-9 text-xs sm:h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-muted-foreground mb-1 truncate text-[10px] font-semibold uppercase">
                              {t.workouts.maxRepsLabel}
                            </Label>
                            <NumberInput
                              min={1}
                              max={100}
                              fallbackValue={12}
                              value={slot.targetRepsMax ?? 12}
                              onValueChange={(val) =>
                                setTplExercises((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, targetRepsMax: val } : item,
                                  ),
                                )
                              }
                              className="font-mono-tabular h-9 text-xs sm:h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-muted-foreground mb-1 truncate text-[10px] font-semibold uppercase">
                              {format(t.workouts.targetWeightLabel, { unit: weightUnit })}
                            </Label>
                            <NumberInput
                              allowNull
                              step="0.5"
                              min={0}
                              value={slot.targetWeight ?? null}
                              onValueChange={(val) =>
                                setTplExercises((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, targetWeight: val } : item,
                                  ),
                                )
                              }
                              placeholder={t.common.optional}
                              className="font-mono-tabular h-9 text-xs sm:h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-muted-foreground mb-1 truncate text-[10px] font-semibold uppercase">
                              {t.workouts.restSecLabel}
                            </Label>
                            <NumberInput
                              step="15"
                              min={0}
                              max={600}
                              fallbackValue={90}
                              value={slot.restSeconds}
                              onValueChange={(val) =>
                                setTplExercises((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, restSeconds: val } : item,
                                  ),
                                )
                              }
                              className="font-mono-tabular h-9 text-xs sm:h-8"
                            />
                          </div>
                        </div>

                        {/* Backup / Alternative Exercises Selector */}
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="min-w-0">
                            <Label className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase">
                              {t.workouts.backupExerciseLabel}
                            </Label>
                            <ExercisePicker
                              exercises={catalog.filter((c) => c.id !== slot.exerciseId)}
                              value={slot.alternativeExerciseIds?.[0] ?? ''}
                              emptyOptionLabel={t.workouts.noneConfigured}
                              emptyOptionValue=""
                              title={t.workouts.backupExerciseLabel}
                              onValueChange={(val) => {
                                setTplExercises((prev) =>
                                  prev.map((item, i) =>
                                    i === idx
                                      ? {
                                          ...item,
                                          alternativeExerciseIds: val ? [val] : [],
                                        }
                                      : item,
                                  ),
                                );
                              }}
                              triggerClassName="h-9 sm:h-8 text-xs font-normal"
                            />
                          </div>
                          <div className="min-w-0">
                            <Label className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase">
                              {t.workouts.exerciseNotesLabel}
                            </Label>
                            <Input
                              value={slot.notes ?? ''}
                              onChange={(e) =>
                                setTplExercises((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, notes: e.target.value } : item,
                                  ),
                                )
                              }
                              placeholder={t.workouts.exerciseNotesPlaceholder}
                              className="h-9 text-xs sm:h-8"
                            />
                          </div>
                        </div>
                      </div>

                      {isSupersetWithNext && !isSupersetFromPrev && (
                        <div
                          data-testid="builder-superset-header"
                          className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-zinc-950 px-3.5 py-2.5 text-xs text-white"
                        >
                          <div>
                            <div className="flex items-center gap-1.5 font-extrabold tracking-wide uppercase">
                              <span className="text-accent">{t.workouts.supersetHeaderLabel}</span>
                              <span className="font-mono-tabular">
                                {format(t.workouts.supersetRoundsFormat, {
                                  rounds: slot.plannedSets,
                                })}
                              </span>
                            </div>
                            <p className="font-mono-tabular mt-0.5 text-[11px] text-zinc-300">
                              {format(t.workouts.supersetSubtitleFormat, {
                                rest: formatRestDurationMinSec(
                                  tplExercises[idx + 1]?.restSeconds || 90,
                                ),
                              })}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setTplExercises((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, restSeconds: 90 } : item,
                                ),
                              )
                            }
                            className="text-accent shrink-0 text-xs font-bold underline opacity-90 hover:opacity-100"
                          >
                            {t.workouts.unlinkBtn}
                          </button>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}

                {/* Smart Exercise Suggestion inside Workout Builder (max 1 per workout) */}
                {suggestionsEnabled &&
                  !builderSuggestionDismissed &&
                  (() => {
                    const builderFolderName =
                      folders.find((f) => f.id === tplFolderId)?.name ?? null;
                    const builderSuggestion = computeWorkoutExerciseSuggestion({
                      workoutName: tplName || 'Workout',
                      folderName: builderFolderName,
                      exercises: tplExercises.map((ex) => {
                        const exObj = catalog.find((c) => c.id === ex.exerciseId);
                        return {
                          exerciseId: ex.exerciseId,
                          exerciseName: exObj?.name ?? null,
                          primaryMuscleGroup: exObj?.primaryMuscleGroup ?? null,
                          plannedSets: ex.plannedSets,
                          targetRepsMin: ex.targetRepsMin,
                          targetRepsMax: ex.targetRepsMax,
                          targetWeight: ex.targetWeight,
                        };
                      }),
                      catalog,
                      historySessions,
                      weightUnit,
                    });

                    if (!builderSuggestion) return null;

                    return (
                      <RainbowExerciseSuggestionCard
                        suggestion={builderSuggestion}
                        weightUnit={weightUnit}
                        testId="builder-rainbow-suggestion"
                        onAdd={(sug) => {
                          setTplExercises((prev) => [
                            ...prev,
                            {
                              exerciseId: sug.suggestedExercise.id,
                              orderIndex: prev.length,
                              plannedSets: sug.recommendedSets,
                              warmupSets: 0,
                              targetRepsMin: sug.recommendedRepsMin,
                              targetRepsMax: sug.recommendedRepsMax,
                              targetWeight: sug.recommendedWeight,
                              weightUnit,
                              restSeconds: sug.recommendedRestSeconds,
                              targetDurationSeconds: null,
                              targetDistanceMeters: null,
                              notes: '',
                              alternativeExerciseIds:
                                sug.suggestedExercise.alternativeExerciseIds.slice(0, 2),
                            },
                          ]);
                        }}
                        onSwap={
                          builderSuggestion.stallingExerciseId
                            ? (sug) => {
                                setTplExercises((prev) =>
                                  prev.map((item) =>
                                    item.exerciseId === sug.stallingExerciseId
                                      ? {
                                          ...item,
                                          exerciseId: sug.suggestedExercise.id,
                                          alternativeExerciseIds:
                                            sug.suggestedExercise.alternativeExerciseIds.slice(
                                              0,
                                              2,
                                            ),
                                        }
                                      : item,
                                  ),
                                );
                              }
                            : undefined
                        }
                        onDismiss={() => setBuilderSuggestionDismissed(true)}
                      />
                    );
                  })()}
              </div>
            </div>

            <DialogFooter className="shrink-0 border-t pt-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowTemplateBuilder(false)}
              >
                {t.common.cancel}
              </Button>
              <Button type="submit">
                {editingTemplate ? t.workouts.saveChangesBtn : t.workouts.createTemplateBtn}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
