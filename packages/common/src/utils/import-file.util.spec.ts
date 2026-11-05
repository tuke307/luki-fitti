import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EquipmentType,
  ExerciseCategory,
  ExerciseType,
  MuscleGroup,
  SessionExerciseOrigin,
  SessionExerciseStatus,
  SessionStatus,
  SessionType,
  SetType,
  WeightUnit,
} from '../enums';
import {
  ImportFileSchema,
  type ExerciseDto,
  type WorkoutFolderDto,
  type WorkoutSessionDto,
  type WorkoutTemplateDto,
} from '../schemas';
import { buildImportFile } from './import-file.util';

function exercise(id: string, overrides: Partial<ExerciseDto> = {}): ExerciseDto {
  return {
    id,
    slug: id.replace(/^ex-/, ''),
    userId: null,
    name: id,
    description: '',
    instructions: [],
    category: ExerciseCategory.COMPOUND,
    exerciseType: ExerciseType.STRENGTH,
    primaryMuscleGroup: MuscleGroup.CHEST,
    secondaryMuscleGroups: [],
    equipment: EquipmentType.BARBELL,
    recommendedDurationSeconds: null,
    tags: [],
    isSystem: true,
    alternativeExerciseIds: [],
    ...overrides,
  };
}

const bench = exercise('ex-barbell-bench-press-medium-grip');
const custom = exercise('7c0f6d1e-custom', {
  slug: 'my-press-abc',
  userId: 'user-1',
  name: 'My Press',
  isSystem: false,
  instructions: ['Push.', '  '],
});

function template(id: string, folderId: string | null): WorkoutTemplateDto {
  return {
    id,
    userId: 'user-1',
    folderId,
    name: 'Push',
    description: null,
    estimatedDurationMinutes: 60,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    exercises: [
      {
        id: `${id}-te1`,
        templateId: id,
        exerciseId: bench.id,
        sets: null,
        orderIndex: 0,
        plannedSets: 3,
        warmupSets: 1,
        targetRepsMin: 8,
        targetRepsMax: 12,
        targetWeight: 80,
        weightUnit: WeightUnit.KG,
        restSeconds: 120,
        targetDurationSeconds: null,
        targetDistanceMeters: null,
        notes: null,
        alternativeExerciseIds: [custom.id, 'ex-unknown'],
      },
      {
        id: `${id}-te2`,
        templateId: id,
        exerciseId: 'deleted-exercise',
        orderIndex: 1,
        plannedSets: 3,
        warmupSets: 0,
        targetRepsMin: 8,
        targetRepsMax: 12,
        targetWeight: null,
        weightUnit: WeightUnit.KG,
        restSeconds: 90,
        targetDurationSeconds: null,
        targetDistanceMeters: null,
        notes: null,
        alternativeExerciseIds: [],
      },
    ],
  };
}

