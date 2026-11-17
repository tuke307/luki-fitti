import { raidBossName } from '@luki-fitti/common/push-messages';
import type { NextMoveDto } from '@luki-fitti/common/schemas';
import type { TranslationDictionary } from '@/lib/i18n';
import { arenaName } from './arena-name';

/** Detail page a next move opens on the hub. */
export type NextMoveTarget = 'friends' | 'duels' | 'raids' | 'league';

export function nextMoveTarget(move: NextMoveDto): NextMoveTarget {
  switch (move.kind) {
    case 'FRIEND_REQUESTS':
    case 'STREAK_INVITE':
    case 'FRIEND_AHEAD':
      return 'friends';
    case 'DUEL_INVITE':
    case 'DUEL_BEHIND':
      return 'duels';
    case 'SQUAD_INVITE':
    case 'RAID_NO_DAMAGE':
      return 'raids';
    case 'LEAGUE_DEMOTION':
      return 'league';
  }
}

export function nextMoveText(
  t: TranslationDictionary,
  format: (template: string, values: Record<string, string>) => string,
  move: NextMoveDto,
  locale: string,
): string {
  switch (move.kind) {
    case 'FRIEND_REQUESTS':
      return move.count === 1
        ? t.social.moveFriendRequestsOne
        : format(t.social.moveFriendRequests, { count: String(move.count) });
    case 'DUEL_INVITE':
      return format(t.social.moveDuelInvite, { actor: move.actor.username });
    case 'STREAK_INVITE':
      return format(t.social.moveStreakInvite, { actor: move.actor.username });
    case 'SQUAD_INVITE':
      return format(t.social.moveSquadInvite, {
        actor: move.actor.username,
        squad: move.squadName,
      });
    case 'FRIEND_AHEAD':
      return format(t.social.moveFriendAhead, {
        actor: move.actor.username,
        them: String(move.them),
        you: String(move.you),
      });
    case 'DUEL_BEHIND':
      return format(t.social.moveDuelBehind, {
        actor: move.actor.username,
        them: String(move.them),
        you: String(move.you),
        days: String(move.daysLeft),
      });
    case 'LEAGUE_DEMOTION':
      return format(t.social.moveLeagueDemotion, { arena: arenaName(t, move.arena) });
    case 'RAID_NO_DAMAGE':
      return format(t.social.moveRaidNoDamage, { boss: raidBossName(move.bossSlug, locale) });
  }
}
