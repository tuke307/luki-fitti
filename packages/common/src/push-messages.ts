import { Arena, NotificationKind } from './enums';

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
