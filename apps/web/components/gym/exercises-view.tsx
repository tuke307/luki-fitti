'use client';

import React, { useState } from 'react';
import {
  Dumbbell,
  Search,
  Plus,
  Sparkles,
  Play,
  Trash2,
  Clock,
  ArrowRightLeft,
  Filter,
  Info,
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
import { computeExerciseProgression } from '@luki-fitti/common/utils/client';
import { ExerciseVisual } from './exercise-visual';
import {
  EQUIPMENT_LABELS,
  EquipmentType,
  EXERCISE_TYPE_LABELS,
  ExerciseCategory,
  ExerciseType,
  MUSCLE_GROUP_LABELS,
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

  const filteredCatalog = catalog.filter((ex) => {
    if (selectedMuscle !== 'ALL') {
      const matchesPrimary = ex.primaryMuscleGroup === selectedMuscle;
      const matchesSecondary = ex.secondaryMuscleGroups?.includes(selectedMuscle);
      if (!matchesPrimary && !matchesSecondary) return false;
    }
    if (selectedType !== 'ALL' && ex.exerciseType !== selectedType) return false;
    if (selectedEquipment !== 'ALL' && ex.equipment !== selectedEquipment) return false;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const matchName = ex.name.toLowerCase().includes(q);
      const matchDesc = ex.description.toLowerCase().includes(q);
      const matchTags = ex.tags.some((t) => t.toLowerCase().includes(q));
      const matchMuscle = MUSCLE_GROUP_LABELS[ex.primaryMuscleGroup].toLowerCase().includes(q);
      if (!matchName && !matchDesc && !matchTags && !matchMuscle) return false;
    }
    return true;
  });

  const stretchExercises = catalog.filter(
    (e) => e.exerciseType === ExerciseType.STRETCHING || e.exerciseType === ExerciseType.MOBILITY,
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
        newType === ExerciseType.STRETCHING
          ? ExerciseCategory.STRETCH
          : newType === ExerciseType.MOBILITY
            ? ExerciseCategory.MOBILITY
            : ExerciseCategory.COMPOUND,
      exerciseType: newType,
      primaryMuscleGroup: newPrimaryMuscle,
      secondaryMuscleGroups: newSecondaryMuscles,
      equipment: newEquipment,
      recommendedDurationSeconds:
        newType === ExerciseType.STRETCHING || newType === ExerciseType.MOBILITY
          ? newDurationSec
          : null,
      tags: newTags
        .split(',')
        .map((t) => t.trim())
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
            Exercise & Mobility Library
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm">
            {catalog.length} exercises across 13 muscle groups with visual demonstrations,
            alternatives & guided stretching flows
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
                Catalog ({catalog.length})
              </TabsTrigger>
              <TabsTrigger
                value="stretching"
                className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground truncate px-2 text-xs sm:px-3"
              >
                Stretching Studio ({stretchingRoutines.length})
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
              Custom Exercise
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
              New Routine
            </Button>
          )}
        </div>
      </div>

      {subTab === 'catalog' ? (
        <>
          {/* Search & Filters */}
          <Card className="min-w-0 overflow-hidden space-y-3 p-3.5 sm:p-4">
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2" />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search exercise, muscle, equipment, or German alias (Bankdrücken, Kniebeuge)..."
                aria-label="Search exercises"
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
                All Muscles
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
                  {MUSCLE_GROUP_LABELS[mg]}
                </Button>
              ))}
            </div>

            {/* Type & Equipment Filter Row */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 sm:gap-2">
              <div className="text-muted-foreground flex items-center gap-1 text-xs">
                <Filter className="h-3.5 w-3.5" />
                <span>Type:</span>
              </div>
              {(['ALL', ...Object.values(ExerciseType)] as const).map((tp) => (
                <Button
                  key={tp}
                  type="button"
                  variant={selectedType === tp ? 'accent' : 'secondary'}
                  size="xs"
                  onClick={() => setSelectedType(tp)}
                >
                  {tp === 'ALL' ? 'All Types' : EXERCISE_TYPE_LABELS[tp]}
                </Button>
              ))}

              <div className="w-full pt-1 sm:ml-auto sm:w-auto sm:pt-0">
                <NativeSelect
                  aria-label="Filter by equipment"
                  value={selectedEquipment}
                  onChange={(e) => setSelectedEquipment(e.target.value as EquipmentType | 'ALL')}
                  className="bg-secondary h-8 w-full text-xs sm:w-auto"
                >
                  <option value="ALL">All Equipment</option>
                  {Object.values(EquipmentType).map((eq) => (
                    <option key={eq} value={eq}>
                      {EQUIPMENT_LABELS[eq]}
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
              <p className="font-display text-base font-semibold">No matching exercises found</p>
              <p className="text-muted-foreground mt-1 text-xs">
                Try clearing filters or create a custom exercise for your training plan.
              </p>
            </Card>
          ) : (
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredCatalog.map((ex) => {
                const isStretch =
                  ex.exerciseType === ExerciseType.STRETCHING ||
                  ex.exerciseType === ExerciseType.MOBILITY;
                const altNames = ex.alternativeExerciseIds
                  .map((id) => catalog.find((c) => c.id === id)?.name)
                  .filter(Boolean);

                return (
                  <Card
                    key={ex.id}
                    onClick={() => setSelectedExercise(ex)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedExercise(ex);
                    }}
                    className="hover:border-primary/50 group min-w-0 cursor-pointer justify-between overflow-hidden p-4 transition"
                  >
                    <div>
                      <ExerciseVisual exercise={ex} variant="card" className="mb-3" />

                      <div className="flex items-start justify-between gap-2">
                        <Badge
                          variant={isStretch ? 'accent' : 'default'}
                          className="text-[11px] tracking-wide uppercase"
                        >
                          {MUSCLE_GROUP_LABELS[ex.primaryMuscleGroup]}
                        </Badge>
                        <Badge variant="secondary" className="text-muted-foreground text-[11px]">
                          {EQUIPMENT_LABELS[ex.equipment]}
                        </Badge>
                      </div>

                      <h3 className="font-display group-hover:text-primary mt-2.5 text-base font-bold transition">
                        {ex.name}
                      </h3>
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">
                        {ex.description}
                      </p>

                      {ex.secondaryMuscleGroups.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1">
                          {ex.secondaryMuscleGroups.map((sec) => (
                            <Badge
                              key={sec}
                              variant="secondary"
                              className="bg-secondary/70 text-muted-foreground px-1.5 py-0.5 text-[10px]"
                            >
                              + {MUSCLE_GROUP_LABELS[sec]}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs">
                      <div className="text-muted-foreground flex min-w-0 items-center gap-1.5">
                        {isStretch && ex.recommendedDurationSeconds ? (
                          <>
                            <Clock className="text-accent h-3.5 w-3.5 shrink-0" />
                            <span>{ex.recommendedDurationSeconds}s hold</span>
                          </>
                        ) : altNames.length > 0 ? (
                          <>
                            <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" />
                            <span className="max-w-[150px] truncate">Alt: {altNames[0]}</span>
                          </>
                        ) : (
                          <span>{EXERCISE_TYPE_LABELS[ex.exerciseType]}</span>
                        )}
                      </div>

                      {activeSession ? (
                        <Button
                          type="button"
                          size="xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            void addExerciseToSession(ex.id);
                          }}
                        >
                          + Add to Active
                        </Button>
                      ) : (
                        <span className="text-primary inline-flex shrink-0 items-center gap-1 font-semibold">
                          <Info className="h-3.5 w-3.5" /> Form & Video
                        </span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* Stretching & Mobility Studio */
        <div className="min-w-0 space-y-6">
          <Card className="border-accent/30 min-w-0 overflow-hidden p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1.5">
                <Badge variant="accent" className="rounded-full px-3 py-1 text-xs">
                  <Sparkles className="h-3.5 w-3.5" /> First-Class Mobility & Recovery Studio
                </Badge>
                <h2 className="font-display text-xl font-bold">
                  Guided Stretching Routines ({stretchingRoutines.length}) & Mobility Catalog (
                  {stretchExercises.length})
                </h2>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Launch timed stretching flows with transition bells or browse individual mobility
                  drills with visual start/finish demonstrations and breathing cues.
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
                All Routines ({stretchingRoutines.length})
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
                        <Badge variant="accent" className="text-[11px]">
                          {routine.targetArea}
                        </Badge>
                        <h3 className="font-display mt-2 text-lg font-bold">{routine.name}</h3>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-mono-tabular text-muted-foreground text-xs">
                          ~{Math.round(routine.estimatedDurationSeconds / 60)} min
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete routine ${routine.name}`}
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
                        const exName = exObj?.name ?? 'Stretch';
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
                                  <p className="text-muted-foreground truncate text-[10px]">
                                    {item.notes}
                                  </p>
                                )}
                              </div>
                            </div>
                            <span className="font-mono-tabular text-accent shrink-0 font-semibold">
                              {item.sets} ×{' '}
                              {item.durationSeconds
                                ? `${item.durationSeconds}s`
                                : `${item.reps} reps`}{' '}
                              ({item.transitionSeconds}s rest)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-5 border-t pt-3">
                    <Button
                      type="button"
                      variant="accent"
                      size="lg"
                      onClick={async () => {
                        await startStretchingSession(routine.id);
                        onStartSessionNavigation();
                      }}
                      className="w-full"
                    >
                      <Play className="h-4 w-4 fill-current" />
                      Start Stretching Session
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
                  Stretching & Mobility Exercise Catalog ({stretchExercises.length})
                </h3>
                <p className="text-muted-foreground text-xs">
                  Tap any stretch or mobility drill for visual start/finish postures, target
                  muscles, and breathing instructions
                </p>
              </div>
              <div className="scrollbar-hide -mx-1 flex max-w-full items-center gap-1.5 overflow-x-auto px-1 pb-1">
                <Button
                  type="button"
                  variant={stretchMuscleFilter === 'ALL' ? 'accent' : 'secondary'}
                  size="xs"
                  onClick={() => setStretchMuscleFilter('ALL')}
                  className="shrink-0"
                >
                  All Regions
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
                      {MUSCLE_GROUP_LABELS[mg]}
                    </Button>
                  ),
                )}
              </div>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {stretchExercises
                .filter(
                  (e) =>
                    stretchMuscleFilter === 'ALL' ||
                    e.primaryMuscleGroup === stretchMuscleFilter ||
                    e.secondaryMuscleGroups.includes(stretchMuscleFilter),
                )
                .map((ex) => (
                  <Card
                    key={ex.id}
                    onClick={() => setSelectedExercise(ex)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') setSelectedExercise(ex);
                    }}
                    className="hover:border-accent/50 group min-w-0 cursor-pointer justify-between overflow-hidden p-4 transition"
                  >
                    <div>
                      <ExerciseVisual exercise={ex} variant="card" className="mb-3" />
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="accent" className="text-[11px] uppercase">
                          {MUSCLE_GROUP_LABELS[ex.primaryMuscleGroup]}
                        </Badge>
                        <Badge variant="secondary" className="font-mono-tabular text-[11px]">
                          <Clock className="text-accent mr-1 h-3 w-3" />
                          {ex.recommendedDurationSeconds ?? 45}s hold
                        </Badge>
                      </div>
                      <h4 className="font-display group-hover:text-accent mt-2 text-base font-bold transition">
                        {ex.name}
                      </h4>
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">
                        {ex.description}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs">
                      <span className="text-muted-foreground">
                        {EXERCISE_TYPE_LABELS[ex.exerciseType]}
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="xs"
                        onClick={(ev) => {
                          ev.stopPropagation();
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
                        + Add to Routine
                      </Button>
                    </div>
                  </Card>
                ))}
            </div>
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
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          {selectedExercise && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="default" className="text-xs">
                    {MUSCLE_GROUP_LABELS[selectedExercise.primaryMuscleGroup]}
                  </Badge>
                  <Badge variant="secondary" className="text-muted-foreground text-xs">
                    {EQUIPMENT_LABELS[selectedExercise.equipment]}
                  </Badge>
                  <Badge variant="secondary" className="text-muted-foreground text-xs">
                    {EXERCISE_TYPE_LABELS[selectedExercise.exerciseType]}
                  </Badge>
                </div>
                <DialogTitle className="font-display pt-1 text-xl font-bold">
                  {selectedExercise.name}
                </DialogTitle>
                <DialogDescription className="text-sm leading-relaxed">
                  {selectedExercise.description}
                </DialogDescription>
              </DialogHeader>

              {/* Animated Visual Demonstration + Anatomical Muscle Map + Video Links */}
              <ExerciseVisual exercise={selectedExercise} variant="detail" />

              {selectedExercise.instructions.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-display text-sm font-bold">Execution Cues & Instructions</h3>
                  <ol className="space-y-2 text-xs leading-relaxed">
                    {selectedExercise.instructions.map((step, idx) => (
                      <li key={idx} className="bg-secondary/40 flex gap-2.5 rounded-xl p-2.5">
                        <span className="bg-primary text-primary-foreground flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold">
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
                    Recommended Backup / Alternative Exercises
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
                        Global Performance History ({insight.sessionsCount} sessions)
                      </h3>
                      {insight.ewma1RM > 0 && (
                        <Badge variant="default" className="font-mono-tabular text-[11px]">
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
                              <p className="text-muted-foreground text-[10px]">
                                {new Date(entry.startedAt).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {entry.workingSets.map((ws, i) => (
                                <Badge
                                  key={i}
                                  variant="secondary"
                                  className="bg-background font-mono-tabular px-1.5 py-0.5 text-[10px] font-bold"
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
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Custom Exercise Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateExercise} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="font-display text-lg font-bold">
                Create Custom Exercise
              </DialogTitle>
              <DialogDescription className="text-xs">
                Add a custom exercise to your catalog for use across any workout template.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="new-ex-name" className="text-xs font-semibold">
                Exercise Name *
              </Label>
              <Input
                id="new-ex-name"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Pendlay Row"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Primary Muscle</Label>
                <NativeSelect
                  value={newPrimaryMuscle}
                  onChange={(e) => setNewPrimaryMuscle(e.target.value as MuscleGroup)}
                  className="w-full"
                >
                  {Object.values(MuscleGroup).map((mg) => (
                    <option key={mg} value={mg}>
                      {MUSCLE_GROUP_LABELS[mg]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Exercise Type</Label>
                <NativeSelect
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as ExerciseType)}
                  className="w-full"
                >
                  {Object.values(ExerciseType).map((tp) => (
                    <option key={tp} value={tp}>
                      {EXERCISE_TYPE_LABELS[tp]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Equipment</Label>
              <NativeSelect
                value={newEquipment}
                onChange={(e) => setNewEquipment(e.target.value as EquipmentType)}
                className="w-full"
              >
                {Object.values(EquipmentType).map((eq) => (
                  <option key={eq} value={eq}>
                    {EQUIPMENT_LABELS[eq]}
                  </option>
                ))}
              </NativeSelect>
            </div>

            {(newType === ExerciseType.STRETCHING || newType === ExerciseType.MOBILITY) && (
              <div className="space-y-1.5">
                <Label htmlFor="new-ex-duration" className="text-xs font-semibold">
                  Recommended Hold Duration (sec)
                </Label>
                <Input
                  id="new-ex-duration"
                  type="number"
                  min={10}
                  max={600}
                  value={newDurationSec}
                  onChange={(e) => setNewDurationSec(Number(e.target.value))}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Secondary Muscles</Label>
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
                      {MUSCLE_GROUP_LABELS[mg]}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-ex-desc" className="text-xs font-semibold">
                Description
              </Label>
              <Textarea
                id="new-ex-desc"
                rows={2}
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Brief biomechanical summary..."
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-ex-inst" className="text-xs font-semibold">
                Instructions (one step per line)
              </Label>
              <Textarea
                id="new-ex-inst"
                rows={3}
                value={newInstructions}
                onChange={(e) => setNewInstructions(e.target.value)}
                placeholder="Step 1&#10;Step 2"
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-ex-tags" className="text-xs font-semibold">
                Search Tags (comma-separated)
              </Label>
              <Input
                id="new-ex-tags"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="row, back, compound"
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-ex-media" className="text-xs font-semibold">
                Custom Image / GIF URL (optional)
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

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Save Exercise</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Stretching Routine Modal */}
      <Dialog open={showCreateRoutineModal} onOpenChange={setShowCreateRoutineModal}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleCreateStretchingRoutine} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="font-display text-lg font-bold">
                New Stretching / Mobility Routine
              </DialogTitle>
              <DialogDescription className="text-xs">
                Build a guided stretching flow with timed holds and transition intervals.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="routine-name" className="text-xs font-semibold">
                  Routine Name *
                </Label>
                <Input
                  id="routine-name"
                  required
                  value={routineName}
                  onChange={(e) => setRoutineName(e.target.value)}
                  placeholder="Evening Hip Mobility"
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="routine-area" className="text-xs font-semibold">
                  Target Area
                </Label>
                <Input
                  id="routine-area"
                  value={routineArea}
                  onChange={(e) => setRoutineArea(e.target.value)}
                  placeholder="Hips & Lower Back"
                  className="text-xs"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Stretches & Mobility Drills</Label>
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
                  + Add Stretch
                </Button>
              </div>

              {routineItems.map((item, idx) => (
                <div key={idx} className="bg-secondary/50 space-y-2 rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <NativeSelect
                      value={item.exerciseId}
                      onChange={(e) =>
                        setRoutineItems((prev) =>
                          prev.map((p, i) =>
                            i === idx ? { ...p, exerciseId: e.target.value } : p,
                          ),
                        )
                      }
                      className="h-8 w-full text-xs"
                    >
                      {catalog.map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          {ex.name} ({EXERCISE_TYPE_LABELS[ex.exerciseType]})
                        </option>
                      ))}
                    </NativeSelect>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        setRoutineItems((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-destructive"
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground text-[10px]">Sets</span>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={item.sets}
                        onChange={(e) =>
                          setRoutineItems((prev) =>
                            prev.map((p, i) =>
                              i === idx ? { ...p, sets: Number(e.target.value) } : p,
                            ),
                          )
                        }
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[10px]">Hold (sec)</span>
                      <Input
                        type="number"
                        min={10}
                        max={600}
                        value={item.durationSeconds ?? 45}
                        onChange={(e) =>
                          setRoutineItems((prev) =>
                            prev.map((p, i) =>
                              i === idx
                                ? { ...p, durationSeconds: Number(e.target.value) }
                                : p,
                            ),
                          )
                        }
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[10px]">Transition (s)</span>
                      <Input
                        type="number"
                        min={0}
                        max={120}
                        value={item.transitionSeconds}
                        onChange={(e) =>
                          setRoutineItems((prev) =>
                            prev.map((p, i) =>
                              i === idx
                                ? { ...p, transitionSeconds: Number(e.target.value) }
                                : p,
                            ),
                          )
                        }
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowCreateRoutineModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="accent">
                Save Routine
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
