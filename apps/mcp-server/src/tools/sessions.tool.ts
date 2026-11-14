import { Inject } from '@nestjs/common';
import { McpController, McpRawRequest, Tool, ToolScopes } from '@rekog/mcp-nest';
import { Payload } from '@nestjs/microservices';
import { z } from 'zod';
import { SessionStatus, SetType } from '@luki-fitti/common/enums';
import type { PublicPersonalRecordDto, PublicSessionDto } from '@luki-fitti/common/schemas';
import { buildExerciseSearchIndex } from '@luki-fitti/common/utils';
import { LukiFittiApiClient } from '../lukifitti-api.client';
import {
  clipName,
  errorResult,
  MAX_ROWS,
  okResult,
  runTool,
  ToolRateLimiter,
  truncateRows,
  type ToolResult,
} from './tool-utils';
import { resolveRange, RELATIVE_WORDS } from './mcp-date-utils';
import { weightUnitFor } from './unit';
import { resolveExercise, weightInUnit, type OutputWeightUnit } from './insights';

const dateInput = z
  .string()
  .describe(`YYYY-MM-DD or a relative word: ${RELATIVE_WORDS.join(', ')}`);

const ListSessionsSchema = z.object({
  from: dateInput.optional().describe('Range start (inclusive). Default: 30 days back.'),
  to: dateInput.optional().describe('Range end (inclusive). Default: today.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe('Max sessions to return (newest first).'),
});

const GetSessionSchema = z.object({
  id: z.string().describe('Session id from list-sessions.'),
});

const PersonalRecordsSchema = z.object({
  exercise: z.string().optional().describe('Free-text exercise name to filter to one exercise.'),
});

const isPrSet = (s: PublicSessionDto['exercises'][number]['sets'][number]): boolean =>
  s.completed &&
  s.isPersonalRecord &&
  s.setType !== SetType.WARMUP &&
  s.setType !== SetType.STRETCH;

function sessionRow(s: PublicSessionDto, unit: OutputWeightUnit) {
  const prs = s.exercises.reduce((n, e) => n + e.sets.filter(isPrSet).length, 0);
  return {
    id: s.id,
    date: s.startedAt,
    workout: clipName(s.workoutName),
    durationMinutes: Math.round(s.activeDurationSeconds / 60),
    volume: weightInUnit(s.totalVolumeKg, unit),
    sets: s.totalSetsCompleted,
    personalRecords: prs,
  };
}

/** A session DTO without any user free text (notes stripped, names clipped). */
function sessionDetail(s: PublicSessionDto, unit: OutputWeightUnit) {
  return {
    id: s.id,
    date: s.startedAt,
    workout: clipName(s.workoutName),
    sessionType: s.sessionType,
    durationMinutes: Math.round(s.activeDurationSeconds / 60),
    volume: weightInUnit(s.totalVolumeKg, unit),
    exercises: s.exercises.map((e) => ({
      name: clipName(e.exerciseName),
      muscle: e.primaryMuscle,
      sets: e.sets.map((set) => ({
        setNumber: set.setNumber,
        type: set.setType,
        weight: set.weightKg === null ? null : weightInUnit(set.weightKg, unit),
        reps: set.reps,
        durationSeconds: set.durationSeconds,
        distanceMeters: set.distanceMeters,
        rpe: set.rpe,
        completed: set.completed,
        isPersonalRecord: set.isPersonalRecord,
      })),
    })),
  };
}

@McpController()
export class SessionsTool {
  constructor(
    @Inject(LukiFittiApiClient)
    private readonly api: LukiFittiApiClient,
    @Inject(ToolRateLimiter)
    private readonly limiter: ToolRateLimiter,
  ) {}

  @Tool({
    name: 'list-sessions',
    description:
      'List completed workout sessions in a date range, newest first: date, workout, duration, volume, set count and personal-record count.',
    parameters: ListSessionsSchema,
  })
  @ToolScopes(['read:sessions'])
  async listSessions(
    @Payload() input: z.infer<typeof ListSessionsSchema>,
    @McpRawRequest() req: unknown,
  ): Promise<ToolResult> {
    return runTool(this.limiter, req, async () => {
      const range = resolveRange(input);
      const unit = await weightUnitFor(this.api, req);
      const sessions = await this.api.getAll<PublicSessionDto>(
        '/v1/sessions',
        { include: 'exercises', from: range.from, to: range.to, limit: 50 },
        req,
        { maxRows: MAX_ROWS },
      );
      const rows = sessions
        .filter((s) => s.status === SessionStatus.COMPLETED)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      const { rows: page, truncated } = truncateRows(
        rows.map((s) => sessionRow(s, unit)),
        input.limit,
      );
      return okResult(
        `${page.length} session(s), newest first${truncated ? ' (truncated)' : ''}.`,
        {
          weightUnit: unit,
          sessions: page,
          truncated,
          hint: truncated ? 'Narrow the date range or lower the limit.' : undefined,
        },
      );
    });
  }

  @Tool({
    name: 'get-session',
    description: 'Get one workout session with all exercises and sets.',
    parameters: GetSessionSchema,
  })
  @ToolScopes(['read:sessions'])
  async getSession(
    @Payload() input: z.infer<typeof GetSessionSchema>,
    @McpRawRequest() req: unknown,
  ): Promise<ToolResult> {
    return runTool(this.limiter, req, async () => {
      const [unit, session] = await Promise.all([
        weightUnitFor(this.api, req),
        this.api.get<PublicSessionDto>(`/v1/sessions/${encodeURIComponent(input.id)}`, {}, req),
      ]);
      return okResult(
        `${clipName(session.workoutName)} on ${session.startedAt.slice(0, 10)} — ${session.exercises.length} exercise(s).`,
        { weightUnit: unit, session: sessionDetail(session, unit) },
      );
    });
  }

  @Tool({
    name: 'personal-records',
    description: 'Current personal records. Pass an exercise name to filter to a single exercise.',
    parameters: PersonalRecordsSchema,
  })
  @ToolScopes(['read:sessions'])
  async personalRecords(
    @Payload() input: z.infer<typeof PersonalRecordsSchema>,
    @McpRawRequest() req: unknown,
  ): Promise<ToolResult> {
    return runTool(this.limiter, req, async () => {
      const unit = await weightUnitFor(this.api, req);
      const page = await this.api.get<{ data: PublicPersonalRecordDto[]; nextCursor: null }>(
        '/v1/personal-records',
        {},
        req,
      );
      let records = page.data;
      if (input.exercise) {
        // Resolve against the PR list itself — the tool stays read:sessions-only.
        const index = buildExerciseSearchIndex(
          records.map((r) => ({ id: r.exerciseId, name: r.exerciseName, tags: [] })) as never,
        );
        const resolution = resolveExercise(index, input.exercise);
        if (resolution.kind === 'none') {
          return errorResult(`No exercise matches "${clipName(input.exercise)}".`);
        }
        if (resolution.kind === 'ambiguous') {
          return errorResult(
            `Ambiguous exercise "${clipName(input.exercise)}" — did you mean ${resolution.candidates
              .slice(0, 5)
              .map((c) => clipName(c.name))
              .join(', ')}?`,
          );
        }
        records = records.filter((r) => r.exerciseId === resolution.exercise.id);
      }
      const { rows, truncated } = truncateRows(records);
      return okResult(`${rows.length} personal record(s).`, {
        weightUnit: unit,
        records: rows.map((r) => ({
          exercise: clipName(r.exerciseName),
          muscle: r.primaryMuscle,
          maxWeight: weightInUnit(r.maxWeightKg, unit),
          repsAtMaxWeight: r.repsAtMaxWeight,
          estimatedOneRepMax: weightInUnit(r.estimatedOneRepMaxKg, unit),
          bestVolumeSet: weightInUnit(r.bestVolumeSetKg, unit),
          achievedAt: r.achievedAt,
        })),
        truncated,
      });
    });
  }
}
