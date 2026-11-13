import { Arena, LeagueOutcome, LeagueStage, LeagueStageMode } from '@luki-fitti/common/enums';
import type { LeagueZone } from '@luki-fitti/common/schemas';

/** Arena ladder, lowest first. */
export const ARENA_ORDER = [
  Arena.BRONZE,
  Arena.SILVER,
  Arena.GOLD,
  Arena.PLATINUM,
  Arena.DIAMOND,
  Arena.OBSIDIAN,
  Arena.TITAN,
] as const;

/** Minimum cohort size before promotion/demotion outcomes apply. */
export const LEAGUE_MIN_COHORT_SIZE = 5;
/** Arenas bucket merges stop once a bucket reaches this many active users. */
export const ARENA_BUCKET_MIN_USERS = 10;
/** Consecutive missed weeks before the arena drops one step. */
export const LEAGUE_INACTIVE_WEEKS_LIMIT = 2;

export function arenaStep(arena: Arena, delta: number): Arena {
  const idx = ARENA_ORDER.indexOf(arena);
  const next = Math.min(Math.max(idx + delta, 0), ARENA_ORDER.length - 1);
  return ARENA_ORDER[next]!;
}

/** Stage a week plays at: forced by mode, else by active-user thresholds (AUTO). */
export function selectStage(
  mode: LeagueStageMode,
  activeUsers: number,
  stage2MinUsers: number,
  stage3MinUsers: number,
): LeagueStage {
  if (mode !== LeagueStageMode.AUTO) return mode as unknown as LeagueStage;
  if (activeUsers >= stage3MinUsers) return LeagueStage.ARENAS;
  if (activeUsers >= stage2MinUsers) return LeagueStage.GLOBAL;
  return LeagueStage.FRIENDS;
}

/**
 * Promotion/demotion line sizes for a cohort of `n` members.
 * GLOBAL: top ceil(n/5) promotes, bottom floor(n/5) demotes.
 * ARENAS: top max(1, round(7n/30)) promotes, bottom round(5n/30) demotes.
 * Cohorts smaller than LEAGUE_MIN_COHORT_SIZE produce no movement.
 */
export function outcomeCounts(
  stage: LeagueStage,
  memberCount: number,
): { promoteCount: number; demoteCount: number } {
  if (memberCount < LEAGUE_MIN_COHORT_SIZE || stage === LeagueStage.FRIENDS) {
    return { promoteCount: 0, demoteCount: 0 };
  }
  if (stage === LeagueStage.GLOBAL) {
    return {
      promoteCount: Math.ceil(memberCount * 0.2),
      demoteCount: Math.floor(memberCount * 0.2),
    };
  }
  return {
    promoteCount: Math.max(1, Math.round((memberCount * 7) / 30)),
    demoteCount: Math.round((memberCount * 5) / 30),
  };
}

/**
 * Outcome for `rank` (1-based) inside its cohort. Arena edges are honoured:
 * BRONZE never demotes, TITAN never promotes.
 */
export function outcomeFor(
  stage: LeagueStage,
  arena: Arena,
  rank: number,
  memberCount: number,
): LeagueOutcome {
  const { promoteCount, demoteCount } = outcomeCounts(stage, memberCount);
  if (rank <= promoteCount && arena !== Arena.TITAN) return LeagueOutcome.PROMOTED;
  if (rank > memberCount - demoteCount && arena !== Arena.BRONZE) return LeagueOutcome.DEMOTED;
  return LeagueOutcome.STAYED;
}

/** Display zone for a live rank inside the current (unclosed) week. */
export function zoneFor(
  stage: LeagueStage,
  arena: Arena,
  rank: number,
  memberCount: number,
): LeagueZone {
  const outcome = outcomeFor(stage, arena, rank, memberCount);
  if (outcome === LeagueOutcome.PROMOTED) return 'PROMOTE';
  if (outcome === LeagueOutcome.DEMOTED) return 'DEMOTE';
  return 'SAFE';
}

/**
 * Arena → bucket index for an ARENAS week. Walks arenas bottom-up (BRONZE first)
 * and merges adjacent arenas into one bucket until it holds at least `minUsers`
 * users active last week; a smaller leftover group at the top merges down into
 * the previous bucket. `activePerArena` counts only eligible users.
 */
export function computeArenaBuckets(
  activePerArena: Record<Arena, number>,
  minUsers = ARENA_BUCKET_MIN_USERS,
): Record<Arena, number> {
  const buckets = {} as Record<Arena, number>;
  let bucket = 0;
  let size = 0;
  for (const arena of ARENA_ORDER) {
    buckets[arena] = bucket;
    size += activePerArena[arena] ?? 0;
    if (size >= minUsers) {
      bucket += 1;
      size = 0;
    }
  }
  // A trailing bucket below the minimum merges back into the previous one —
  // but only when it contains TITAN (the top arena has no higher bucket to
  // merge upward into). A partial bucket below empty top arenas stays.
  if (size > 0 && size < minUsers && bucket > 0 && (activePerArena[Arena.TITAN] ?? 0) > 0) {
    for (const arena of ARENA_ORDER) {
      if (buckets[arena] === bucket) buckets[arena] = bucket - 1;
    }
  }
  return buckets;
}
