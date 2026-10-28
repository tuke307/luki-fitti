'use client';

import React, { useMemo, useState } from 'react';
import {
  Dumbbell,
  Search,
  Plus,
  Sparkles,
  Play,
  Trash2,
  ArrowRightLeft,
  Filter,
  ChevronRight,
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
import { Tabs, TabsList, TabsTrigger } from '@luki-fitti/ui/components/ui/tabs';
import { Textarea } from '@luki-fitti/ui/components/ui/textarea';
import { useGym } from '@/providers/gym/gym-context';
import { useLocale } from '@/providers/i18n/locale-context';
import {
  computeExerciseProgression,
  findSimilarExercises,
  formatDateTime,
} from '@luki-fitti/common/utils/client';
import { ExercisePicker, filterExercisesByQuery } from './exercise-picker';
import { ExerciseVisual } from './exercise-visual';
import { NumberInput } from './number-input';
import {
  EquipmentType,
  ExerciseCategory,
  ExerciseType,
  MuscleGroup,
} from '@luki-fitti/common/enums';
import type { ExerciseDto } from '@luki-fitti/common/schemas';

interface ExercisesViewProps {
  onStartSessionNavigation: () => void;
}

export function ExercisesView({ onStartSessionNavigation }: ExercisesViewProps) {
  const {
    catalog,
    stretchingRoutines,
    createCustomExercise,
    createStretchingRoutine,
    deleteStretchingRoutine,
    startStretchingSession,
    activeSession,
    historySessions,
    weightUnit,
    addExerciseToSession,
  } = useGym();
  const { t, format, muscleLabel, equipmentLabel, exerciseTypeLabel } = useLocale();

  const [subTab, setSubTab] = useState<'catalog' | 'stretching'>('catalog');
  const [search, setSearch] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | 'ALL'>('ALL');
  const [selectedType, setSelectedType] = useState<ExerciseType | 'ALL'>('ALL');
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentType | 'ALL'>('ALL');
  const [selectedExercise, setSelectedExercise] = useState<ExerciseDto | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateRoutineModal, setShowCreateRoutineModal] = useState(false);

  // New Custom Exercise state
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newInstructions, setNewInstructions] = useState('');
  const [newPrimaryMuscle, setNewPrimaryMuscle] = useState<MuscleGroup>(MuscleGroup.CHEST);
  const [newSecondaryMuscles, setNewSecondaryMuscles] = useState<MuscleGroup[]>([]);
  const [newEquipment, setNewEquipment] = useState<EquipmentType>(EquipmentType.DUMBBELL);
  const [newType, setNewType] = useState<ExerciseType>(ExerciseType.STRENGTH);
  const [newDurationSec, setNewDurationSec] = useState<number>(45);
  const [newTags, setNewTags] = useState('');
  const [newMediaUrl, setNewMediaUrl] = useState('');
  const [stretchAreaFilter, setStretchAreaFilter] = useState<string>('ALL');
  const [stretchMuscleFilter, setStretchMuscleFilter] = useState<MuscleGroup | 'ALL'>('ALL');

  // New Stretching Routine state
  const [routineName, setRoutineName] = useState('');
  const [routineArea, setRoutineArea] = useState('Full Body & Mobility');
  const [routineDesc, setRoutineDesc] = useState('');
  const [routineItems, setRoutineItems] = useState<
    Array<{
      exerciseId: string;
      sets: number;
      durationSeconds: number | null;
      reps: number | null;
      transitionSeconds: number;
    }>
  >([]);

  // Before creating a custom exercise, point to catalog exercises that probably mean the same.
  const similarExercises = useMemo(
    () =>
      newName.trim().length >= 3
        ? findSimilarExercises(
            newName,
            catalog.filter((c) => c.isSystem),
          )
        : [],
    [catalog, newName],
  );

  const filteredCatalog = useMemo(() => {
    const base = filterExercisesByQuery(catalog, search, selectedMuscle);
    return base.filter((ex) => {
      if (selectedType !== 'ALL' && ex.exerciseType !== selectedType) return false;
      if (selectedEquipment !== 'ALL' && ex.equipment !== selectedEquipment) return false;
      return true;
    });
  }, [catalog, search, selectedMuscle, selectedType, selectedEquipment]);

  const stretchExercises = useMemo(
    () => catalog.filter((e) => e.exerciseType === ExerciseType.STRETCHING),
    [catalog],
  );

  const prioritizedStretchCatalog = useMemo(
    () => [
      ...stretchExercises,
      ...catalog.filter((e) => e.exerciseType !== ExerciseType.STRETCHING),
    ],
    [catalog, stretchExercises],
  );

  const handleCreateExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await createCustomExercise({
      name: newName.trim(),
      description: newDesc.trim() || `${newName.trim()} custom exercise`,
      instructions: newInstructions
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      category:
        newType === ExerciseType.STRETCHING ? ExerciseCategory.STRETCH : ExerciseCategory.COMPOUND,
      exerciseType: newType,
      primaryMuscleGroup: newPrimaryMuscle,
      secondaryMuscleGroups: newSecondaryMuscles,
      equipment: newEquipment,
      recommendedDurationSeconds: newType === ExerciseType.STRETCHING ? newDurationSec : null,
      tags: newTags
        .split(',')
        .map((tItem) => tItem.trim())
        .filter(Boolean),
      alternativeExerciseIds: [],
      ...(newMediaUrl.trim() ? { mediaUrl: newMediaUrl.trim() } : {}),
    });
    setNewName('');
    setNewDesc('');
    setNewInstructions('');
    setNewTags('');
    setNewMediaUrl('');
    setShowCreateModal(false);
  };

  const handleCreateStretchingRoutine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!routineName.trim() || routineItems.length === 0) return;
    const totalSec = routineItems.reduce(
      (acc, item) =>
        acc + item.sets * ((item.durationSeconds ?? 45) + (item.transitionSeconds ?? 15)),
      0,
    );
    await createStretchingRoutine({
      name: routineName.trim(),
      targetArea: routineArea.trim() || 'Full Body',
      description: routineDesc.trim() || null,
      estimatedDurationSeconds: totalSec,
      exercises: routineItems.map((it, idx) => ({
        exerciseId: it.exerciseId,
        orderIndex: idx,
        sets: it.sets,
        durationSeconds: it.durationSeconds,
        reps: it.reps,
        transitionSeconds: it.transitionSeconds,
      })),
    });
    setRoutineName('');
    setRoutineDesc('');
    setRoutineItems([]);
    setShowCreateRoutineModal(false);
  };

  return (
    <div className="min-w-0 max-w-full space-y-6 pb-10">
      {/* Header & Sub-navigation */}
      <div className="flex flex-col gap-3.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            {t.exercises.title}
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm">
            {format(t.exercises.subtitle, { count: catalog.length })}
          </p>
        </div>

        <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
          <Tabs
            value={subTab}
            onValueChange={(val) => setSubTab(val as 'catalog' | 'stretching')}
            className="w-full min-w-0 sm:w-auto"
          >
            <TabsList className="grid w-full grid-cols-2 sm:inline-flex sm:w-auto">
              <TabsTrigger value="catalog" className="truncate px-2 text-xs sm:px-3">
                {format(t.exercises.catalogTab, { count: catalog.length })}
              </TabsTrigger>
              <TabsTrigger
                value="stretching"
                className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground truncate px-2 text-xs sm:px-3"
              >
                {format(t.exercises.stretchingTab, { count: stretchingRoutines.length })}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {subTab === 'catalog' ? (
            <Button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="w-full shrink-0 sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              {t.exercises.customExerciseBtn}
            </Button>
          ) : (
            <Button
              type="button"
              variant="accent"
              onClick={() => {
                if (routineItems.length === 0 && stretchExercises[0]) {
                  setRoutineItems([
                    {
                      exerciseId: stretchExercises[0].id,
                      sets: 2,
                      durationSeconds: 45,
                      reps: null,
                      transitionSeconds: 15,
                    },
                  ]);
                }
                setShowCreateRoutineModal(true);
              }}
              className="w-full shrink-0 sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              {t.exercises.newRoutineBtn}
            </Button>
          )}
        </div>
      </div>

      {subTab === 'catalog' ? (
        <>
          {/* Search & Filters */}
          <Card className="min-w-0 space-y-3 overflow-hidden p-3.5 sm:p-4">
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2" />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.exercises.searchPlaceholder}
                aria-label={t.exercises.searchPlaceholder}
                className="h-10 pr-4 pl-10 text-xs sm:text-sm"
              />
            </div>

            {/* Muscle Group Pills */}
            <div className="scrollbar-hide -mx-1 flex max-w-full items-center gap-1.5 overflow-x-auto px-1 pb-1">
              <Button
                type="button"
                variant={selectedMuscle === 'ALL' ? 'default' : 'secondary'}
                size="xs"
                onClick={() => setSelectedMuscle('ALL')}
                className="shrink-0"
              >
                {t.exercises.allMuscles}
              </Button>
              {Object.values(MuscleGroup).map((mg) => (
                <Button
                  key={mg}
                  type="button"
                  variant={selectedMuscle === mg ? 'default' : 'secondary'}
                  size="xs"
                  onClick={() => setSelectedMuscle(mg)}
                  className="shrink-0"
                >
                  {muscleLabel(mg)}
                </Button>
              ))}
            </div>

            {/* Type & Equipment Filter Row */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 sm:gap-2">
              <div className="text-muted-foreground flex items-center gap-1 text-xs">
                <Filter className="h-3.5 w-3.5" />
                <span>{t.exercises.typeLabel}</span>
              </div>
              {(['ALL', ...Object.values(ExerciseType)] as const).map((tp) => (
                <Button
                  key={tp}
                  type="button"
                  variant={selectedType === tp ? 'accent' : 'secondary'}
                  size="xs"
                  onClick={() => setSelectedType(tp)}
                >
                  {tp === 'ALL' ? t.exercises.allTypes : exerciseTypeLabel(tp)}
                </Button>
              ))}

              <div className="w-full pt-1 sm:ml-auto sm:w-auto sm:pt-0">
                <NativeSelect
                  aria-label="Filter by equipment"
                  value={selectedEquipment}
                  onChange={(e) => setSelectedEquipment(e.target.value as EquipmentType | 'ALL')}
                  className="w-full sm:w-auto"
                >
                  <option value="ALL">{t.exercises.allEquipment}</option>
                  {Object.values(EquipmentType).map((eq) => (
                    <option key={eq} value={eq}>
                      {equipmentLabel(eq)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
          </Card>

          {/* Exercise Cards Grid */}
          {filteredCatalog.length === 0 ? (
            <Card className="p-10 text-center">
              <Dumbbell className="text-muted-foreground mx-auto mb-3 h-10 w-10 opacity-50" />
              <p className="font-display text-base font-semibold">{t.exercises.noMatchingTitle}</p>
              <p className="text-muted-foreground mt-1 text-xs">{t.exercises.noMatchingSub}</p>
            </Card>
          ) : (
            <ul className="bg-card divide-border/70 divide-y overflow-hidden rounded-[1.25rem]">
              {filteredCatalog.map((ex) => {
                const isStretch = ex.exerciseType === ExerciseType.STRETCHING;
                return (
                  <li key={ex.id} className="flex items-center gap-3 px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => setSelectedExercise(ex)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <ExerciseVisual exercise={ex} variant="thumbnail" className="h-12 w-14" />
                      <span className="min-w-0 flex-1">
                        <h3 className="truncate text-[17px] font-medium">{ex.name}</h3>
                        <span className="text-muted-foreground block truncate text-[13px]">
                          {muscleLabel(ex.primaryMuscleGroup)} · {equipmentLabel(ex.equipment)}
                          {isStretch && ex.recommendedDurationSeconds
                            ? ` · ${ex.recommendedDurationSeconds}${t.exercises.holdSuffix}`
                            : ''}
                        </span>
                      </span>
                    </button>
                    {activeSession ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="accent"
                        onClick={() => void addExerciseToSession(ex.id)}
                        className="shrink-0"
                      >
                        {t.exercises.addToActiveBtn}
                      </Button>
                    ) : (
                      <ChevronRight
                        aria-hidden="true"
                        className="text-muted-foreground h-4 w-4 shrink-0"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        /* Stretching & Mobility Studio */
        <div className="min-w-0 space-y-6">
          <Card className="border-accent/30 min-w-0 overflow-hidden p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1.5">
                <Badge variant="accent" className="rounded-full px-3 py-1 text-xs">
                  <Sparkles className="h-3.5 w-3.5" /> {t.exercises.studioBadge}
                </Badge>
                <h2 className="font-display text-xl font-bold">
                  {format(t.exercises.studioTitle, {
                    routines: stretchingRoutines.length,
                    drills: stretchExercises.length,
                  })}
                </h2>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {t.exercises.studioDesc}
                </p>
              </div>
            </div>

            {/* Routine Target Area Filter Pills */}
            <div className="scrollbar-hide -mx-1 mt-3 flex max-w-full items-center gap-1.5 overflow-x-auto px-1 pb-1">
              <Button
                type="button"
                variant={stretchAreaFilter === 'ALL' ? 'accent' : 'secondary'}
                size="xs"
                onClick={() => setStretchAreaFilter('ALL')}
                className="shrink-0"
              >
                {format(t.exercises.allRoutinesPill, { count: stretchingRoutines.length })}
              </Button>
              {Array.from(new Set(stretchingRoutines.map((r) => r.targetArea))).map((area) => (
                <Button
                  key={area}
                  type="button"
                  variant={stretchAreaFilter === area ? 'accent' : 'secondary'}
                  size="xs"
                  onClick={() => setStretchAreaFilter(area)}
                  className="shrink-0"
                >
                  {area}
                </Button>
              ))}
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {stretchingRoutines
              .filter((r) => stretchAreaFilter === 'ALL' || r.targetArea === stretchAreaFilter)
              .map((routine) => (
                <Card key={routine.id} className="min-w-0 justify-between p-4 sm:p-5">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Badge variant="accent" className="text-xs">
                          {routine.targetArea}
                        </Badge>
                        <h3 className="font-display mt-2 text-lg font-bold">{routine.name}</h3>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="tabular-nums text-muted-foreground text-xs">
                          ~{Math.round(routine.estimatedDurationSeconds / 60)} {t.common.min}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={format(t.exercises.deleteRoutineAria, { name: routine.name })}
                          onClick={() => void deleteStretchingRoutine(routine.id)}
                          className="text-muted-foreground hover:text-destructive size-8"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {routine.description && (
                      <p className="text-muted-foreground mt-1.5 text-xs">{routine.description}</p>
                    )}

                    <div className="mt-4 space-y-2">
                      {routine.exercises.map((item, idx) => {
                        const exObj =
                          item.exercise ?? catalog.find((c) => c.id === item.exerciseId);
                        const exName = exObj?.name ?? t.common.stretch;
                        return (
                          <div
                            key={item.id ?? idx}
                            onClick={() => {
                              if (exObj) setSelectedExercise(exObj);
                            }}
                            className="bg-secondary/50 hover:bg-secondary/80 flex cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs transition"
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              {exObj && (
                                <ExerciseVisual
                                  exercise={exObj}
                                  variant="thumbnail"
                                  className="h-9 w-12"
                                />
                              )}
                              <div className="min-w-0">
                                <p className="truncate font-semibold">
                                  {idx + 1}. {exName}
                                </p>
                                {item.notes && (
                                  <p className="text-muted-foreground truncate text-xs">
                                    {item.notes}
                                  </p>
                                )}
                              </div>
                            </div>
                            <span className="tabular-nums text-accent shrink-0 font-semibold">
                              {item.sets} ×{' '}
                              {item.durationSeconds
                                ? `${item.durationSeconds}s`
                                : `${item.reps} ${t.common.reps}`}{' '}
                              ({item.transitionSeconds}
                              {t.workouts.restSuffix})
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-5 border-t pt-3">
                    <Button
                      type="button"
                      data-testid={`start-routine-${routine.name}`}
                      variant="accent"
                      size="lg"
                      onClick={async () => {
                        await startStretchingSession(routine.id);
                        onStartSessionNavigation();
                      }}
                      className="w-full"
                    >
                      <Play className="h-4 w-4 fill-current" />
                      {t.exercises.startStretchingSessionBtn}
                    </Button>
                  </div>
                </Card>
              ))}
          </div>

          {/* Individual Stretching & Mobility Drills Catalog */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-display text-lg font-bold">
                  {format(t.exercises.stretchCatalogTitle, { count: stretchExercises.length })}
                </h3>
                <p className="text-muted-foreground text-xs">{t.exercises.stretchCatalogSub}</p>
              </div>
              <div className="scrollbar-hide -mx-1 flex max-w-full items-center gap-1.5 overflow-x-auto px-1 pb-1">
                <Button
                  type="button"
                  variant={stretchMuscleFilter === 'ALL' ? 'accent' : 'secondary'}
                  size="xs"
                  onClick={() => setStretchMuscleFilter('ALL')}
                  className="shrink-0"
                >
                  {t.exercises.allRegionsPill}
                </Button>
                {Array.from(new Set(stretchExercises.map((e) => e.primaryMuscleGroup))).map(
                  (mg) => (
                    <Button
                      key={mg}
                      type="button"
                      variant={stretchMuscleFilter === mg ? 'accent' : 'secondary'}
                      size="xs"
                      onClick={() => setStretchMuscleFilter(mg)}
                      className="shrink-0"
                    >
                      {muscleLabel(mg)}
                    </Button>
                  ),
                )}
              </div>
            </div>

            <ul className="bg-card divide-border/70 divide-y overflow-hidden rounded-[1.25rem]">
              {stretchExercises
                .filter(
                  (e) =>
                    stretchMuscleFilter === 'ALL' ||
                    e.primaryMuscleGroup === stretchMuscleFilter ||
                    e.secondaryMuscleGroups.includes(stretchMuscleFilter),
                )
                .map((ex) => (
                  <li key={ex.id} className="flex items-center gap-3 px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => setSelectedExercise(ex)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <ExerciseVisual exercise={ex} variant="thumbnail" className="h-12 w-14" />
                      <span className="min-w-0 flex-1">
                        <h4 className="truncate text-[17px] font-medium">{ex.name}</h4>
                        <span className="text-muted-foreground block truncate text-[13px] tabular-nums">
                          {muscleLabel(ex.primaryMuscleGroup)} ·{' '}
                          {ex.recommendedDurationSeconds ?? 45}
                          {t.exercises.holdSuffix}
                        </span>
                      </span>
                    </button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      className="shrink-0"
                      onClick={() => {
                        setRoutineItems((prev) => [
                          ...prev,
                          {
                            exerciseId: ex.id,
                            sets: 2,
                            durationSeconds: ex.recommendedDurationSeconds ?? 45,
                            reps: null,
                            transitionSeconds: 15,
                          },
                        ]);
                        setShowCreateRoutineModal(true);
                      }}
                    >
                      {t.exercises.addToRoutineBtn}
                    </Button>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      )}

      {/* Exercise Detail Modal */}
      <Dialog
        open={Boolean(selectedExercise)}
        onOpenChange={(open) => {
          if (!open) setSelectedExercise(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-hidden p-4 sm:max-w-xl sm:p-6">
          {selectedExercise && (
            <div className="flex max-h-[calc(90dvh-2.5rem)] min-w-0 flex-col gap-3 overflow-hidden">
              <DialogHeader className="shrink-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="default" className="text-xs">
                    {muscleLabel(selectedExercise.primaryMuscleGroup)}
                  </Badge>
                  <Badge variant="secondary" className="text-muted-foreground text-xs">
                    {equipmentLabel(selectedExercise.equipment)}
                  </Badge>
                  <Badge variant="secondary" className="text-muted-foreground text-xs">
                    {exerciseTypeLabel(selectedExercise.exerciseType)}
                  </Badge>
                </div>
                <DialogTitle className="font-display pt-1 text-xl font-bold">
                  {selectedExercise.name}
                </DialogTitle>
                <DialogDescription className="text-xs leading-relaxed sm:text-sm">
                  {selectedExercise.description}
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-0.5">
                {/* Animated Visual Demonstration + Anatomical Muscle Map + Video Links */}
                <ExerciseVisual exercise={selectedExercise} variant="detail" />

                {selectedExercise.instructions.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-display text-sm font-bold">
                      {t.exercises.executionCuesTitle}
                    </h3>
                    <ol className="space-y-2 text-xs leading-relaxed">
                      {selectedExercise.instructions.map((step, idx) => (
                        <li key={idx} className="bg-secondary/40 flex gap-2.5 rounded-xl p-2.5">
                          <span className="bg-primary text-primary-foreground flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                            {idx + 1}
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {selectedExercise.alternativeExerciseIds.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-display text-sm font-bold">
                      {t.exercises.recommendedBackupsTitle}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedExercise.alternativeExerciseIds.map((altId) => {
                        const alt = catalog.find((c) => c.id === altId);
                        if (!alt) return null;
                        return (
                          <Button
                            key={alt.id}
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setSelectedExercise(alt)}
                          >
                            <ArrowRightLeft className="text-primary h-3.5 w-3.5" />
                            <span>{alt.name}</span>
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Global Exercise History (Single Source of Truth across all workouts) */}
                {(() => {
                  const insight = computeExerciseProgression({
                    exerciseId: selectedExercise.id,
                    exerciseName: selectedExercise.name,
                    historySessions,
                    catalogExercise: selectedExercise,
                    weightUnit,
                  });
                  if (insight.history.length === 0) return null;
                  return (
                    <div className="space-y-2 border-t pt-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-sm font-bold">
                          {format(t.exercises.globalHistoryTitle, { count: insight.sessionsCount })}
                        </h3>
                        {insight.ewma1RM > 0 && (
                          <Badge variant="default" className="tabular-nums text-xs">
                            e1RM {insight.ewma1RM} {weightUnit.toLowerCase()}
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {insight.history
                          .slice(-4)
                          .reverse()
                          .map((entry) => (
                            <div
                              key={entry.clientSessionId}
                              className="bg-secondary/40 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs"
                            >
                              <div>
                                <p className="font-semibold">{entry.workoutName}</p>
                                <p className="text-muted-foreground tabular-nums text-xs">
                                  {formatDateTime(entry.startedAt)}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {entry.workingSets.map((ws, i) => (
                                  <Badge
                                    key={i}
                                    variant="secondary"
                                    className="bg-background tabular-nums px-1.5 py-0.5 text-xs font-bold"
                                  >
                                    {ws.weightNormalized}
                                    {weightUnit.toLowerCase()} × {ws.reps}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Custom Exercise Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-h-[90dvh] overflow-hidden p-4 sm:max-w-md sm:p-6">
          <form
            onSubmit={handleCreateExercise}
            className="flex max-h-[calc(90dvh-2.5rem)] min-w-0 flex-col gap-3 overflow-hidden"
          >
            <DialogHeader className="shrink-0">
              <DialogTitle className="font-display text-lg font-bold">
                {t.exercises.createCustomTitle}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {t.exercises.createCustomDesc}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto pr-0.5">
              <div className="space-y-1.5">
                <Label htmlFor="new-ex-name" className="text-xs font-semibold">
                  {t.exercises.exerciseNameLabel}
                </Label>
                <Input
                  id="new-ex-name"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t.exercises.exerciseNamePlaceholder}
                />
                {similarExercises.length > 0 && (
                  <div
                    data-testid="similar-exercises"
                    className="bg-secondary/60 space-y-1.5 rounded-xl p-2.5"
                  >
                    <p className="text-muted-foreground text-xs font-semibold">
                      {t.exercises.similarExercisesTitle}
                    </p>
                    {similarExercises.map(({ exercise }) => (
                      <button
                        key={exercise.id}
                        type="button"
                        onClick={() => {
                          setShowCreateModal(false);
                          setSelectedExercise(exercise);
                        }}
                        className="bg-card hover:bg-secondary flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors"
                      >
                        <ExerciseVisual
                          exercise={exercise}
                          variant="thumbnail"
                          className="h-9 w-11"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">
                            {exercise.name}
                          </span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {muscleLabel(exercise.primaryMuscleGroup)} ·{' '}
                            {equipmentLabel(exercise.equipment)}
                          </span>
                        </span>
                      </button>
                    ))}
                    <p className="text-muted-foreground text-xs">
                      {t.exercises.similarExercisesHint}
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">{t.exercises.primaryMuscleLabel}</Label>
                  <NativeSelect
                    value={newPrimaryMuscle}
                    onChange={(e) => setNewPrimaryMuscle(e.target.value as MuscleGroup)}
                    className="w-full"
                  >
                    {Object.values(MuscleGroup).map((mg) => (
                      <option key={mg} value={mg}>
                        {muscleLabel(mg)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">{t.exercises.exerciseTypeLabel}</Label>
                  <NativeSelect
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as ExerciseType)}
                    className="w-full"
                  >
                    {Object.values(ExerciseType).map((tp) => (
                      <option key={tp} value={tp}>
                        {exerciseTypeLabel(tp)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{t.exercises.equipmentLabel}</Label>
                <NativeSelect
                  value={newEquipment}
                  onChange={(e) => setNewEquipment(e.target.value as EquipmentType)}
                  className="w-full"
                >
                  {Object.values(EquipmentType).map((eq) => (
                    <option key={eq} value={eq}>
                      {equipmentLabel(eq)}
                    </option>
                  ))}
                </NativeSelect>
              </div>

              {newType === ExerciseType.STRETCHING && (
                <div className="space-y-1.5">
                  <Label htmlFor="new-ex-duration" className="text-xs font-semibold">
                    {t.exercises.recommendedHoldLabel}
                  </Label>
                  <NumberInput
                    id="new-ex-duration"
                    min={10}
                    max={600}
                    fallbackValue={45}
                    value={newDurationSec}
                    onValueChange={(val) => setNewDurationSec(val)}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{t.exercises.secondaryMusclesLabel}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.values(MuscleGroup).map((mg) => {
                    const active = newSecondaryMuscles.includes(mg);
                    return (
                      <Button
                        key={mg}
                        type="button"
                        variant={active ? 'default' : 'secondary'}
                        size="xs"
                        onClick={() =>
                          setNewSecondaryMuscles((prev) =>
                            active ? prev.filter((m) => m !== mg) : [...prev, mg],
                          )
                        }
                      >
                        {muscleLabel(mg)}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-ex-desc" className="text-xs font-semibold">
                  {t.exercises.descriptionLabel}
                </Label>
                <Textarea
                  id="new-ex-desc"
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder={t.exercises.descriptionPlaceholder}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-ex-inst" className="text-xs font-semibold">
                  {t.exercises.instructionsLabel}
                </Label>
                <Textarea
                  id="new-ex-inst"
                  rows={3}
                  value={newInstructions}
                  onChange={(e) => setNewInstructions(e.target.value)}
                  placeholder={t.exercises.instructionsPlaceholder}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-ex-tags" className="text-xs font-semibold">
                  {t.exercises.searchTagsLabel}
                </Label>
                <Input
                  id="new-ex-tags"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder={t.exercises.searchTagsPlaceholder}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-ex-media" className="text-xs font-semibold">
                  {t.exercises.customMediaLabel}
                </Label>
                <Input
                  id="new-ex-media"
                  type="url"
                  value={newMediaUrl}
                  onChange={(e) => setNewMediaUrl(e.target.value)}
                  placeholder="https://example.com/exercise-demo.gif"
                  className="text-xs"
                />
              </div>
            </div>

            <DialogFooter className="shrink-0 border-t pt-3">
              <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>
                {t.common.cancel}
              </Button>
              <Button type="submit">{t.exercises.saveExerciseBtn}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Stretching Routine Modal */}
      <Dialog open={showCreateRoutineModal} onOpenChange={setShowCreateRoutineModal}>
        <DialogContent className="max-h-[90dvh] overflow-hidden p-4 sm:max-w-lg sm:p-6">
          <form
            onSubmit={handleCreateStretchingRoutine}
            className="flex max-h-[calc(90dvh-2.5rem)] min-w-0 flex-col gap-3 overflow-hidden"
          >
            <DialogHeader className="shrink-0">
              <DialogTitle className="font-display text-lg font-bold">
                {t.exercises.newRoutineTitle}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {t.exercises.newRoutineDesc}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto pr-0.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="routine-name" className="text-xs font-semibold">
                    {t.exercises.routineNameLabel}
                  </Label>
                  <Input
                    id="routine-name"
                    required
                    value={routineName}
                    onChange={(e) => setRoutineName(e.target.value)}
                    placeholder={t.exercises.routineNamePlaceholder}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="routine-area" className="text-xs font-semibold">
                    {t.exercises.targetAreaLabel}
                  </Label>
                  <Input
                    id="routine-area"
                    value={routineArea}
                    onChange={(e) => setRoutineArea(e.target.value)}
                    placeholder={t.exercises.targetAreaPlaceholder}
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">
                    {t.exercises.stretchesDrillsLabel}
                  </Label>
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    onClick={() => {
                      const fallback = stretchExercises[0] ?? catalog[0];
                      if (!fallback) return;
                      setRoutineItems((prev) => [
                        ...prev,
                        {
                          exerciseId: fallback.id,
                          sets: 2,
                          durationSeconds: 45,
                          reps: null,
                          transitionSeconds: 15,
                        },
                      ]);
                    }}
                    className="text-accent h-auto p-0 text-xs font-bold"
                  >
                    {t.exercises.addStretchBtn}
                  </Button>
                </div>

                {routineItems.map((item, idx) => (
                  <div key={idx} className="bg-secondary/50 min-w-0 space-y-2 rounded-xl p-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <ExercisePicker
                        exercises={prioritizedStretchCatalog}
                        value={item.exerciseId}
                        onValueChange={(newExId) =>
                          setRoutineItems((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, exerciseId: newExId } : p)),
                          )
                        }
                        className="w-full flex-1"
                        triggerClassName="h-9 sm:h-8 text-xs"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setRoutineItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-destructive shrink-0"
                      >
                        {t.common.remove}
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground text-xs">
                          {t.exercises.setsLabel}
                        </span>
                        <NumberInput
                          min={1}
                          max={10}
                          fallbackValue={2}
                          value={item.sets}
                          onValueChange={(val) =>
                            setRoutineItems((prev) =>
                              prev.map((p, i) => (i === idx ? { ...p, sets: val } : p)),
                            )
                          }
                          className="h-10"
                        />
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">
                          {t.exercises.holdSecLabel}
                        </span>
                        <NumberInput
                          min={10}
                          max={600}
                          fallbackValue={45}
                          value={item.durationSeconds ?? 45}
                          onValueChange={(val) =>
                            setRoutineItems((prev) =>
                              prev.map((p, i) => (i === idx ? { ...p, durationSeconds: val } : p)),
                            )
                          }
                          className="h-10"
                        />
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">
                          {t.exercises.transitionSecLabel}
                        </span>
                        <NumberInput
                          min={0}
                          max={120}
                          fallbackValue={15}
                          value={item.transitionSeconds}
                          onValueChange={(val) =>
                            setRoutineItems((prev) =>
                              prev.map((p, i) =>
                                i === idx ? { ...p, transitionSeconds: val } : p,
                              ),
                            )
                          }
                          className="h-10"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="shrink-0 border-t pt-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowCreateRoutineModal(false)}
              >
                {t.common.cancel}
              </Button>
              <Button type="submit" variant="accent">
                {t.exercises.saveRoutineBtn}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
