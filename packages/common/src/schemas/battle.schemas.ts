import { z } from 'zod';
import type { DuelStatus, FriendStreakStatus, TrophyKind } from '../enums';
import type { SocialCardDto } from './social.schemas';

// ─────────────────────────────────────────────────────────────────────────────
// Duels (1v1 weekly battles)
// ─────────────────────────────────────────────────────────────────────────────

export const CreateDuelSchema = z.object({
  opponentId: z.string().uuid(),
});
export type CreateDuelDto = z.infer<typeof CreateDuelSchema>;

export type DuelOutcome = 'WON' | 'LOST' | 'TIE';

export interface DuelItemDto {
  id: string;
  status: DuelStatus;
  /** Opponent card under the PR 1 relation rules (duels are friends-only). */
  opponent: SocialCardDto;
  /** Scores from the caller's perspective. */
  you: number;
  them: number;
  /** Whole Berlin days left in the window (including today); null while PENDING. */
  daysLeft: number | null;
  /** Only for finished (COMPLETED) duels. */
  outcome: DuelOutcome | null;
  /** The caller's *SeenAt — null while the result celebration is pending. */
  seenAt: string | null;
  startDayKey: string | null;
  endDayKey: string | null;
  createdAt: string;
}

export interface DuelListDto {
  active: DuelItemDto[];
  incoming: DuelItemDto[];
  outgoing: DuelItemDto[];
  /** Last 10 finished duels. */
  recent: DuelItemDto[];
  /** Latest finished duel whose result the caller has not seen yet. */
  pendingResult: DuelItemDto | null;
}

export interface DuelDayPointsDto {
  dayKey: string;
  you: number;
  them: number;
}

export interface DuelDetailDto extends DuelItemDto {
  days: DuelDayPointsDto[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Friend streaks
// ─────────────────────────────────────────────────────────────────────────────

export const CreateStreakSchema = z.object({
  friendId: z.string().uuid(),
});
export type CreateStreakDto = z.infer<typeof CreateStreakSchema>;

export interface StreakWeekProgressDto {
  done: number;
  target: number;
}

export interface FriendStreakDto {
  id: string;
  status: FriendStreakStatus;
  friend: SocialCardDto;
  count: number;
  longest: number;
  freezes: number;
  /** Current-week goal progress for both sides (friends-only visibility). */
  thisWeek: {
    you: StreakWeekProgressDto;
    them: StreakWeekProgressDto;
  };
}

export interface StreakListDto {
  active: FriendStreakDto[];
  incoming: FriendStreakDto[];
  outgoing: FriendStreakDto[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Trophies
// ─────────────────────────────────────────────────────────────────────────────

export interface TrophyDto {
  kind: TrophyKind;
  refId: string;
  tier: string | null;
  createdAt: string;
}

export interface TrophyListDto {
  items: TrophyDto[];
  /** kind → count, for the shelf header. */
  counts: Partial<Record<TrophyKind, number>>;
}