function session(id: string, status: SessionStatus, templateId: string | null): WorkoutSessionDto {
  return {
    id,
    clientSessionId: id,
    userId: 'user-1',
    templateId,
    stretchingRoutineId: null,
    sessionType: SessionType.STRENGTH,
    workoutNameSnapshot: 'Push',
    status,
    startedAt: '2026-10-30T17:00:00.000Z',
    pausedAt: null,
    completedAt: status === SessionStatus.COMPLETED ? '2026-10-30T18:00:00.000Z' : null,
    activeDurationSeconds: 3600,
    weightUnit: WeightUnit.KG,
    totalVolumeKg: 0,
    totalSetsCompleted: 0,
    totalRepsCompleted: 0,
    totalStretchSeconds: 0,
    notes: null,
    restTimerEndsAt: null,
    restTimerDurationSec: null,
    restTimerPausedRemSec: null,
    version: 1,
    lastSyncedAt: '2026-10-30T18:00:00.000Z',
    exercises: [custom.id, null].map((exerciseId, i) => ({
      id: `${id}-e${i}`,
      clientExerciseId: `${id}-e${i}`,
      sessionId: id,
      exerciseId,
      replacedExerciseId: null,
      replacedExerciseName: null,
      exerciseNameSnapshot: 'My Press',
      primaryMuscleSnapshot: MuscleGroup.CHEST,
      exerciseTypeSnapshot: ExerciseType.STRENGTH,
      origin: SessionExerciseOrigin.PLANNED,
      status: SessionExerciseStatus.COMPLETED,
      orderIndex: i,
      plannedSets: 1,
      plannedWarmupSets: 0,
      targetRepsMin: null,
      targetRepsMax: null,
      targetWeight: null,
      targetDurationSeconds: null,
      restSeconds: 90,
      alternativeExerciseIds: [],
      notes: null,
      sets: [
        {
          id: `${id}-s${i}`,
          clientSetId: `${id}-s${i}`,
          sessionExerciseId: `${id}-e${i}`,
          setNumber: 7,
          setType: SetType.WORKING,
          weight: 2000,
          weightUnit: WeightUnit.KG,
          reps: 8,
          durationSeconds: null,
          distanceMeters: null,
          rpe: 8.5,
          completed: true,
          completedAt: null,
          isPersonalRecord: false,
          notes: null,
        },
      ],
    })),
  };
}

describe('buildImportFile', () => {
  const folder: WorkoutFolderDto = {
    id: 'folder-1',
    userId: 'user-1',
    name: 'Split',
    color: '#3A7BD5',
    sortOrder: 0,
    templates: [template('tpl-1', 'folder-1')],
  };
  const file = buildImportFile({
    folders: [folder],
    unfiledTemplates: [template('tpl-2', null)],
    historySessions: [
      session('s-1', SessionStatus.COMPLETED, 'tpl-1'),
      session('s-2', SessionStatus.IN_PROGRESS, null),
      session('s-3', SessionStatus.COMPLETED, 'deleted-template'),
    ],
    catalog: [bench, custom],
    customExercises: [custom],
    sourceApp: 'LukiFitti Web',
    exportedAt: new Date('2026-11-01T00:00:00Z'),
  });

  it('produces a file that validates against the import schema', () => {
    const result = ImportFileSchema.safeParse(file);
    assert.equal(result.success, true, JSON.stringify(result.error?.issues));
  });

  it('uses entity ids as keys and references exercises by slug or custom key', () => {
    assert.deepEqual(
      file.customExercises.map((e) => [e.key, e.instructions]),
      [[custom.id, ['Push.']]],
    );
    const [t1, t2] = file.templates;
    assert.equal(t1!.folderKey, 'folder-1');
    assert.equal(t2!.folderKey, undefined);
    assert.deepEqual(t1!.exercises.length, 1);
    assert.deepEqual(t1!.exercises[0]!.exercise, { slug: 'barbell-bench-press-medium-grip' });
    assert.deepEqual(t1!.exercises[0]!.alternativeExercises, [{ customKey: custom.id }]);
    assert.deepEqual(
      t1!.exercises[0]!.sets.map((s) => [s.setType, s.weight]),
      [
        [SetType.WARMUP, 48],
        [SetType.WORKING, 80],
        [SetType.WORKING, 80],
        [SetType.WORKING, 80],
      ],
    );
  });

  it('exports completed sessions only and drops values out of range', () => {
    assert.deepEqual(
      file.sessions.map((s) => [s.key, s.templateKey]),
      [
        ['s-1', 'tpl-1'],
        ['s-3', undefined],
      ],
    );
    const [ex] = file.sessions[0]!.exercises;
    assert.equal(file.sessions[0]!.exercises.length, 1);
    assert.deepEqual(ex!.exercise, { customKey: custom.id });
    assert.deepEqual(ex!.sets[0], {
      setNumber: 1,
      setType: SetType.WORKING,
      weightUnit: WeightUnit.KG,
      reps: 8,
      rpe: 8.5,
      completed: true,
    });
  });
});
