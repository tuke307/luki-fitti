import { Inject } from '@nestjs/common';
import { McpController, McpRawRequest, Tool, ToolScopes } from '@rekog/mcp-nest';
import { Payload } from '@nestjs/microservices';
import { z } from 'zod';
import { SessionStatus } from '@luki-fitti/common/enums';
import type { PublicExerciseDto, PublicSessionDto } from '@luki-fitti/common/schemas';
import { LukiFittiApiClient } from '../lukifitti-api.client';
import {
  clipName,
  errorResult,
  okResult,
  runTool,
  ToolRateLimiter,
  type ToolResult,
} from './tool-utils';
import { resolveRange, RELATIVE_WORDS } from './mcp-date-utils';
import { weightUnitFor } from './unit';
import { e1rmTrend, exerciseIndex, exerciseStatInSession, resolveExercise } from './insights';

const dateInput = z
  .string()
  .describe(`YYYY-MM-DD or a relative word: ${RELATIVE_WORDS.join(', ')}`);

const ExerciseProgressSchema = z.object({
  exercise: z.string().describe('Free-text exercise name, e.g. "bench press" or "Bankdrücken".'),
  from: dateInput.optional().describe('Range start (inclusive). Default: 90 days back.'),
  to: dateInput.optional().describe('Range end (inclusive). Default: today.'),
});

@McpController()
export class ExerciseProgressTool {
  constructor(
    @Inject(LukiFittiApiClient)
    private readonly api: LukiFittiApiClient,
    @Inject(ToolRateLimiter)
    private readonly limiter: ToolRateLimiter,
  ) {}

  @Tool({
    name: 'exercise-progress',
    description:
      'Track one exercise over a date range: per session the best set, estimated 1RM and volume, plus the trend between the first and last session.',
    parameters: ExerciseProgressSchema,
  })
  @ToolScopes(['read:sessions', 'read:workouts'])
  async exerciseProgress(
    @Payload() input: z.infer<typeof ExerciseProgressSchema>,
    @McpRawRequest() req: unknown,
  ): Promise<ToolResult> {
    return runTool(this.limiter, req, async () => {
      const range = resolveRange({ from: input.from ?? 'last-90-days', to: input.to }, undefined);
      const catalog = await this.api.getAll<PublicExerciseDto>(
        '/v1/exercises',
        { limit: 200 },
        req,
        { maxRows: 1000 },
      );
      const resolution = resolveExercise(
        exerciseIndex(catalog.rows, (e) => e.tags),
        input.exercise,
      );
      if (resolution.kind === 'none') {
        return errorResult(`No exercise matches "${clipName(input.exercise)}".`);
      }
      if (resolution.kind === 'ambiguous') {
        return okResult(
          `Ambiguous exercise "${clipName(input.exercise)}" — which one did you mean?`,
          {
            ambiguous: true,
            candidates: resolution.candidates
              .slice(0, 5)
              .map((c) => ({ name: clipName(c.name), muscle: c.primaryMuscleGroup })),
          },
        );
      }
      const exercise = resolution.exercise;
      const [unit, fetched] = await Promise.all([
        weightUnitFor(this.api, req),
        this.api.getAll<PublicSessionDto>(
          '/v1/sessions',
          { include: 'exercises', from: range.from, to: range.to, limit: 50 },
          req,
          { maxRows: 400 },
        ),
      ]);
      const stats = fetched.rows
        .filter((s) => s.status === SessionStatus.COMPLETED)
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
        .map((s) => exerciseStatInSession(s, exercise.id, unit))
        .filter((s) => s !== null);
      const trend = e1rmTrend(stats);
      const truncated = fetched.truncated || catalog.truncated;
      const summary =
        stats.length === 0
          ? `No sessions with ${clipName(exercise.name)} in the range.`
          : `${clipName(exercise.name)}: ${stats.length} session(s), e1RM ${trend.firstE1rm}→${trend.lastE1rm} ${unit}${truncated ? ' (partial range — truncated)' : ''}.`;
      return okResult(summary, {
        weightUnit: unit,
        exercise: { id: exercise.id, name: clipName(exercise.name) },
        range: { from: range.fromDayKey, to: range.toDayKey },
        sessions: stats,
        trend,
        truncated,
        hint: truncated ? 'Narrow the date range' : undefined,
      });
    });
  }
}
