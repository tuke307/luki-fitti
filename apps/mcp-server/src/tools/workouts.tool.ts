import { Inject } from '@nestjs/common';
import { McpController, McpRawRequest, Tool, ToolScopes } from '@rekog/mcp-nest';
import { Payload } from '@nestjs/microservices';
import { z } from 'zod';
import type { PublicWorkoutTemplateDto } from '@luki-fitti/common/schemas';
import { LukiFittiApiClient } from '../lukifitti-api.client';
import {
  clipName,
  okResult,
  runTool,
  ToolRateLimiter,
  truncateRows,
  type ToolResult,
} from './tool-utils';
import { weightUnitFor } from './unit';
import { weightInUnit } from './insights';

const ListWorkoutsSchema = z.object({});

@McpController()
export class WorkoutsTool {
  constructor(
    @Inject(LukiFittiApiClient)
    private readonly api: LukiFittiApiClient,
    @Inject(ToolRateLimiter)
    private readonly limiter: ToolRateLimiter,
  ) {}

  @Tool({
    name: 'list-workouts',
    description: 'List workout templates with their exercises and set/rep targets.',
    parameters: ListWorkoutsSchema,
  })
  @ToolScopes(['read:workouts'])
  async listWorkouts(
    @Payload() _input: z.infer<typeof ListWorkoutsSchema>,
    @McpRawRequest() req: unknown,
  ): Promise<ToolResult> {
    return runTool(this.limiter, req, async () => {
      const [unit, fetched] = await Promise.all([
        weightUnitFor(this.api, req),
        this.api.getAll<PublicWorkoutTemplateDto>('/v1/workouts', { limit: 200 }, req, {
          maxRows: 200,
        }),
      ]);
      const { rows, truncated: rowsTruncated } = truncateRows(fetched.rows);
      const truncated = rowsTruncated || fetched.truncated;
      return okResult(
        `${rows.length} workout template(s)${fetched.truncated ? ' (truncated)' : ''}.`,
        {
          weightUnit: unit,
          workouts: rows.map((t) => ({
            id: t.id,
            name: clipName(t.name),
            estimatedDurationMinutes: t.estimatedDurationMinutes,
            exercises: t.exercises.map((e) => ({
              name: clipName(e.exerciseName),
              plannedSets: e.plannedSets,
              warmupSets: e.warmupSets,
              targetRepsMin: e.targetRepsMin,
              targetRepsMax: e.targetRepsMax,
              targetWeight: e.targetWeightKg === null ? null : weightInUnit(e.targetWeightKg, unit),
              targetDurationSeconds: e.targetDurationSeconds,
              targetDistanceMeters: e.targetDistanceMeters,
              restSeconds: e.restSeconds,
            })),
          })),
          truncated,
        },
      );
    });
  }
}
