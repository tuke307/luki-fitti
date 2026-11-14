/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed test fixtures and mocks */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
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
} from '@luki-fitti/common/enums';
import {
  ImportFileSchema,
  type ExerciseDto,
  type WorkoutFolderDto,
  type WorkoutSessionDto,
  type WorkoutTemplateDto,
} from '@luki-fitti/common/schemas';
import { ImportService } from '../import/import.service';
import { SessionService } from '../session/session.service';
import { PublicExportService } from './export.service';
import { PublicExportController } from './public-export.controller';
import type { AuthenticatedUser } from '@/decorators/current-user.decorator';

const USER = 'user-a';
const OTHER = 'user-b';

const systemExercise: ExerciseDto = {
  id: 'sys-bench',
  slug: 'barbell-bench-press',
  userId: null,
  name: 'Bench Press',
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
};

const customExercise: ExerciseDto = {
  ...systemExercise,
  id: 'custom-1',
  slug: '',
  userId: USER,
  name: 'Cable Flye Variant',
  isSystem: false,
  equipment: EquipmentType.CABLE,
};

const template = (id: string, folderId: string | null): WorkoutTemplateDto => ({
  id,
  userId: USER,
  folderId,
  name: 'Push Day',
  description: null,
  estimatedDurationMinutes: 45,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  exercises: [
    {
      id: `${id}-te1`,
      templateId: id,
      exerciseId: customExercise.id,
      orderIndex: 0,
      plannedSets: 2,
      warmupSets: 0,
      targetRepsMin: 8,
      targetRepsMax: 12,
      targetWeight: 20,
      weightUnit: WeightUnit.KG,
      restSeconds: 90,
      targetDurationSeconds: null,
      targetDistanceMeters: null,
      notes: null,
      alternativeExerciseIds: [systemExercise.id],
      exercise: customExercise,
    },
  ],
});

const folder: WorkoutFolderDto = {
  id: 'folder-1',
  userId: USER,
  name: 'Push',
  color: '#FF0000',
  sortOrder: 0,
  templates: [template('tpl-1', 'folder-1')],
};

const completedSession: WorkoutSessionDto = {
  id: 'sess-1',
  clientSessionId: 'sess-1-client',
  userId: USER,
  templateId: 'tpl-1',
  stretchingRoutineId: null,
  sessionType: SessionType.STRENGTH,
  workoutNameSnapshot: 'Push Day',
  status: SessionStatus.COMPLETED,
  startedAt: '2026-01-02T10:00:00.000Z',
  pausedAt: null,
  completedAt: '2026-01-02T11:00:00.000Z',
  activeDurationSeconds: 3600,
  weightUnit: WeightUnit.KG,
  totalVolumeKg: 480,
  totalSetsCompleted: 2,
  totalRepsCompleted: 20,
  totalStretchSeconds: 0,
  notes: null,
  restTimerEndsAt: null,
  restTimerDurationSec: null,
  restTimerPausedRemSec: null,
  version: 1,
  lastSyncedAt: '2026-01-02T11:00:00.000Z',
  exercises: [
    {
      id: 'se-1',
      clientExerciseId: 'se-1-client',
      sessionId: 'sess-1',
      exerciseId: customExercise.id,
      replacedExerciseId: null,
      replacedExerciseName: null,
      exerciseNameSnapshot: 'Cable Flye Variant',
      primaryMuscleSnapshot: MuscleGroup.CHEST,
      exerciseTypeSnapshot: ExerciseType.STRENGTH,
      origin: SessionExerciseOrigin.PLANNED,
      status: SessionExerciseStatus.COMPLETED,
      orderIndex: 0,
      plannedSets: 2,
      plannedWarmupSets: 0,
      targetRepsMin: 8,
      targetRepsMax: 12,
      targetWeight: 20,
      targetDurationSeconds: null,
      restSeconds: 90,
      alternativeExerciseIds: [],
      notes: null,
      sets: [
        {
          id: 'set-1',
          clientSetId: 'set-1-client',
          sessionExerciseId: 'se-1',
          setNumber: 1,
          setType: SetType.WORKING,
          weight: 20,
          weightUnit: WeightUnit.KG,
          reps: 12,
          durationSeconds: null,
          distanceMeters: null,
          rpe: null,
          completed: true,
          completedAt: '2026-01-02T10:30:00.000Z',
          isPersonalRecord: false,
          notes: null,
        },
      ],
    },
  ],
};

/** The real services behind the export — stubbed with DTO fixtures, like the app delivers them. */
const stubDeps = (userId = USER) => {
  const calls: string[] = [];
  const workouts = {
    getOverview: async (id: string) => {
      calls.push(`workouts:${id}`);
      return { folders: [folder], unfiledTemplates: [template('tpl-2', null)] };
    },
  };
  const sessions = {
    listSessions: async (id: string, filters?: unknown) => {
      calls.push(`sessions:${id}`);
      assert.deepEqual(filters, { status: SessionStatus.COMPLETED });
      return [completedSession];
    },
  };
  const exercises = {
    findAll: async (id: string | null) => {
      calls.push(`exercises:${id}`);
      return [systemExercise, customExercise];
    },
  };
  const service = new PublicExportService(workouts as any, sessions as any, exercises as any);
  return { service, calls, userId };
};

