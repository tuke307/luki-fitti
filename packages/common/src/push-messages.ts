import { Arena, NotificationKind } from './enums';
import { RAID_BOSSES } from './raid/raid-bosses';

/**
 * Localised push title/body per notification kind. `{actor}` is replaced with the
 * actor's `@handle` by the sender — display names are friends-only and never go
 * into push text. Actors without a handle render as `anonymousActorName(locale)`.
 * Unknown locales fall back to English.
 */
export interface PushMessage {
  title: string;
  body: string;
}

type Locale = 'en' | 'de';

const MESSAGES: Record<NotificationKind, Record<Locale, PushMessage>> = {
  [NotificationKind.FRIEND_REQUEST]: {
    en: { title: 'New friend request', body: '{actor} wants to be your friend' },
    de: { title: 'Neue Freundschaftsanfrage', body: '{actor} möchte mit dir befreundet sein' },
  },
  [NotificationKind.FRIEND_ACCEPTED]: {
    en: { title: 'Friend request accepted', body: '{actor} accepted your friend request' },
    de: {
      title: 'Freundschaftsanfrage angenommen',
      body: '{actor} hat deine Freundschaftsanfrage angenommen',
    },
  },
  [NotificationKind.LEAGUE_PROMOTED]: {
    en: { title: 'Promoted to {arena}', body: 'You finished rank {rank} — welcome to {arena}' },
    de: { title: 'Aufstieg in {arena}', body: 'Rang {rank} — willkommen in {arena}' },
  },
  [NotificationKind.LEAGUE_DEMOTED]: {
    en: { title: 'Demoted to {arena}', body: 'You finished rank {rank} and drop to {arena}' },
    de: { title: 'Abstieg in {arena}', body: 'Rang {rank} — es geht zurück nach {arena}' },
  },
  // LEAGUE_ENDING is dispatched via leagueEndingMessage (two body variants).
  [NotificationKind.LEAGUE_ENDING]: {
    en: { title: 'League week ends tonight', body: 'The league week ends tonight' },
    de: { title: 'Ligawoche endet heute', body: 'Die Ligawoche endet heute' },
  },
  [NotificationKind.DUEL_INVITE]: {
    en: { title: 'Duel challenge', body: '{actor} challenged you to a duel' },
    de: { title: 'Duell-Herausforderung', body: '{actor} fordert dich zum Duell heraus' },
  },
  [NotificationKind.DUEL_ACCEPTED]: {
    en: { title: 'Duel accepted', body: '{actor} accepted your duel — it starts tomorrow' },
    de: {
      title: 'Duell angenommen',
      body: '{actor} hat dein Duell angenommen — es startet morgen',
    },
  },
  // DUEL_STANDINGS is dispatched via duelStandingsMessage (two body variants).
  [NotificationKind.DUEL_STANDINGS]: {
    en: { title: 'Duel standings', body: 'Your duel with {actor} continues' },
    de: { title: 'Duell-Zwischenstand', body: 'Dein Duell mit {actor} läuft weiter' },
  },
  // DUEL_RESULT is dispatched via duelResultMessage (three body variants).
  [NotificationKind.DUEL_RESULT]: {
    en: { title: 'Duel finished', body: 'Your duel with {actor} is over' },
    de: { title: 'Duell beendet', body: 'Dein Duell mit {actor} ist vorbei' },
  },
  [NotificationKind.STREAK_INVITE]: {
    en: { title: 'Streak invite', body: '{actor} wants to start a weekly streak with you' },
    de: {
      title: 'Streak-Einladung',
      body: '{actor} möchte mit dir eine Wochen-Streak starten',
    },
  },
  [NotificationKind.STREAK_STARTED]: {
    en: { title: 'Streak started', body: '{actor} is in — your streak week starts now' },
    de: { title: 'Streak gestartet', body: '{actor} ist dabei — deine Streak-Woche beginnt' },
  },
  [NotificationKind.STREAK_REMINDER]: {
    en: {
      title: 'Keep your streak alive',
      body: 'Train today to keep your {count}-week streak with {actor}',
    },
    de: {
      title: 'Halte deine Streak',
      body: 'Trainiere heute, um deine {count}-Wochen-Streak mit {actor} zu halten',
    },
  },
  [NotificationKind.STREAK_FROZEN]: {
    en: {
      title: 'Streak freeze used',
      body: 'A freeze saved your {count}-week streak with {actor}',
    },
    de: {
      title: 'Streak eingefroren',
      body: 'Ein Freeze hat deine {count}-Wochen-Streak mit {actor} gerettet',
    },
  },
  [NotificationKind.STREAK_BROKEN]: {
    en: {
      title: 'Streak starts fresh',
      body: 'Your streak with {actor} starts fresh this week',
    },
    de: {
      title: 'Streak beginnt neu',
      body: 'Deine Streak mit {actor} startet diese Woche neu',
    },
  },
  [NotificationKind.RAID_SPAWNED]: {
    en: { title: 'A new raid boss appeared', body: '{boss} is here — take it down this week' },
    de: { title: 'Neuer Raid-Boss', body: '{boss} ist da — besiegt ihn diese Woche' },
  },
  [NotificationKind.RAID_PHASE]: {
    en: { title: 'The boss is enraged', body: '{boss} is below {percent}% HP — keep pushing' },
    de: { title: 'Der Boss rastet', body: '{boss} hat unter {percent} % KP — weiter so' },
  },
  [NotificationKind.RAID_DEFEATED]: {
    en: { title: 'Boss defeated', body: 'You brought {boss} down — trophy earned' },
    de: { title: 'Boss besiegt', body: 'Ihr habt {boss} besiegt — Trophäe verdient' },
  },
  [NotificationKind.RAID_ESCAPED]: {
    en: {
      title: 'The boss escaped',
      body: '{boss} slipped away — the next one is already waiting',
    },
    de: {
      title: 'Der Boss ist entkommen',
      body: '{boss} ist entwischt — der nächste wartet schon',
    },
  },
  [NotificationKind.SQUAD_INVITE]: {
    en: { title: 'Squad invite', body: '{actor} invited you to join {squad}' },
    de: { title: 'Squad-Einladung', body: '{actor} lädt dich in {squad} ein' },
  },
  [NotificationKind.SQUAD_RAID_STARTED]: {
    en: { title: 'Squad raid started', body: '{squad} is raiding {boss} — join the fight' },
    de: { title: 'Squad-Raid gestartet', body: '{squad} kämpft gegen {boss} — mach mit' },
  },
};

