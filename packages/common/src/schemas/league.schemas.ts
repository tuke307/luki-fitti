import { z } from 'zod';
import { Arena, LeagueOutcome, LeagueStage, LeagueStageMode } from '../enums';
import type { EffortPointsBreakdown } from '../utils/effort-points.util';
import type { SocialCardDto } from './social.schemas';

// ─────────────────────────────────────────────────────────────────────────────
// Points: weekly effort-point view
// ─────────────────────────────────────────────────────────────────────────────

const WEEK_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const PointsWeekQuerySchema = z.object({
  weekKey: z.string().regex(WEEK_KEY_REGEX).optional(),
});
export type PointsWeekQueryDto = z.infer<typeof PointsWeekQuerySchema>;

export interface PointsDayDto {
  dayKey: string;
  /** Points earned that day (uncapped). */
  points: number;
  /** Points counted toward the weekly score after the daily cap. */
  capped: number;
}

export interface PointsSessionDto {
  sessionId: string;
  workoutName: string;
  points: number;
  breakdown: EffortPointsBreakdown;
}

export interface PointsWeekDto {
  weekKey: string;
  /** Weekly score: daily-capped points + goal bonus. */
  points: number;
  rawPoints: number;
  dailyCap: number;
  days: PointsDayDto[];
  sessions: PointsSessionDto[];
  goal: {
    target: number;
    done: number;
    /** Bonus actually earned this week (0 until the goal is reached). */
    bonus: number;
    /** Bonus that would be earned on reaching the target (`epWeeklyGoalBonus`). */
    available: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// League: current week, friends board, history
// ─────────────────────────────────────────────────────────────────────────────

export const LeagueWeekQuerySchema = z.object({
  weekKey: z.string().regex(WEEK_KEY_REGEX).optional(),
});
export type LeagueWeekQueryDto = z.infer<typeof LeagueWeekQuerySchema>;

export const LEAGUE_ZONES = ['PROMOTE', 'SAFE', 'DEMOTE'] as const;
export type LeagueZone = (typeof LEAGUE_ZONES)[number];

export interface LeagueMemberDto {
  rank: number;
  card: SocialCardDto;
  points: number;
  isSelf: boolean;
  zone: LeagueZone;
}

export interface LeaguePendingResultDto {
  weekKey: string;
  outcome: LeagueOutcome;
  fromArena: Arena;
  toArena: Arena;
  rank: number;
  points: number;
}

export interface LeagueCurrentDto {
  weekKey: string;
  stage: LeagueStage;
  /** ISO instant the week ends (next Berlin Monday 00:00). */
  endsAt: string;
  arena: Arena;
  cohort: {
    members: LeagueMemberDto[];
    promoteCount: number;
    demoteCount: number;
  } | null;
  pendingResult: LeaguePendingResultDto | null;
}

export interface LeagueFriendRowDto {
  rank: number;
  card: SocialCardDto;
  points: number;
  isSelf: boolean;
}

export interface LeagueHistoryEntryDto {
  weekKey: string;
  arena: Arena;
  rank: number;
  outcome: LeagueOutcome | null;
  points: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: league settings + rollover preview
// ─────────────────────────────────────────────────────────────────────────────

export const UpdateLeagueSettingsSchema = z.object({
  leaguesEnabled: z.boolean().optional(),
  leagueStageMode: z.enum(LeagueStageMode).optional(),
  leagueStage2MinUsers: z.number().int().min(0).optional(),
  leagueStage3MinUsers: z.number().int().min(0).optional(),
  leagueCohortSize: z.number().int().min(2).max(500).optional(),
  epDailyCap: z.number().int().min(0).optional(),
  epWeeklyGoalBonus: z.number().int().min(0).optional(),
});
export type UpdateLeagueSettingsDto = z.infer<typeof UpdateLeagueSettingsSchema>;

export interface LeagueSettingsDto {
  leaguesEnabled: boolean;
  leagueStageMode: LeagueStageMode;
  leagueStage2MinUsers: number;
  leagueStage3MinUsers: number;
  leagueCohortSize: number;
  epDailyCap: number;
  epWeeklyGoalBonus: number;
}

export interface AdminLeaguePreviewDto {
  nextWeekKey: string;
  stage: LeagueStage;
  activeUsers: number;
  /** Arena → bucket index (ARENAS only). */
  buckets: Record<string, number> | null;
  openWeekOutcomes: {
    weekKey: string;
    cohorts: {
      bucket: number | null;
      promoteCount: number;
      demoteCount: number;
      size: number;
    }[];
  } | null;
}
