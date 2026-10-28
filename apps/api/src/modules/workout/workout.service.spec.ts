import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorkoutService } from './workout.service';
import type { PrismaService } from '../database/prisma.service';
import {
  ExerciseType,
  MuscleGroup,
  SessionExerciseOrigin,
  SessionExerciseStatus,
  SessionStatus,
  SessionType,
  SetType,
  WeightUnit,
} from '@luki-fitti/common/enums';
import type { WorkoutSessionDto } from '@luki-fitti/common/schemas';
import { DEFAULT_STARTER_TEMPLATES } from '@luki-fitti/common/catalog';

function createMockWorkoutPrisma(): PrismaService {
  const folders = new Map<string, Record<string, unknown>>();
  const templates = new Map<string, Record<string, unknown>>();
  const templateExercises = new Map<string, Array<Record<string, unknown>>>();
  const sessions = new Map<string, Record<string, unknown>>();

  const prisma = {
    workoutFolder: {
      findUnique: async ({
        where,
      }: {
        where: { id?: string; userId_name?: { userId: string; name: string } };
      }) => {
        if (where.id) return folders.get(where.id) ?? null;
        if (where.userId_name) {
          return (
            Array.from(folders.values()).find(
              (f) => f.userId === where.userId_name?.userId && f.name === where.userId_name?.name,
            ) ?? null
          );
        }
        return null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `folder-${folders.size + 1}`;
        const f = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
        folders.set(id, f);
        return f;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        folders.delete(where.id);
      },
    },
    workoutTemplate: {
      findMany: async ({ where }: { where: { userId: string; folderId?: string | null } }) => {
        return Array.from(templates.values())
          .filter(
            (t) =>
              t.userId === where.userId &&
              (where.folderId !== undefined ? t.folderId === where.folderId : true),
          )
          .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const t = templates.get(where.id);
        if (!t) return null;
        return {
          ...t,
          exercises: templateExercises.get(String(t.id)) ?? [],
        };
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const t = templates.get(where.id);
        if (!t) throw new Error('Not found');
        return {
          ...t,
          exercises: templateExercises.get(String(t.id)) ?? [],
        };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `tpl-${templates.size + 1}`;
        const t = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
        templates.set(id, t);
        templateExercises.set(id, []);
        return t;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const t = templates.get(where.id);
        if (t) Object.assign(t, data);
        return t;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { folderId: string; userId: string };
        data: Record<string, unknown>;
      }) => {
        for (const t of templates.values()) {
          if (t.folderId === where.folderId && t.userId === where.userId) {
            Object.assign(t, data);
          }
        }
      },
      delete: async ({ where }: { where: { id: string } }) => {
        templates.delete(where.id);
      },
    },
    exercise: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({ id })),
    },
    workoutTemplateExercise: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const tplId = String(data.templateId);
        const list = templateExercises.get(tplId) ?? [];
        const entry = { ...data, id: `tple-${list.length + 1}` };
        list.push(entry);
        templateExercises.set(tplId, list);
        return entry;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const entry = Array.from(templateExercises.values())
          .flat()
          .find((e) => e.id === where.id);
        if (entry) Object.assign(entry, data);
        return entry;
      },
      deleteMany: async ({ where }: { where: { templateId: string } }) => {
        templateExercises.set(where.templateId, []);
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(prisma),
    _sessions: sessions,
    _templates: templates,
  };

  return prisma as unknown as PrismaService;
}

