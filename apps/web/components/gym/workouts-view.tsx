'use client';

import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  ChevronRight,
  Copy,
  Dumbbell,
  FolderInput,
  FolderPlus,
  Inbox,
  MinusCircle,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  PlusCircle,
  Trash2,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@luki-fitti/ui/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@luki-fitti/ui/components/ui/dropdown-menu';
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
  formatRestDurationMinSec,
  groupExercisesIntoBlocks,
  type WorkoutExerciseSuggestion,
  DEFAULT_FOLDER_COLOR,
  FOLDER_COLOR_PALETTE,
  resolveFolderColor,
  resolveTemplateSets,
  summarizeTemplateSets,
  templateExerciseToInput,
} from '@luki-fitti/common/utils/client';
import { SessionStatus } from '@luki-fitti/common/enums';
import { ExercisePicker } from './exercise-picker';
import { ExerciseVisual } from './exercise-visual';
import { NumberInput } from './number-input';
import { RainbowExerciseSuggestionCard } from './rainbow-suggestion-card';
import { SwipeRow } from './swipe-row';
import { TemplateSetsEditor } from './template-sets-editor';
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
  const [folderColor, setFolderColor] = useState<string>(DEFAULT_FOLDER_COLOR);

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

  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [expandedTemplates, setExpandedTemplates] = useState<Record<string, boolean>>({});
  const [isEditMode, setIsEditMode] = useState(false);
  const [openMenuTemplateId, setOpenMenuTemplateId] = useState<string | null>(null);
  const [isMoveListOpen, setIsMoveListOpen] = useState(false);
  const lastMenuPointerType = useRef<string>('mouse');
  const [highlightedTemplateId, setHighlightedTemplateId] = useState<string | null>(null);

  const UNFILED_KEY = '__unfiled__';
  const folderKey = (folderId: string | null) => folderId ?? UNFILED_KEY;

  const toggleFolderExpanded = (key: string) => {
    setExpandedFolders((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const expandFolder = (key: string) => {
    setExpandedFolders((prev) => ({ ...prev, [key]: true }));
  };

  const toggleTemplateExpanded = (templateId: string) => {
    setExpandedTemplates((prev) => ({ ...prev, [templateId]: !prev[templateId] }));
  };

  const openFolderModal = (folder?: WorkoutFolderDto) => {
    setEditingFolderId(folder?.id ?? null);
    setFolderName(folder?.name ?? '');
    setFolderColor(folder ? resolveFolderColor(folder.color) : DEFAULT_FOLDER_COLOR);
    setShowFolderModal(true);
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
        ...templateExerciseToInput(ex, idx),
        notes: ex.notes ?? '',
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
    expandFolder(folderKey(tplFolderId));
    setShowTemplateBuilder(false);
    setEditingTemplate(null);
  };

  const handleDuplicateTemplate = async (tpl: WorkoutTemplateDto) => {
    const duplicated = await duplicateTemplate(tpl.id);
    if (!duplicated) return;

    toast.success(format(t.workouts.duplicatedToast, { name: duplicated.name }));
    expandFolder(folderKey(duplicated.folderId));
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

  const handleAddSuggestionToTemplate = async (
    tpl: WorkoutTemplateDto,
    suggestion: WorkoutExerciseSuggestion,
  ) => {
    const existingExercises: TemplateExerciseInputDto[] = tpl.exercises.map((ex, idx) =>
      templateExerciseToInput(ex, idx),
    );

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

  const renderTemplateRow = (tpl: WorkoutTemplateDto) => {
    const tplStats = getTemplateSessionStats(tpl);
    const isHighlighted = highlightedTemplateId === tpl.id;
    const isExpanded = Boolean(expandedTemplates[tpl.id]);
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
      const weightPart = ex.targetWeight ? ` ${ex.targetWeight} ${weightUnit.toLowerCase()}` : '';
      return `${ex.plannedSets}×${repsPart}${weightPart}`;
    };

    const metaLine = [
      tpl.exercises.length === 1
        ? t.workouts.exerciseCountOne
        : format(t.workouts.exerciseCount, { count: tpl.exercises.length }),
      `~${tpl.estimatedDurationMinutes ?? 60} ${t.common.min}`,
      tplStats.lastSessionDate
        ? format(t.workouts.lastTrainedShort, { date: formatDate(tplStats.lastSessionDate) })
        : t.workouts.neverTrained,
    ].join(' · ');

    const startWorkout = async () => {
      await startWorkoutFromTemplate(tpl.id);
      onStartSessionNavigation();
    };

    return (
      <div
        key={tpl.id}
        data-template-id={tpl.id}
        data-testid={`template-card-${tpl.name}`}
        tabIndex={-1}
        className={`border-border/70 min-w-0 border-t outline-none transition-shadow duration-300 ${
          isHighlighted ? 'ring-primary/50 ring-2 ring-inset' : ''
        }`}
      >
        <SwipeRow
          disabled={isEditMode}
          leadingActions={[
            {
              id: 'edit',
              label: t.common.edit,
              icon: Pencil,
              tone: 'neutral',
              onSelect: () => openEditTemplateBuilder(tpl),
            },
            {
              id: 'duplicate',
              label: t.workouts.duplicateBtn,
              icon: Copy,
              tone: 'accent',
              onSelect: () => void handleDuplicateTemplate(tpl),
            },
          ]}
          trailingActions={[
            {
              id: 'delete',
              label: t.common.delete,
              icon: Trash2,
              tone: 'destructive',
              onSelect: () => setConfirmDelete({ type: 'template', id: tpl.id, name: tpl.name }),
            },
          ]}
        >
          <div className="flex min-h-[60px] items-center gap-2 py-2 pr-3 pl-4">
            {isEditMode && (
              <button
                type="button"
                data-testid="template-action-delete"
                aria-label={format(t.a11y.deleteTemplate, { name: tpl.name })}
                onClick={() => setConfirmDelete({ type: 'template', id: tpl.id, name: tpl.name })}
                className="text-destructive -ml-1 flex size-11 shrink-0 items-center justify-center"
              >
                <MinusCircle className="h-[22px] w-[22px] fill-current stroke-white" />
              </button>
            )}

            <button
              type="button"
              data-testid="template-details-toggle"
              aria-expanded={isExpanded}
              onClick={() => toggleTemplateExpanded(tpl.id)}
              className="min-w-0 flex-1 py-1 text-left"
            >
              <h3 className="truncate text-[1.0625rem] leading-snug font-medium">{tpl.name}</h3>
              <p className="text-muted-foreground truncate text-[0.8125rem] tabular-nums">
                {metaLine}
              </p>
            </button>

            {isEditMode ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                data-testid="template-action-edit"
                aria-label={`${t.common.edit} ${tpl.name}`}
                onClick={() => openEditTemplateBuilder(tpl)}
                className="text-primary size-10 shrink-0"
              >
                <Pencil className="h-[18px] w-[18px]" />
              </Button>
            ) : (
              <>
                <DropdownMenu
                  open={openMenuTemplateId === tpl.id}
                  onOpenChange={(open) => {
                    setOpenMenuTemplateId(open ? tpl.id : null);
                    setIsMoveListOpen(false);
                  }}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      // Touch: open on tap (click) instead of pointerdown, so starting a swipe on
                      // this button doesn't pop the menu open.
                      onPointerDown={(e) => {
                        lastMenuPointerType.current = e.pointerType;
                        if (e.pointerType !== 'mouse') e.preventDefault();
                      }}
                      onClick={(e) => {
                        if (e.detail > 0 && lastMenuPointerType.current !== 'mouse') {
                          setOpenMenuTemplateId((prev) => (prev === tpl.id ? null : tpl.id));
                        }
                      }}
                      data-testid="template-action-menu"
                      aria-label={format(t.workouts.moreActionsLabel, { name: tpl.name })}
                      className="text-muted-foreground size-10 shrink-0"
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem
                      data-testid="template-action-edit"
                      onSelect={() => openEditTemplateBuilder(tpl)}
                    >
                      <Pencil /> {t.common.edit}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      data-testid="template-action-duplicate"
                      onSelect={() => void handleDuplicateTemplate(tpl)}
                    >
                      <Copy /> {t.workouts.duplicateBtn}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      data-testid="template-action-move"
                      aria-expanded={isMoveListOpen}
                      onSelect={(e) => {
                        e.preventDefault();
                        setIsMoveListOpen((prev) => !prev);
                      }}
                    >
                      <FolderInput /> {t.workouts.moveToBtn}
                      <ChevronRight
                        className={`ml-auto transition-transform duration-200 ${
                          isMoveListOpen ? 'rotate-90' : ''
                        }`}
                      />
                    </DropdownMenuItem>
                    {isMoveListOpen && (
                      <DropdownMenuRadioGroup
                        value={tpl.folderId ?? ''}
                        onValueChange={(value) => {
                          const target = value || null;
                          void moveTemplate(tpl.id, target);
                          expandFolder(folderKey(target));
                        }}
                      >
                        <DropdownMenuRadioItem value="" className="pl-10">
                          {t.workouts.unfiledOption}
                        </DropdownMenuRadioItem>
                        {folders.map((f) => (
                          <DropdownMenuRadioItem key={f.id} value={f.id} className="pl-10">
                            {f.name}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      data-testid="template-action-delete"
                      onSelect={() =>
                        setConfirmDelete({ type: 'template', id: tpl.id, name: tpl.name })
                      }
                    >
                      <Trash2 /> {t.common.delete}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  type="button"
                  size="icon"
                  data-testid="template-action-start"
                  aria-label={format(t.workouts.startWorkoutAria, { name: tpl.name })}
                  onClick={() => void startWorkout()}
                  className="size-10 shrink-0"
                >
                  <Play className="h-4 w-4 translate-x-px fill-current" />
                </Button>
              </>
            )}
          </div>
        </SwipeRow>

        {isExpanded && (
          <div className="animate-in fade-in slide-in-from-top-1 space-y-2.5 px-4 pb-4 duration-200">
            {tpl.description && (
              <p className="text-muted-foreground text-[0.9375rem]">{tpl.description}</p>
            )}
            {blocks.map((block) => {
              if (block.type === 'superset') {
                return (
                  <div
                    key={`superset-${block.startIndex}`}
                    data-testid="superset-block-card"
                    className="bg-secondary/60 overflow-hidden rounded-2xl"
                  >
                    {/* Gymlife Dark Superset Header Banner */}
                    <div className="text-foreground flex items-center justify-between gap-2 px-3.5 pt-3 pb-1">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold">
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

                    {/* Grouped Superset Exercise Rows */}
                    <div className="divide-border/60 divide-y px-1 pb-1">
                      {block.items.map(({ item: ex, globalIndex, stepNumber }) => {
                        const exObj = ex.exercise ?? catalog.find((c) => c.id === ex.exerciseId);
                        const altNames = (ex.alternativeExerciseIds ?? [])
                          .map((id) => catalog.find((c) => c.id === id)?.name)
                          .filter(Boolean);

                        return (
                          <div
                            key={ex.id ?? globalIndex}
                            className="flex items-center justify-between gap-2.5 px-2.5 py-2.5"
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div className="relative shrink-0">
                                <span
                                  data-testid="superset-step-badge"
                                  className="text-accent tabular-nums absolute -top-1 -left-1 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-secondary text-xs font-bold"
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
                                <p className="truncate text-[0.9375rem] font-medium">
                                  {exObj?.name ?? t.common.exercise}
                                </p>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-muted-foreground text-[0.8125rem] tabular-nums">
                                    {[
                                      exObj ? muscleLabel(exObj.primaryMuscleGroup) : null,
                                      formatTargetPillText(ex),
                                    ]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </span>
                                  {altNames.length > 0 && (
                                    <Badge
                                      variant="default"
                                      title={format(t.workouts.backupsTitle, {
                                        names: altNames.join(', '),
                                      })}
                                      className="px-1.5 py-0.5 text-xs"
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
                  className="flex items-center justify-between gap-3 py-1.5"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    {exObj && (
                      <ExerciseVisual
                        exercise={exObj}
                        variant="thumbnail"
                        className="h-10 w-12 shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-[0.9375rem] font-medium">
                        <span className="text-muted-foreground tabular-nums">
                          {globalIndex + 1}.{' '}
                        </span>
                        {exObj?.name ?? t.common.exercise}
                      </p>
                      <p className="text-muted-foreground truncate text-[0.8125rem] tabular-nums">
                        {[
                          exObj ? muscleLabel(exObj.primaryMuscleGroup) : null,
                          formatTargetPillText(ex),
                          `${ex.restSeconds} ${t.common.sec}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      {altNames.length > 0 && (
                        <p
                          className="text-muted-foreground flex items-center gap-1 text-[0.8125rem]"
                          title={format(t.workouts.backupsTitle, { names: altNames.join(', ') })}
                        >
                          <ArrowRightLeft className="h-3 w-3" />
                          {altNames.length}{' '}
                          {altNames.length > 1
                            ? t.workouts.backupPlural
                            : t.workouts.backupSingular}
                        </p>
                      )}
                    </div>
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
                  analyticsContext="template"
                  onAdd={(sug) => void handleAddSuggestionToTemplate(tpl, sug)}
                  onDismiss={() => setDismissedSuggestions((prev) => ({ ...prev, [tpl.id]: true }))}
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderFolderGroup = (options: {
    key: string;
    folder: WorkoutFolderDto | null;
    index: number;
    templates: WorkoutTemplateDto[];
  }) => {
    const { key, folder, index, templates } = options;
    const isExpanded = Boolean(expandedFolders[key]);
    const name = folder?.name ?? t.workouts.unfiledWorkoutsTitle;

    const header = (
      <div className="flex min-h-[60px] items-center gap-2 py-2 pr-3 pl-4">
        {isEditMode && folder && (
          <button
            type="button"
            aria-label={format(t.a11y.deleteFolder, { name: folder.name })}
            onClick={() => setConfirmDelete({ type: 'folder', id: folder.id, name: folder.name })}
            className="text-destructive -ml-1 flex size-11 shrink-0 items-center justify-center"
          >
            <MinusCircle className="h-[22px] w-[22px] fill-current stroke-white" />
          </button>
        )}

        <button
          type="button"
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} folder ${name}`}
          onClick={() => toggleFolderExpanded(key)}
          className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left"
        >
          {folder ? (
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: resolveFolderColor(folder.color) }}
            />
          ) : (
            <Inbox className="text-muted-foreground h-4 w-4 shrink-0" />
          )}
          <h2 className="min-w-0 flex-1 truncate text-[1.0625rem] font-semibold">{name}</h2>
          {!isEditMode && (
            <span className="text-muted-foreground shrink-0 text-[0.9375rem] tabular-nums">
              {templates.length}
            </span>
          )}
          <ChevronRight
            aria-hidden="true"
            className={`text-muted-foreground h-4 w-4 shrink-0 transition-transform duration-200 ${
              isExpanded ? 'rotate-90' : ''
            } ${isEditMode ? 'hidden' : ''}`}
          />
        </button>

        {isEditMode && folder && (
          <div className="flex shrink-0 items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={index === 0}
              onClick={() => void reorderFolder(folder.id, 'UP')}
              aria-label={format(t.a11y.moveFolderUp, { name: folder.name })}
              className="size-11"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={index === folders.length - 1}
              onClick={() => void reorderFolder(folder.id, 'DOWN')}
              aria-label={format(t.a11y.moveFolderDown, { name: folder.name })}
              className="size-11"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-testid={`folder-rename-${folder.name}`}
              aria-label={`${t.workouts.renameBtn} ${folder.name}`}
              onClick={() => openFolderModal(folder)}
              className="text-primary size-9"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    );

    return (
      <section key={key} className="bg-card overflow-hidden rounded-[1.25rem]">
        {folder ? (
          <SwipeRow
            disabled={isEditMode}
            leadingActions={[
              {
                id: 'rename',
                label: t.workouts.renameBtn,
                icon: Pencil,
                tone: 'neutral',
                onSelect: () => openFolderModal(folder),
              },
              {
                id: 'add',
                label: t.workouts.addWorkoutShort,
                icon: Plus,
                tone: 'accent',
                onSelect: () => openNewTemplateBuilder(folder.id),
              },
            ]}
            trailingActions={[
              {
                id: 'delete',
                label: t.common.delete,
                icon: Trash2,
                tone: 'destructive',
                onSelect: () =>
                  setConfirmDelete({ type: 'folder', id: folder.id, name: folder.name }),
              },
            ]}
          >
            {header}
          </SwipeRow>
        ) : (
          header
        )}

        {isExpanded &&
          (templates.length === 0 ? (
            <p className="border-border/70 text-muted-foreground border-t px-4 py-4 text-[0.9375rem]">
              {t.workouts.emptyFolderText}
            </p>
          ) : (
            templates.map(renderTemplateRow)
          ))}

        {isExpanded && isEditMode && folder && (
          <button
            type="button"
            onClick={() => openNewTemplateBuilder(folder.id)}
            className="border-border/70 text-primary flex min-h-[52px] w-full items-center gap-3 border-t px-4 text-left text-[1.0625rem]"
          >
            <PlusCircle className="h-[22px] w-[22px]" />
            {t.workouts.addWorkoutShort}
          </button>
        )}
      </section>
    );
  };

  return (
    <div className="mx-auto max-w-2xl min-w-0 space-y-6 pb-10">
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-[2.125rem] leading-tight font-bold">{t.workouts.title}</h1>
          <p className="text-muted-foreground text-[0.9375rem]">{t.workouts.subtitle}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="workouts-edit-toggle"
            onClick={() => setIsEditMode((v) => !v)}
            className="text-primary text-[1.0625rem] font-medium"
          >
            {isEditMode ? t.common.done : t.workouts.editListBtn}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label={t.workouts.addMenuLabel}
                data-testid="workouts-add-menu"
                className="text-primary size-10"
              >
                <Plus className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => openNewTemplateBuilder(folders[0]?.id ?? null)}>
                <Dumbbell /> {t.workouts.newWorkout}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openFolderModal()}>
                <FolderPlus /> {t.workouts.newFolder}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="space-y-4">
        {folders.map((folder, index) =>
          renderFolderGroup({ key: folder.id, folder, index, templates: folder.templates }),
        )}
        {unfiledTemplates.length > 0 &&
          renderFolderGroup({
            key: UNFILED_KEY,
            folder: null,
            index: folders.length,
            templates: unfiledTemplates,
          })}
      </div>

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
                {FOLDER_COLOR_PALETTE.map(({ hex: c }) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFolderColor(c)}
                    className={`h-7 w-7 rounded-full border-2 transition ${
                      folderColor === c ? 'scale-110 border-border' : 'border-transparent'
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
                  const isSupersetWithNext =
                    slot.restSeconds === 0 && idx < tplExercises.length - 1;
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
                            <span className="bg-primary text-primary-foreground tabular-nums flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold">
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

                        {/* Per-set plan (type, weight, reps) + rep range goal and rest */}
                        <TemplateSetsEditor
                          labelPrefix={`Exercise ${idx + 1}`}
                          weightUnit={slot.weightUnit ?? weightUnit}
                          sets={slot.sets?.length ? slot.sets : resolveTemplateSets(slot)}
                          onChange={(sets) =>
                            setTplExercises((prev) =>
                              prev.map((item, i) =>
                                i === idx
                                  ? { ...item, sets, ...summarizeTemplateSets(sets) }
                                  : item,
                              ),
                            )
                          }
                        />
                        <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                          <div>
                            <Label className="text-muted-foreground mb-1 truncate text-xs font-semibold">
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
                              className="tabular-nums h-9 text-xs sm:h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-muted-foreground mb-1 truncate text-xs font-semibold">
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
                              className="tabular-nums h-9 text-xs sm:h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-muted-foreground mb-1 truncate text-xs font-semibold">
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
                              className="tabular-nums h-9 text-xs sm:h-8"
                            />
                          </div>
                        </div>

                        {/* Backup / Alternative Exercises Selector */}
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="min-w-0">
                            <Label className="text-muted-foreground mb-1 text-xs font-semibold">
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
                            <Label className="text-muted-foreground mb-1 text-xs font-semibold">
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
                          className="flex items-center justify-between gap-2 rounded-xl border border-border bg-secondary px-3.5 py-2.5 text-xs text-foreground"
                        >
                          <div>
                            <div className="flex items-center gap-1.5 font-semibold">
                              <span className="text-accent">{t.workouts.supersetHeaderLabel}</span>
                              <span className="tabular-nums">
                                {format(t.workouts.supersetRoundsFormat, {
                                  rounds: slot.plannedSets,
                                })}
                              </span>
                            </div>
                            <p className="tabular-nums mt-0.5 text-xs text-muted-foreground">
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
                        analyticsContext="builder"
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