/** Arena names shown in push text, per locale. */
export function arenaName(arena: string, locale: string | null | undefined): string {
  const de = locale?.toLowerCase().startsWith('de');
  const names: Record<string, [string, string]> = {
    [Arena.BRONZE]: ['Bronze', 'Bronze'],
    [Arena.SILVER]: ['Silver', 'Silber'],
    [Arena.GOLD]: ['Gold', 'Gold'],
    [Arena.PLATINUM]: ['Platinum', 'Platin'],
    [Arena.DIAMOND]: ['Diamond', 'Diamant'],
    [Arena.OBSIDIAN]: ['Obsidian', 'Obsidian'],
    [Arena.TITAN]: ['Titan', 'Titan'],
  };
  const pair = names[arena];
  return pair ? (de ? pair[1] : pair[0]) : arena;
}

/** Raid boss display name in push text, per locale. */
export function raidBossName(slug: string, locale: string | null | undefined): string {
  const boss = RAID_BOSSES.find((b) => b.slug === slug);
  if (!boss) return slug;
  return locale?.toLowerCase().startsWith('de') ? boss.name.de : boss.name.en;
}

const LEAGUE_ENDING_VARIANTS: Record<'promotion' | 'demotion', Record<Locale, PushMessage>> = {
  promotion: {
    en: { title: 'League week ends tonight', body: 'You are {places} ranks from promotion' },
    de: { title: 'Ligawoche endet heute', body: 'Dir fehlen {places} Ränge zum Aufstieg' },
  },
  demotion: {
    en: { title: 'League week ends tonight', body: 'You are in the demotion zone — climb out' },
    de: { title: 'Ligawoche endet heute', body: 'Du bist in der Abstiegszone — kämpf dich raus' },
  },
};

