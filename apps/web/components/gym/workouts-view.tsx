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
import { useGym } from '@/providers/gym/gym-context';
import { MUSCLE_GROUP_LABELS } from '@luki-fitti/common/enums';
import type {
  TemplateExerciseInputDto,
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
    weightUnit,
    createFolder,
    renameFolder,
    deleteFolder,
    createTemplate,
    updateTemplate,
    duplicateTemplate,
    moveTemplate,
    deleteTemplate,
    startWorkoutFromTemplate,
  } = useGym();

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

  const renderTemplateCard = (tpl: WorkoutTemplateDto) => (
    <Card
      key={tpl.id}
      className="hover:border-primary/40 justify-between transition"
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display text-lg font-bold">{tpl.name}</h3>
            {tpl.description && (
              <p className="text-muted-foreground mt-0.5 text-xs">{tpl.description}</p>
            )}
          </div>
          <Badge variant="secondary" className="font-mono-tabular shrink-0 px-2.5 py-1 text-xs">
            {tpl.exercises.length} exercises • ~{tpl.estimatedDurationMinutes ?? 60}m
          </Badge>
        </div>

        {/* Ordered Exercise List Preview */}
        <div className="mt-4 space-y-2">
          {tpl.exercises.map((ex, idx) => {
            const exObj = ex.exercise ?? catalog.find((c) => c.id === ex.exerciseId);
            const altNames = (ex.alternativeExerciseIds ?? [])
              .map((id) => catalog.find((c) => c.id === id)?.name)
              .filter(Boolean);

            return (
              <div
                key={ex.id ?? idx}
                className="bg-secondary/50 flex flex-col gap-1 rounded-xl px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-2">
                  <span className="text-primary font-mono-tabular font-bold">{idx + 1}.</span>
                  <span className="font-semibold">{exObj?.name ?? 'Exercise'}</span>
                  {exObj && (
                    <span className="text-muted-foreground text-[10px]">
                      ({MUSCLE_GROUP_LABELS[exObj.primaryMuscleGroup]})
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono-tabular font-semibold">
                    {ex.plannedSets} ×{' '}
                    {ex.targetRepsMin && ex.targetRepsMax && ex.targetRepsMin !== ex.targetRepsMax
                      ? `${ex.targetRepsMin}–${ex.targetRepsMax}`
                      : (ex.targetRepsMin ?? 10)}{' '}
                    reps
                    {ex.targetWeight ? ` @ ${ex.targetWeight}${weightUnit.toLowerCase()}` : ''}
                  </span>
                  <span className="text-muted-foreground font-mono-tabular text-[11px]">
                    • {ex.restSeconds}s rest
                  </span>
                  {altNames.length > 0 && (
                    <Badge
                      variant="default"
                      title={`Backups: ${altNames.join(', ')}`}
                      className="px-1.5 py-0.5 text-[10px]"
                    >
                      <ArrowRightLeft className="h-2.5 w-2.5" />
                      {altNames.length} backup{altNames.length > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Template Actions */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => openEditTemplateBuilder(tpl)}
          >
            <Edit3 className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void duplicateTemplate(tpl.id)}
            title="Duplicate workout template"
          >
            <Copy className="h-3.5 w-3.5" /> Duplicate
          </Button>
          <NativeSelect
            aria-label={`Move ${tpl.name} to folder`}
            value={tpl.folderId ?? ''}
            onChange={(e) => void moveTemplate(tpl.id, e.target.value || null)}
            className="bg-secondary h-8 text-xs"
          >
            <option value="">Unfiled</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                Folder: {f.name}
              </option>
            ))}
          </NativeSelect>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Delete workout ${tpl.name}`}
            onClick={() =>
              setConfirmDelete({ type: 'template', id: tpl.id, name: tpl.name })
            }
            className="text-muted-foreground hover:text-destructive size-8"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <Button
          type="button"
          onClick={async () => {
            await startWorkoutFromTemplate(tpl.id);
            onStartSessionNavigation();
          }}
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          Start Session
        </Button>
      </div>
    </Card>
  );

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Workout Templates & Splits
          </h1>
          <p className="text-muted-foreground text-sm">
            One-level folder organization with flexible rep ranges, rest timers, and machine-busy
            backup exercises
          </p>
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
                  Expand All
                </>
              ) : (
                <>
                  <ChevronsDownUp className="h-4 w-4" />
                  Collapse All
                </>
              )}
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setEditingFolderId(null);
              setFolderName('');
              setFolderColor('#CCFF00');
              setShowFolderModal(true);
            }}
          >
            <FolderPlus className="h-4 w-4" />
            New Folder
          </Button>
          <Button
            type="button"
            onClick={() => openNewTemplateBuilder(folders[0]?.id ?? null)}
          >
            <Plus className="h-4 w-4" />
            New Workout
          </Button>
        </div>
      </div>

      {/* Folders Section */}
      {folders.map((folder) => {
        const isCollapsed = Boolean(collapsedFolders[folder.id]);
        return (
          <Collapsible
            key={folder.id}
            open={!isCollapsed}
            onOpenChange={() => toggleFolderCollapsed(folder.id)}
            className="space-y-3"
          >
            <div className="flex items-center justify-between border-b pb-2.5">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} folder ${folder.name}`}
                  className="hover:text-primary flex cursor-pointer items-center gap-2.5 text-left transition"
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
                  <h2 className="font-display text-lg font-bold">{folder.name}</h2>
                  <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-xs">
                    {folder.templates.length}
                  </Badge>
                </button>
              </CollapsibleTrigger>

              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => openNewTemplateBuilder(folder.id)}
                  className="text-primary hover:bg-primary/10 font-semibold"
                >
                  + Add Workout
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingFolderId(folder.id);
                    setFolderName(folder.name);
                    setFolderColor(folder.color);
                    setShowFolderModal(true);
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Rename
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete folder ${folder.name}`}
                  onClick={() =>
                    setConfirmDelete({ type: 'folder', id: folder.id, name: folder.name })
                  }
                  className="text-muted-foreground hover:text-destructive size-8"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <CollapsibleContent>
              {folder.templates.length === 0 ? (
                <Card className="bg-card/50 text-muted-foreground border-dashed p-6 text-center text-xs">
                  No workouts in this folder yet. Click &ldquo;+ Add Workout&rdquo; or move an
                  existing template here.
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
                <h2 className="font-display text-lg font-bold">Unfiled Workouts</h2>
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
                {editingFolderId ? 'Rename Folder' : 'Create Workout Folder'}
              </DialogTitle>
              <DialogDescription className="text-xs">
                One-level folder to group your training split (e.g., 4er Split, Push/Pull/Legs).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="folder-name" className="text-xs font-semibold">
                Folder Name *
              </Label>
              <Input
                id="folder-name"
                required
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="e.g. 4er Split"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Accent Color</Label>
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
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowFolderModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Save Folder</Button>
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
              Delete {confirmDelete?.type === 'folder' ? 'Folder' : 'Workout Template'}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              Are you sure you want to delete <strong>{confirmDelete?.name}</strong>?{' '}
              {confirmDelete?.type === 'folder'
                ? 'Workouts inside this folder will be moved to Unfiled Workouts.'
                : 'Your historical training sessions and diary entries will NOT be deleted.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
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
              Confirm Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Workout Template Builder Modal */}
      <Dialog open={showTemplateBuilder} onOpenChange={setShowTemplateBuilder}>
        <DialogContent className="sm:max-w-3xl">
          <form onSubmit={handleSaveTemplate} className="space-y-5">
            <DialogHeader className="border-b pb-3">
              <DialogTitle className="font-display text-xl font-bold">
                {editingTemplate ? `Edit: ${editingTemplate.name}` : 'Create Workout Template'}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Configure exercises, sets, rep ranges, target weight, rest timers, and backup
                alternatives
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="tpl-name" className="text-xs font-semibold">
                  Workout Name *
                </Label>
                <Input
                  id="tpl-name"
                  required
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value)}
                  placeholder="e.g. Push A — Chest, Shoulders & Triceps"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Folder</Label>
                <NativeSelect
                  value={tplFolderId ?? ''}
                  onChange={(e) => setTplFolderId(e.target.value || null)}
                  className="w-full"
                >
                  <option value="">Unfiled (No Folder)</option>
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
                  Notes / Focus
                </Label>
                <Input
                  id="tpl-desc"
                  value={tplDesc}
                  onChange={(e) => setTplDesc(e.target.value)}
                  placeholder="Optional focus notes..."
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tpl-duration" className="text-xs font-semibold">
                  Est. Duration (min)
                </Label>
                <Input
                  id="tpl-duration"
                  type="number"
                  min={10}
                  max={240}
                  value={tplDurationMin}
                  onChange={(e) => setTplDurationMin(Number(e.target.value))}
                  className="text-xs"
                />
              </div>
            </div>

            {/* Ordered Exercises Editor */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-bold">
                  Ordered Exercises ({tplExercises.length})
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
                  + Add Exercise Slot
                </Button>
              </div>

              {tplExercises.map((slot, idx) => (
                <div key={idx} className="bg-secondary/40 space-y-3 rounded-2xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-1 items-center gap-2">
                      <span className="bg-primary text-primary-foreground font-mono-tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                        {idx + 1}
                      </span>
                      <NativeSelect
                        value={slot.exerciseId}
                        onChange={(e) => {
                          const selectedEx = catalog.find((c) => c.id === e.target.value);
                          setTplExercises((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? {
                                    ...item,
                                    exerciseId: e.target.value,
                                    alternativeExerciseIds:
                                      selectedEx?.alternativeExerciseIds.slice(0, 2) ?? [],
                                  }
                                : item,
                            ),
                          );
                        }}
                        className="w-full font-semibold"
                      >
                        {catalog.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({MUSCLE_GROUP_LABELS[c.primaryMuscleGroup]})
                          </option>
                        ))}
                      </NativeSelect>
                    </div>

                    <div className="flex items-center gap-1">
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
                        title="Move Up"
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
                        title="Move Down"
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
                        Remove
                      </Button>
                    </div>
                  </div>

                  {/* Sets, Warmups, Rep Range, Target Weight, Rest */}
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-6">
                    <div>
                      <Label className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase">
                        Working Sets
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={slot.plannedSets}
                        onChange={(e) =>
                          setTplExercises((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, plannedSets: Number(e.target.value) } : item,
                            ),
                          )
                        }
                        className="font-mono-tabular h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase">
                        Warm-up Sets
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        max={10}
                        value={slot.warmupSets ?? 0}
                        onChange={(e) =>
                          setTplExercises((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, warmupSets: Number(e.target.value) } : item,
                            ),
                          )
                        }
                        className="font-mono-tabular h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase">
                        Min Reps
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={slot.targetRepsMin ?? 8}
                        onChange={(e) =>
                          setTplExercises((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, targetRepsMin: Number(e.target.value) }
                                : item,
                            ),
                          )
                        }
                        className="font-mono-tabular h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase">
                        Max Reps
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={slot.targetRepsMax ?? 12}
                        onChange={(e) =>
                          setTplExercises((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, targetRepsMax: Number(e.target.value) }
                                : item,
                            ),
                          )
                        }
                        className="font-mono-tabular h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase">
                        Target ({weightUnit})
                      </Label>
                      <Input
                        type="number"
                        step="0.5"
                        min={0}
                        value={slot.targetWeight ?? ''}
                        onChange={(e) =>
                          setTplExercises((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? {
                                    ...item,
                                    targetWeight:
                                      e.target.value === '' ? null : Number(e.target.value),
                                  }
                                : item,
                            ),
                          )
                        }
                        placeholder="Optional"
                        className="font-mono-tabular h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase">
                        Rest (sec)
                      </Label>
                      <Input
                        type="number"
                        step="15"
                        min={0}
                        max={600}
                        value={slot.restSeconds}
                        onChange={(e) =>
                          setTplExercises((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, restSeconds: Number(e.target.value) } : item,
                            ),
                          )
                        }
                        className="font-mono-tabular h-8 text-xs"
                      />
                    </div>
                  </div>

                  {/* Backup / Alternative Exercises Selector */}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <Label className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase">
                        Backup / Alternative Exercise (when machine is busy)
                      </Label>
                      <NativeSelect
                        value={slot.alternativeExerciseIds?.[0] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
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
                        className="h-8 w-full text-xs"
                      >
                        <option value="">None configured</option>
                        {catalog
                          .filter((c) => c.id !== slot.exerciseId)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({MUSCLE_GROUP_LABELS[c.primaryMuscleGroup]})
                            </option>
                          ))}
                      </NativeSelect>
                    </div>
                    <div>
                      <Label className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase">
                        Exercise Notes / Cues
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
                        placeholder="e.g. Seat height 4, pause at bottom"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter className="border-t pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowTemplateBuilder(false)}
              >
                Cancel
              </Button>
              <Button type="submit">
                {editingTemplate ? 'Save Changes' : 'Create Workout Template'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
