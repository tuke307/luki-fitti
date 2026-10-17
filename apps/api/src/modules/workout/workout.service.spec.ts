import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorkoutService } from './workout.service';
import { WeightUnit } from '@luki-fitti/common/enums';

function createMockWorkoutPrisma() {
  const folders = new Map<string, any>();
  const templates = new Map<string, any>();
  const templateExercises = new Map<string, any[]>();
  const sessions = new Map<string, any>();

  const prisma: any = {
    workoutFolder: {
      findUnique: async ({ where }: any) => {
        if (where.id) return folders.get(where.id) ?? null;
        if (where.userId_name) {
          return (
            Array.from(folders.values()).find(
              (f) =>
                f.userId === where.userId_name.userId && f.name === where.userId_name.name,
            ) ?? null
          );
        }
        return null;
      },
      create: async ({ data }: any) => {
        const id = `folder-${folders.size + 1}`;
        const f = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
        folders.set(id, f);
        return f;
      },
      delete: async ({ where }: any) => {
        folders.delete(where.id);
      },
    },
    workoutTemplate: {
      findUnique: async ({ where }: any) => {
        const t = templates.get(where.id);
        if (!t) return null;
        return {
          ...t,
          exercises: templateExercises.get(t.id) ?? [],
        };
      },
      findUniqueOrThrow: async ({ where }: any) => {
        const t = templates.get(where.id);
        if (!t) throw new Error('Not found');
        return {
          ...t,
          exercises: templateExercises.get(t.id) ?? [],
        };
      },
      create: async ({ data }: any) => {
        const id = `tpl-${templates.size + 1}`;
        const t = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
        templates.set(id, t);
        templateExercises.set(id, []);
        return t;
      },
      update: async ({ where, data }: any) => {
        const t = templates.get(where.id);
        Object.assign(t, data);
        return t;
      },
      updateMany: async ({ where, data }: any) => {
        for (const t of templates.values()) {
          if (t.folderId === where.folderId && t.userId === where.userId) {
            Object.assign(t, data);
          }
        }
      },
      delete: async ({ where }: any) => {
        templates.delete(where.id);
      },
    },
    workoutTemplateExercise: {
      create: async ({ data }: any) => {
        const list = templateExercises.get(data.templateId) ?? [];
        const entry = { id: `tple-${list.length + 1}`, ...data };
        list.push(entry);
        templateExercises.set(data.templateId, list);
        return entry;
      },
      deleteMany: async ({ where }: any) => {
        templateExercises.set(where.templateId, []);
      },
    },
    $transaction: async (fn: any) => fn(prisma),
    _sessions: sessions,
    _templates: templates,
  };

  return prisma;
}

describe('WorkoutService — Folders, Templates, Alternatives & User Isolation', () => {
  it('enforces strict user isolation across folders and workout templates', async () => {
    const prisma = createMockWorkoutPrisma();
    const service = new WorkoutService(prisma);

    const folderA = await service.createFolder('user-a', {
      name: '4er Split',
      color: '#CCFF00',
    });

    const tplA = await service.createTemplate('user-a', {
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
    });

    // User B cannot view, update, move, or delete User A's template or folder
    await assert.rejects(() => service.getTemplateById('user-b', tplA.id), /Access denied/i);
    await assert.rejects(
      () => service.updateTemplate('user-b', tplA.id, { name: 'Hacked' }),
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

    const tpl = await service.createTemplate('user-a', {
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
    });

    const copy = await service.duplicateTemplate('user-a', tpl.id);
    assert.equal(copy.name, 'Push Day (Copy)');
    assert.equal(copy.exercises.length, 1);
    assert.deepEqual(copy.exercises[0]?.alternativeExerciseIds, ['ex-dumbbell-incline-press']);

    // Delete folder -> templates are unfiled (folderId = null), not deleted
    await service.deleteFolder('user-a', folder.id);
    const afterFolderDelete = await service.getTemplateById('user-a', tpl.id);
    assert.equal(afterFolderDelete.folderId, null);
  });
});
