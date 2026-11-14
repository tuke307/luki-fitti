import { Inject } from '@nestjs/common';
import { McpController, McpRawRequest, Tool, ToolScopes } from '@rekog/mcp-nest';
import { Payload } from '@nestjs/microservices';
import { z } from 'zod';
import { SessionStatus } from '@luki-fitti/common/enums';
import type { PublicMeDto, PublicSessionDto, PublicExerciseDto } from '@luki-fitti/common/schemas';
import { LukiFittiApiClient } from '../lukifitti-api.client';
import {
  MAX_ROWS,
  okResult,
  runTool,
  scopesOf,
  ToolRateLimiter,
  type ToolResult,
} from './tool-utils';
import { addDaysToDayKey, DEFAULT_TIME_ZONE, periodDayRange, zoneMidnight } from './mcp-date-utils';
import { weightUnitFor } from './unit';
import {
  completedStrengthSessions,
  muscleVolume,
  weeklyGoalStreak,
  weeksInRange,
} from './insights';

const TrainingSummarySchema = z.object({
  period: z
    .enum(['week', 'month', 'year'])
    .default('week')
    .describe('Summary period (ISO week, calendar month or year).'),
  offset: z
    .number()
    .int()
    .min(0)
    .max(52)
    .default(0)
    .describe('0 = current period, 1 = the previous one, etc.'),
});

@McpController()
export class TrainingSummaryTool {
  constructor(
    @Inject(LukiFittiApiClient)
    private readonly api: LukiFittiApiClient,
    @Inject(ToolRateLimiter)
    private readonly limiter: ToolRateLimiter,
  ) {}

  @Tool({
    name: 'training-summary',
    description:
      'Training summary for a week, month or year: sessions vs the weekly goal, completed sets per muscle group and the weekly-goal streak.',
    parameters: TrainingSummarySchema,
  })
  @ToolScopes(['read:sessions'])
  async trainingSummary(
    @Payload() input: z.infer<typeof TrainingSummarySchema>,
    @McpRawRequest() req: unknown,
  ): Promise<ToolResult> {
    return runTool(this.limiter, req, async () => {
      const tz = DEFAULT_TIME_ZONE;
      const now = new Date();
      const span = periodDayRange(input.period, input.offset, tz, now);
      const from = zoneMidnight(span.startDayKey, tz).toISOString();
      const to = new Date(
        zoneMidnight(addDaysToDayKey(span.endDayKey, 1), tz).getTime() - 1,
      ).toISOString();

      const scopes = scopesOf(req);
      const profileGoal = scopes.includes('read:profile')
        ? await this.api
            .get<PublicMeDto>('/v1/me', {}, req)
            .then((me) => me.goals.weeklyGoalSessions)
            .catch(() => null)
        : null;
      // Secondary muscles need the exercise catalog (read:workouts); without it
      // volume counts primary muscles only.
      const exercises = scopes.includes('read:workouts')
        ? await this.api
            .getAll<PublicExerciseDto>('/v1/exercises', { limit: 200 }, req, { maxRows: 1000 })
            .catch(() => [] as PublicExerciseDto[])
        : [];

      const [unit, sessions] = await Promise.all([
        weightUnitFor(this.api, req),
        this.api.getAll<PublicSessionDto>(
          '/v1/sessions',
          { include: 'exercises', from, to, limit: 50 },
          req,
          { maxRows: MAX_ROWS },
        ),
      ]);
      const completed = completedStrengthSessions(sessions).filter(
        (s) => s.status === SessionStatus.COMPLETED,
      );

      const weeks = weeksInRange(span.startDayKey, span.endDayKey);
      const volume = muscleVolume(completed, exercises, weeks, now);

      // Streak walks back up to 52 ISO weeks before the period end and only
      // needs summary rows (no exercises), so it stays cheap.
      let streak: number | null = null;
      if (profileGoal !== null && profileGoal > 0) {
        const lookbackFrom = zoneMidnight(
          addDaysToDayKey(span.endDayKey, -7 * 52),
          tz,
        ).toISOString();
        const history = await this.api.getAll<PublicSessionDto>(
          '/v1/sessions',
          { from: lookbackFrom, to, limit: 200 },
          req,
          { maxRows: 2000 },
        );
        streak = weeklyGoalStreak(
          history.filter((s) => s.status === SessionStatus.COMPLETED).map((s) => s.startedAt),
          profileGoal,
          new Date(to),
          tz,
          now,
        );
      }

      const periodEnd = zoneMidnight(addDaysToDayKey(span.endDayKey, 1), tz);
      const isCurrent = now.getTime() < periodEnd.getTime();
      const goalSessions = profileGoal === null ? null : profileGoal * weeks;
      return okResult(
        `${completed.length} session(s) in ${input.period} ${span.startDayKey}…${span.endDayKey}.`,
        {
          weightUnit: unit,
          period: input.period,
          offset: input.offset,
          range: { from: span.startDayKey, to: span.endDayKey, weeks },
          current: isCurrent,
          sessions: completed.length,
          weeklyGoalSessions: profileGoal,
          goalSessions,
          goalMet: goalSessions === null ? null : completed.length >= goalSessions,
          streakWeeks: streak,
          muscleVolume: volume.map((v) => ({
            muscle: v.muscle,
            setsPerWeek: v.setsPerWeek,
            directSetsPerWeek: v.directSetsPerWeek,
            status: v.status,
          })),
        },
      );
    });
  }
}
