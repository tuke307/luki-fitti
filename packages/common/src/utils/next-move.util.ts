import type { Arena } from '../enums';
import type { FriendWeekDto, NextMoveDto, SocialCardDto } from '../schemas/social.schemas';

/** Everything the hub needs to pick the one actionable "next move" line. */
export interface NextMoveInput {
  /** Incoming friend requests (count only — there is no single actor). */
  friendRequests: number;
  duelInvites: { duelId: string; actor: SocialCardDto; createdAt?: string }[];
  streakInvites: { streakId: string; actor: SocialCardDto; createdAt?: string }[];
  squadInvites: { squadName: string; actor: SocialCardDto; createdAt?: string }[];
  /** Friends with their workout count this week (any order). */
  friendsWeek: FriendWeekDto[];
  yourWorkouts: number;
  /** Active duels from the caller's perspective. */
  activeDuels: {
    duelId: string;
    actor: SocialCardDto;
    you: number;
    them: number;
    daysLeft: number;
  }[];
  /** Own arena when in the demotion zone of a cohort stage, else null. */
  demotionArena: Arena | null;
  /** Community raid boss slug while ACTIVE with zero own damage, else null. */
  raidBossSlug: string | null;
}

// Oldest by createdAt; items without one keep list order (first wins ties).
const oldest = <T extends { createdAt?: string }>(items: T[]): T | undefined =>
  items.reduce<T | undefined>(
    (best, item) =>
      best === undefined || (item.createdAt ?? '') < (best.createdAt ?? '') ? item : best,
    undefined,
  );

/**
 * Priority picker for the hub's next-move line — first match wins:
 * friend requests → duel invite → streak invite → squad invite → a friend
 * ahead of you this week → behind in a duel → demotion zone → untouched raid.
 */
export function pickNextMove(input: NextMoveInput): NextMoveDto | null {
  if (input.friendRequests > 0) {
    return { kind: 'FRIEND_REQUESTS', count: input.friendRequests };
  }
  const duelInvite = oldest(input.duelInvites);
  if (duelInvite) {
    return { kind: 'DUEL_INVITE', duelId: duelInvite.duelId, actor: duelInvite.actor };
  }
  const streakInvite = oldest(input.streakInvites);
  if (streakInvite) {
    return { kind: 'STREAK_INVITE', streakId: streakInvite.streakId, actor: streakInvite.actor };
  }
  const squadInvite = oldest(input.squadInvites);
  if (squadInvite) {
    return {
      kind: 'SQUAD_INVITE',
      squadName: squadInvite.squadName,
      actor: squadInvite.actor,
    };
  }
  // The friend with the most workouts this week, when ahead of you; ties by username.
  const ahead = input.friendsWeek
    .filter((f) => f.workouts > input.yourWorkouts)
    .sort((a, b) => b.workouts - a.workouts || a.card.username.localeCompare(b.card.username))[0];
  if (ahead) {
    return {
      kind: 'FRIEND_AHEAD',
      actor: ahead.card,
      them: ahead.workouts,
      you: input.yourWorkouts,
    };
  }
  // The active duel with the largest deficit.
  const behind = input.activeDuels
    .filter((d) => d.them > d.you)
    .sort((a, b) => b.them - b.you - (a.them - a.you))[0];
  if (behind) {
    return {
      kind: 'DUEL_BEHIND',
      duelId: behind.duelId,
      actor: behind.actor,
      you: behind.you,
      them: behind.them,
      daysLeft: behind.daysLeft,
    };
  }
  if (input.demotionArena) {
    return { kind: 'LEAGUE_DEMOTION', arena: input.demotionArena };
  }
  if (input.raidBossSlug) {
    return { kind: 'RAID_NO_DAMAGE', bossSlug: input.raidBossSlug };
  }
  return null;
}
