import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ImportService } from './import.service';

function createMockImportPrisma() {
  return {
    exercise: {
      findMany: async () => [],
    },
    workoutSession: {
      findMany: async () => [
        {
          startedAt: new Date('2026-10-10T17:30:00Z'),
          workoutNameSnapshot: 'Day 1 — Chest & Triceps',
        },
      ],
    },
  } as any;
}

describe('ImportService — Gymlife CSV & JSON Validation, Mapping & Duplicate Detection', () => {
  it('parses Gymlife CSV exports, matches exercises to catalog, and flags duplicate sessions', async () => {
    const prisma = createMockImportPrisma();
    const service = new ImportService(prisma);

    const csv = [
      'Date,Workout Name,Folder,Exercise Name,Set Order,Weight,Unit,Reps,Notes',
      '2026-10-10T17:30:00Z,Day 1 — Chest & Triceps,4er Split,Barbell Bench Press,1,85,KG,8,PR',
      '2026-10-12T18:00:00Z,Day 2 — Back & Biceps,4er Split,Wide-Grip Lat Pulldown,1,70,KG,10,',
      '2026-10-12T18:00:00Z,Day 2 — Back & Biceps,4er Split,Custom Cable Pullover,1,30,KG,12,',
    ].join('\n');

    const preview = await service.previewImport('user-1', {
      fileName: 'gymlife-export.csv',
      format: 'AUTO',
      content: csv,
    });

    assert.equal(preview.detectedFormat, 'GYMLIFE_CSV');
    assert.equal(preview.totalSessionsFound, 2);
    assert.equal(preview.duplicateSessionsCount, 1);
    assert.equal(preview.totalSetsFound, 3);
    assert.deepEqual(preview.unmappedExercises, ['Custom Cable Pullover']);
  });

  it('returns clear validation errors for malformed CSV or JSON files', async () => {
    const prisma = createMockImportPrisma();
    const service = new ImportService(prisma);

    const badJson = await service.previewImport('user-1', {
      fileName: 'broken.json',
      format: 'GYMLIFE_JSON',
      content: '{broken json',
    });

    assert.equal(badJson.detectedFormat, 'INVALID_JSON');
    assert.equal(badJson.validationErrors.length > 0, true);
  });
});