/** Body variant for LEAGUE_ENDING, picked by whether the member is in the demotion zone. */
export function leagueEndingMessage(
  inDemotionZone: boolean,
  locale: string | null | undefined,
): PushMessage {
  const lang: Locale = locale?.toLowerCase().startsWith('de') ? 'de' : 'en';
  return LEAGUE_ENDING_VARIANTS[inDemotionZone ? 'demotion' : 'promotion'][lang];
}

const DUEL_STANDINGS_VARIANTS: Record<'leading' | 'behind', Record<Locale, PushMessage>> = {
  leading: {
    en: { title: 'Duel standings', body: 'You lead {actor} {you}–{them} · {days} days left' },
    de: { title: 'Duell-Zwischenstand', body: 'Du führst {actor} {you}–{them} · noch {days} Tage' },
  },
  behind: {
    en: { title: 'Duel standings', body: '{actor} leads {them}–{you} · {days} days left' },
    de: { title: 'Duell-Zwischenstand', body: '{actor} führt {them}–{you} · noch {days} Tage' },
  },
};

/** Body variant for DUEL_STANDINGS, picked by whether the recipient is ahead. */
export function duelStandingsMessage(
  leading: boolean,
  locale: string | null | undefined,
): PushMessage {
  const lang: Locale = locale?.toLowerCase().startsWith('de') ? 'de' : 'en';
  return DUEL_STANDINGS_VARIANTS[leading ? 'leading' : 'behind'][lang];
}

const DUEL_RESULT_VARIANTS: Record<'WON' | 'LOST' | 'TIE', Record<Locale, PushMessage>> = {
  WON: {
    en: { title: 'Duel won', body: 'You beat {actor} {you}–{them} — nicely done' },
    de: { title: 'Duell gewonnen', body: 'Du hast {actor} {you}–{them} geschlagen — stark' },
  },
  LOST: {
    en: { title: 'Duel over', body: '{actor} took this one {them}–{you} — the rematch is yours' },
    de: {
      title: 'Duell vorbei',
      body: '{actor} gewinnt {them}–{you} — die Revanche gehört dir',
    },
  },
  TIE: {
    en: { title: 'Duel tied', body: 'Dead heat with {actor} — {you}–{them} each' },
    de: { title: 'Duell unentschieden', body: 'Patt mit {actor} — jeweils {you}–{them}' },
  },
};

/** Body variant for DUEL_RESULT, picked by the recipient's outcome. */
export function duelResultMessage(
  outcome: 'WON' | 'LOST' | 'TIE',
  locale: string | null | undefined,
): PushMessage {
  const lang: Locale = locale?.toLowerCase().startsWith('de') ? 'de' : 'en';
  return DUEL_RESULT_VARIANTS[outcome][lang];
}

export function pushMessageFor(
  kind: NotificationKind,
  locale: string | null | undefined,
): PushMessage {
  const lang: Locale = locale?.toLowerCase().startsWith('de') ? 'de' : 'en';
  return MESSAGES[kind][lang] ?? MESSAGES[kind].en;
}

/** Push text for an actor without a handle (display names stay friends-only). */
export function anonymousActorName(locale: string | null | undefined): string {
  return locale?.toLowerCase().startsWith('de') ? 'Jemand' : 'Someone';
}

export function renderPushMessage(message: PushMessage, vars: Record<string, string>): PushMessage {
  let { title, body } = message;
  for (const [key, value] of Object.entries(vars)) {
    title = title.replaceAll(`{${key}}`, value);
    body = body.replaceAll(`{${key}}`, value);
  }
  return { title, body };
}