describe('WorkoutService — Folders, Templates, Alternatives & User Isolation', () => {
  it('enforces strict user isolation across folders and workout templates', async () => {
    const prisma = createMockWorkoutPrisma();
    const service = new WorkoutService(prisma);

    const folderA = await service.createFolder('user-a', {
      name: '4er Split',
      color: '#CCFF00',
    });

    const tplA = await service.createTemplate(
      'user-a',
      {
        name: 'Chest & Triceps',
        folderId: folderA.id,
        exercises: [
          {
            exerciseId: 'ex-barbell-bench-press',
            orderIndex: 0,
            plannedSets: 3,
            warmupSets: 2,
            targetRepsMin: 8,
            targetRepsMax: 12,
            targetWeight: 85,
            weightUnit: WeightUnit.KG,
            restSeconds: 120,
            alternativeExerciseIds: ['ex-machine-chest-press'],
          },
        ],
      },
      'en',
    );

    // User B cannot view, update, move, or delete User A's template or folder
    await assert.rejects(() => service.getTemplateById('user-b', tplA.id, 'en'), /Access denied/i);
    await assert.rejects(
      () => service.updateTemplate('user-b', tplA.id, { name: 'Hacked' }, 'en'),
      /Access denied/i,
    );
    await assert.rejects(() => service.deleteTemplate('user-b', tplA.id), /Access denied/i);
    await assert.rejects(() => service.deleteFolder('user-b', folderA.id), /Access denied/i);
  });

  it('duplicates templates, moves templates between folders, and preserves templates when deleting a folder', async () => {
    const prisma = createMockWorkoutPrisma();
    const service = new WorkoutService(prisma);

    const folder = await service.createFolder('user-a', {
      name: 'Push Pull Legs',
      color: '#CCFF00',
    });

    const tpl = await service.createTemplate(
      'user-a',
      {
        name: 'Push Day',
        folderId: folder.id,
        exercises: [
          {
            exerciseId: 'ex-barbell-bench-press',
            orderIndex: 0,
            plannedSets: 4,
            warmupSets: 1,
            targetRepsMin: 6,
            targetRepsMax: 8,
            targetWeight: 90,
            weightUnit: WeightUnit.KG,
            restSeconds: 150,
            alternativeExerciseIds: ['ex-dumbbell-incline-press'],
          },
        ],
      },
      'en',
    );

    const tpl2 = await service.createTemplate(
      'user-a',
      {
        name: 'Pull Day',
        folderId: folder.id,
        sortOrder: 1,
        exercises: [],
      },
      'en',
    );

    const copy = await service.duplicateTemplate('user-a', tpl.id, 'en');
    assert.equal(copy.name, 'Push Day (Copy)');
    assert.equal(copy.sortOrder, 1);
    assert.equal(copy.exercises.length, 1);
    assert.deepEqual(copy.exercises[0]?.alternativeExerciseIds, ['ex-dumbbell-incline-press']);

    const afterDupTpl2 = await service.getTemplateById('user-a', tpl2.id, 'en');
    assert.equal(afterDupTpl2.sortOrder, 2);

    // Delete folder -> templates are unfiled (folderId = null), not deleted
    await service.deleteFolder('user-a', folder.id);
    const afterFolderDelete = await service.getTemplateById('user-a', tpl.id, 'en');
    assert.equal(afterFolderDelete.folderId, null);
  });

  it('serves untouched starter copies in the request language and detaches them on edit', async () => {
    const prisma = createMockWorkoutPrisma();
    const service = new WorkoutService(prisma);
    const starter = DEFAULT_STARTER_TEMPLATES[0]!;

    const created = await prisma.workoutTemplate.create({
      data: {
        userId: 'user-a',
        systemKey: starter.id,
        folderId: null,
        name: starter.name,
        description: starter.description,
        sortOrder: 0,
      },
    });
    for (const te of starter.exercises) {
      await prisma.workoutTemplateExercise.create({ data: { ...te, templateId: created.id } });
    }

    const de = await service.getTemplateById('user-a', created.id, 'de');
    assert.equal(de.name, 'Tag 1 — Brust & Trizeps');
    assert.equal(de.exercises[0]!.notes, 'Arbeitssätze mit 1 RIR. 1 s Pause auf der Brust.');
    assert.equal((await service.getTemplateById('user-a', created.id, 'en')).name, starter.name);

    const moved = await service.moveTemplate('user-a', created.id, null, 'de');
    assert.equal(moved.systemKey, starter.id);

    const renamed = await service.updateTemplate('user-a', created.id, { name: 'Mein Tag' }, 'de');
    assert.equal(renamed.systemKey, null);
    const inEnglish = await service.getTemplateById('user-a', created.id, 'en');
    assert.equal(inEnglish.name, 'Mein Tag');
    assert.equal(inEnglish.description, de.description);
    assert.equal(inEnglish.exercises[0]!.notes, de.exercises[0]!.notes);
  });

  it('stores per-set plans and writes a finished workout back into its template', async () => {
    const prisma = createMockWorkoutPrisma();
    const service = new WorkoutService(prisma);
    const tpl = await service.createTemplate(
      'user-a',
      {
        name: 'Day 4 - Schultern',
        exercises: [
          {
            exerciseId: 'ex-seated-dumbbell-shoulder-press',
            orderIndex: 0,
            plannedSets: 2,
            warmupSets: 0,
            targetRepsMin: 8,
            targetRepsMax: 12,
            targetWeight: 20,
            weightUnit: WeightUnit.KG,
            restSeconds: 90,
            alternativeExerciseIds: [],
          },
        ],
      },
      'en',
    );
    assert.equal(tpl.exercises[0]!.sets, null);

    const setRow = (setType: SetType, weight: number, reps: number) => ({
      id: `s-${weight}-${reps}`,
      clientSetId: `cs-${weight}-${reps}-${setType}`,
      sessionExerciseId: 'sex-1',
      setNumber: 1,
      setType,
      weight,
      weightUnit: WeightUnit.KG,
      reps,
      durationSeconds: null,
      distanceMeters: null,
      rpe: null,
      completed: true,
      completedAt: '2026-10-26T10:00:00.000Z',
      isPersonalRecord: false,
      notes: null,
    });
    const session = {
      id: 'sess-1',
      clientSessionId: 'sess-1',
      userId: 'user-a',
      templateId: tpl.id,
      status: SessionStatus.COMPLETED,
      sessionType: SessionType.STRENGTH,
      weightUnit: WeightUnit.KG,
      exercises: [
        {
          id: 'sex-1',
          clientExerciseId: 'sex-1',
          exerciseId: 'ex-seated-dumbbell-shoulder-press',
          origin: SessionExerciseOrigin.PLANNED,
          status: SessionExerciseStatus.COMPLETED,
          exerciseNameSnapshot: 'Press',
          primaryMuscleSnapshot: MuscleGroup.SHOULDERS,
          exerciseTypeSnapshot: ExerciseType.STRENGTH,
          targetRepsMin: 8,
          targetRepsMax: 12,
          restSeconds: 90,
          alternativeExerciseIds: [],
          sets: [
            setRow(SetType.WARMUP, 10, 12),
            setRow(SetType.WORKING, 22.5, 10),
            setRow(SetType.WORKING, 22.5, 8),
            setRow(SetType.DROPSET, 15, 10),
          ],
        },
      ],
    } as unknown as WorkoutSessionDto;

    await service.applyCompletedSessionToTemplate('user-b', session, 'en');
    assert.equal((await service.getTemplateById('user-a', tpl.id, 'en')).exercises[0]!.sets, null);

    await service.applyCompletedSessionToTemplate('user-a', session, 'en');
    const updated = (await service.getTemplateById('user-a', tpl.id, 'en')).exercises[0]!;
    assert.deepEqual(
      updated.sets!.map((s) => [s.setType, s.weight, s.reps]),
      [
        [SetType.WARMUP, 10, 12],
        [SetType.WORKING, 22.5, 10],
        [SetType.WORKING, 22.5, 8],
        [SetType.DROPSET, 15, 10],
      ],
    );
    assert.equal(updated.plannedSets, 3);
    assert.equal(updated.warmupSets, 1);
    assert.equal(updated.targetWeight, 22.5);
  });
});
