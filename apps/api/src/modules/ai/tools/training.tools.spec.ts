import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ExerciseType } from '@luki-fitti/common/enums';
import { ALL_SYSTEM_EXERCISES } from '@luki-fitti/common/catalog/extended';
import { TrainingTools } from './training.tools';
import type { ToolRegistry } from '../harness/tool-registry';
import type { PrismaService } from '../../database/prisma.service';
import type { ExerciseService } from '../../exercise/exercise.service';
import type { SessionService } from '../../session/session.service';
import type { ToolContext } from '../harness/types';

const byId = new Map(ALL_SYSTEM_EXERCISES.map((e) => [e.id, e]));
const row = byId.get('ex-bent-over-barbell-row')!;
const oneArm = byId.get('ex-one-arm-dumbbell-row')!;

function setup() {
  const exercises = {
    findAll: async () => [row, oneArm],
    findById: async (_userId: string, id: string) => {
      const e = byId.get(id);
      if (!e) throw new Error('not found');
      return { ...e, alternatives: [oneArm] };
    },
  };
  const tools = new TrainingTools(
    { register: () => undefined } as unknown as ToolRegistry,
    {} as PrismaService,
    exercises as unknown as ExerciseService,
    {} as SessionService,
  );
  const ctx = { userId: 'user-1', locale: 'en' } as unknown as ToolContext;
  return { tools, ctx };
}

describe('TrainingTools — laterality', () => {
  it('search_exercises returns the movement pattern and the side', async () => {
    const { tools, ctx } = setup();
    const results = await tools.searchExercises(ctx, {
      query: 'row',
      exerciseType: ExerciseType.STRENGTH,
      limit: 12,
    });
    assert.deepEqual(
      results.map((r) => [r.id, r.movementPattern, r.laterality]),
      [
        [row.id, 'HORIZONTAL_PULL', 'BILATERAL'],
        [oneArm.id, 'HORIZONTAL_PULL', 'UNILATERAL'],
      ],
    );
  });

  it('get_exercise_details returns the movement pattern and the side', async () => {
    const { tools, ctx } = setup();
    const [details, missing] = await tools.exerciseDetails(ctx, [row.id, 'ex-unknown']);
    assert.ok(details && 'laterality' in details);
    assert.equal(details.laterality, 'BILATERAL');
    assert.equal(details.movementPattern, 'HORIZONTAL_PULL');
    assert.equal(details.alternatives[0]?.id, oneArm.id);
    assert.deepEqual(missing, { id: 'ex-unknown', error: 'not found' });
  });
});