describe('PublicExportService.buildExport', () => {
  it('produces a file that parses with ImportFileSchema', async () => {
    const { service } = stubDeps();
    const file = await service.buildExport(USER, 'en');
    const parsed = ImportFileSchema.parse(file);
    assert.equal(parsed.format, 'luki-fitti-import@1');
    assert.equal(parsed.source.app, 'luki-fitti-api');
    assert.equal(parsed.folders.length, 1);
    assert.equal(parsed.templates.length, 2);
    assert.equal(parsed.customExercises.length, 1);
    assert.equal(parsed.sessions.length, 1);
    // The custom exercise travels by key; the system one by slug.
    assert.ok(
      parsed.templates[0]!.exercises[0]!.alternativeExercises?.some(
        (r) => 'slug' in r && r.slug === 'barbell-bench-press',
      ),
    );
  });

  it('scopes every upstream query to the key owner', async () => {
    const { service, calls } = stubDeps();
    await service.buildExport(OTHER, 'en');
    assert.ok(calls.every((c) => c.endsWith(`:${OTHER}`)), JSON.stringify(calls));
  });
});

describe('PublicExportController rate limit', () => {
  const res = () => {
    const headers = new Map<string, string>();
    const r = {
      setHeader: (k: string, v: string) => void headers.set(k, v),
      getHeader: (k: string) => headers.get(k),
    } as unknown as Response;
    return { r, headers };
  };
  const user = { id: USER, email: 'a@b.c', permissions: [] } as AuthenticatedUser;

  it('rejects the 6th export in a day with 429 + Retry-After', async () => {
    const { service } = stubDeps();
    const controller = new PublicExportController(service);
    controller.increment = async () => 6;
    controller.ttl = async () => 7200;
    const { r, headers } = res();
    await assert.rejects(controller.export(user, 'en', r), (e: unknown) => {
      assert.ok(e instanceof HttpException);
      assert.equal((e as HttpException).getStatus(), HttpStatus.TOO_MANY_REQUESTS);
      assert.match(JSON.stringify((e as HttpException).getResponse()), /rate_limited/);
      return true;
    });
    assert.equal(headers.get('Retry-After'), '7200');
  });

  it('sends an attachment with a dated filename', async () => {
    const { service } = stubDeps();
    const controller = new PublicExportController(service);
    controller.increment = async () => 1;
    const { r, headers } = res();
    const file = await controller.export(user, 'en', r);
    assert.equal(file.format, 'luki-fitti-import@1');
    assert.match(
      headers.get('Content-Disposition') ?? '',
      /^attachment; filename="luki-fitti-export-\d{4}-\d{2}-\d{2}\.json"$/,
    );
  });
});

// ── Round trip: export → commit → preview shows nothing new ──

type Row = Record<string, any>;
const TABLES = [
  'exercise',
  'exerciseMuscleGroup',
  'workoutFolder',
  'workoutTemplate',
  'workoutTemplateExercise',
  'workoutSession',
  'sessionExercise',
  'sessionSet',
  'userPreferences',
  'importJob',
] as const;
type Table = (typeof TABLES)[number];

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([field, cond]) => {
    if (field === 'OR') return (cond as Row[]).some((c) => matches(row, c));
    if (cond && typeof cond === 'object' && 'in' in cond) return cond.in.includes(row[field]);
    return row[field] === cond;
  });
}

/** In-memory Prisma stand-in, mirroring import.service.spec.ts. */
function createDb() {
  let store: Record<Table, Map<string, Row>> = Object.fromEntries(
    TABLES.map((t) => [t, new Map()]),
  ) as any;
  const keyOf = (table: Table, row: Row) =>
    table === 'exerciseMuscleGroup' ? `${row.exerciseId}:${row.muscleGroup}` : row.id;
  let jobSeq = 0;
  const delegate = (table: Table) => ({
    findMany: async ({ where }: Row = {}) =>
      [...store[table].values()].filter((r) => matches(r, where)),
    findUnique: async ({ where }: Row) =>
      [...store[table].values()].find((r) => matches(r, where)) ?? null,
    createMany: async ({ data }: { data: Row[] }) => {
      let count = 0;
      for (const row of data) {
        if (store[table].has(keyOf(table, row))) continue;
        store[table].set(keyOf(table, row), { ...row });
        count += 1;
      }
      return { count };
    },
    create: async ({ data }: { data: Row }) => {
      const row = { id: `job-${++jobSeq}`, ...data };
      store[table].set(row.id, row);
      return row;
    },
  });
  const db: any = Object.fromEntries(TABLES.map((t) => [t, delegate(t)]));
  db.$transaction = async (fn: (tx: any) => Promise<unknown>) => {
    const snapshot = structuredClone(store);
    try {
      return await fn(db);
    } catch (error) {
      store = snapshot;
      throw error;
    }
  };
  const seed = (table: Table, row: Row) => store[table].set(keyOf(table, row), row);
  return { db, seed, rows: (t: Table) => [...store[t].values()] };
}

describe('export → import round trip', () => {
  it('re-imports everything as existing for the same user', async () => {
    const { service } = stubDeps();
    const file = await service.buildExport(USER, 'en');

    const mock = createDb();
    // The system catalog slug the template alternatives reference.
    mock.seed('exercise', {
      id: 'sys-bench',
      slug: 'barbell-bench-press',
      isSystem: true,
      userId: null,
    });
    const importer = new ImportService(mock.db, new SessionService(mock.db) as any);

    const first = await importer.commit(USER, file, 'en');
    assert.ok(first.counts.templates.new > 0);
    assert.ok(mock.rows('workoutSession').length > 0);

    const again = await importer.preview(USER, file, 'en');
    for (const kind of ['customExercises', 'folders', 'templates', 'sessions'] as const) {
      assert.equal(again.counts[kind].new, 0, `${kind} should be fully existing`);
    }
    assert.equal(again.newSets, 0);
  });
});
