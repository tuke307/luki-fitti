import { NotificationKind } from './enums';

export type NotificationCategoryId = 'friends' | 'leagues' | 'duels' | 'streaks' | 'raids';

export type NotificationCategoryPref =
  'pushFriends' | 'pushLeagues' | 'pushDuels' | 'pushStreaks' | 'pushRaids';

export interface NotificationCategory {
  id: NotificationCategoryId;
  /** `UserPreferences` boolean that gates every kind of this category. */
  pref: NotificationCategoryPref;
  /** Kinds in enum order; every NotificationKind is in exactly one category. */
  kinds: readonly NotificationKind[];
}

export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  {
    id: 'friends',
    pref: 'pushFriends',
    kinds: [NotificationKind.FRIEND_REQUEST, NotificationKind.FRIEND_ACCEPTED],
  },
  {
    id: 'leagues',
    pref: 'pushLeagues',
    kinds: [
      NotificationKind.LEAGUE_PROMOTED,
      NotificationKind.LEAGUE_DEMOTED,
      NotificationKind.LEAGUE_ENDING,
    ],
  },
  {
    id: 'duels',
    pref: 'pushDuels',
    kinds: [
      NotificationKind.DUEL_INVITE,
      NotificationKind.DUEL_ACCEPTED,
      NotificationKind.DUEL_STANDINGS,
      NotificationKind.DUEL_RESULT,
    ],
  },
  {
    id: 'streaks',
    pref: 'pushStreaks',
    kinds: [
      NotificationKind.STREAK_INVITE,
      NotificationKind.STREAK_STARTED,
      NotificationKind.STREAK_REMINDER,
      NotificationKind.STREAK_FROZEN,
      NotificationKind.STREAK_BROKEN,
    ],
  },
  {
    id: 'raids',
    pref: 'pushRaids',
    kinds: [
      NotificationKind.RAID_SPAWNED,
      NotificationKind.RAID_PHASE,
      NotificationKind.RAID_DEFEATED,
      NotificationKind.RAID_ESCAPED,
      NotificationKind.SQUAD_INVITE,
      NotificationKind.SQUAD_RAID_STARTED,
    ],
  },
];

const CATEGORY_BY_KIND = new Map<NotificationKind, NotificationCategory>(
  NOTIFICATION_CATEGORIES.flatMap((cat) => cat.kinds.map((kind) => [kind, cat] as const)),
);

export function notificationCategoryOf(kind: NotificationKind): NotificationCategory {
  const cat = CATEGORY_BY_KIND.get(kind);
  if (!cat) throw new Error(`NotificationKind ${kind} has no category`);
  return cat;
}

/**
 * Direct actions by a person — they never count toward, and are never blocked
 * by, the daily push cap.
 */
export const PUSH_CAP_EXEMPT_KINDS: ReadonlySet<NotificationKind> = new Set([
  NotificationKind.FRIEND_REQUEST,
  NotificationKind.FRIEND_ACCEPTED,
  NotificationKind.DUEL_INVITE,
  NotificationKind.STREAK_INVITE,
  NotificationKind.SQUAD_INVITE,
]);

/** At most this many non-exempt social pushes per user per local delivery day. */
export const PUSH_DAILY_CAP = 3;

/**
 * APNs `apns-collapse-id` / Web Push tag: repeated events of the same entity
 * replace each other instead of stacking up. Null means "never collapse".
 */
export function notificationCollapseKey(
  kind: NotificationKind,
  payload: Record<string, unknown>,
): string | null {
  const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null);
  switch (kind) {
    case NotificationKind.DUEL_STANDINGS: {
      const id = str(payload.duelId);
      return id ? `duel-standings:${id}` : null;
    }
    case NotificationKind.RAID_PHASE: {
      const id = str(payload.raidId);
      return id ? `raid-phase:${id}` : null;
    }
    case NotificationKind.LEAGUE_ENDING: {
      const id = str(payload.weekKey);
      return id ? `league-ending:${id}` : null;
    }
    default:
      return null;
  }
}
