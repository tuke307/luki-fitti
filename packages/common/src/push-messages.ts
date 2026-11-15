import { Arena, NotificationKind } from './enums';
import { RAID_BOSSES } from './raid/raid-bosses';

/**
 * Localised push/inbox title/body per notification kind — the "mean" voice from
 * PRODUCT.md. `{actor}` is replaced with the actor's `@username` — display
 * names are friends-only and never go into notification text. Actors without a
 * username render as `anonymousActorName(locale)`. Unknown locales fall back
 * to English.
 *
 * Every entry has exactly 3 variants per locale; `renderNotification` picks one
 * by hashing a per-notification seed, so push and inbox show the same line.
 */
export interface PushMessage {
  title: string;
  body: string;
}

type Locale = 'en' | 'de';

/** One copy set: exactly 3 variants per locale. */
type NotificationCopy = Record<Locale, PushMessage[]>;

/**
 * Keys are the NotificationKind, or `kind.subVariant` for payload-picked
 * variants: `LEAGUE_ENDING.promotion|demotion`, `DUEL_STANDINGS.leading|behind`,
 * `DUEL_RESULT.WON|LOST|TIE`.
 */
const NOTIFICATION_COPY: Record<string, NotificationCopy> = {
  [NotificationKind.FRIEND_REQUEST]: {
    en: [
      { title: 'Friend request', body: '{actor} wants to be friends. Brave.' },
      {
        title: 'Someone noticed you',
        body: "{actor} sent you a friend request. Don't make it weird.",
      },
      {
        title: 'New rival incoming',
        body: '{actor} wants in. Accept and finally have someone to lose to.',
      },
    ],
    de: [
      {
        title: 'Freundschaftsanfrage',
        body: '{actor} will mit dir befreundet sein. Mutig.',
      },
      {
        title: 'Jemand hat dich bemerkt',
        body: "{actor} hat dir eine Anfrage geschickt. Mach's nicht komisch.",
      },
      {
        title: 'Neuer Rivale',
        body: '{actor} will rein. Nimm an, dann hast du endlich jemanden zum Verlieren.',
      },
    ],
  },
  [NotificationKind.FRIEND_ACCEPTED]: {
    en: [
      {
        title: 'Request accepted',
        body: '{actor} said yes. Now they can see how little you train.',
      },
      {
        title: 'You have a friend',
        body: "{actor} accepted. Time to prove you're not all talk.",
      },
      {
        title: "It's official",
        body: '{actor} is your friend now. No more hiding on the couch.',
      },
    ],
    de: [
      {
        title: 'Anfrage angenommen',
        body: '{actor} hat Ja gesagt. Jetzt sieht man, wie wenig du trainierst.',
      },
      {
        title: 'Du hast einen Freund',
        body: '{actor} hat angenommen. Zeit zu beweisen, dass du nicht nur laberst.',
      },
      {
        title: 'Offiziell',
        body: '{actor} ist jetzt dein Freund. Kein Verstecken mehr auf der Couch.',
      },
    ],
  },
  [NotificationKind.LEAGUE_PROMOTED]: {
    en: [
      {
        title: 'Promoted to {arena}',
        body: "Rank {rank}. Fine, you're not completely useless.",
      },
      { title: 'Welcome to {arena}', body: "Rank {rank} got you up. Don't get used to it." },
      {
        title: 'Up to {arena}',
        body: 'Rank {rank}. Who are you and what did you do with the lazy one?',
      },
    ],
    de: [
      {
        title: 'Aufstieg in {arena}',
        body: 'Rang {rank}. Okay, du bist doch nicht komplett nutzlos.',
      },
      {
        title: 'Willkommen in {arena}',
        body: 'Rang {rank} hat gereicht. Gewöhn dich bloß nicht dran.',
      },
      {
        title: 'Hoch nach {arena}',
        body: 'Rang {rank}. Wer bist du und was hast du mit dem Faulpelz gemacht?',
      },
    ],
  },
  [NotificationKind.LEAGUE_DEMOTED]: {
    en: [
      {
        title: 'Demoted to {arena}',
        body: 'Rank {rank}. The last league was clearly too much for you.',
      },
      {
        title: 'Back to {arena}',
        body: 'Rank {rank}. Gravity wins again. So does your couch.',
      },
      { title: 'Down to {arena}', body: 'Rank {rank}. Embarrassing, but fixable. Probably.' },
    ],
    de: [
      {
        title: 'Abstieg in {arena}',
        body: 'Rang {rank}. Die letzte Liga war wohl zu viel für dich.',
      },
      {
        title: 'Zurück nach {arena}',
        body: 'Rang {rank}. Die Schwerkraft gewinnt. Deine Couch auch.',
      },
      {
        title: 'Runter nach {arena}',
        body: 'Rang {rank}. Peinlich, aber reparabel. Wahrscheinlich.',
      },
    ],
  },
  [`${NotificationKind.LEAGUE_ENDING}.promotion`]: {
    en: [
      {
        title: 'League week ends tonight',
        body: '{places} ranks to promotion. One workout. Move.',
      },
      {
        title: 'Last chance this week',
        body: "You're {places} ranks short of promotion. The gym is open, genius.",
      },
      {
        title: "Tonight's the deadline",
        body: '{places} ranks from going up. Or stay mediocre, your call.',
      },
    ],
    de: [
      {
        title: 'Ligawoche endet heute',
        body: 'Dir fehlen {places} Ränge zum Aufstieg. Ein Workout. Los.',
      },
      {
        title: 'Letzte Chance diese Woche',
        body: '{places} Ränge bis zum Aufstieg. Das Gym hat offen, Genie.',
      },
      {
        title: 'Heute ist Deadline',
        body: '{places} Ränge bis nach oben. Oder bleib mittelmäßig, deine Entscheidung.',
      },
    ],
  },
  [`${NotificationKind.LEAGUE_ENDING}.demotion`]: {
    en: [
      { title: 'Demotion zone. Tonight.', body: 'Do something, damn it.' },
      {
        title: "You're going down",
        body: 'Demotion zone and the week ends tonight. Get your ass to the gym.',
      },
      {
        title: 'League week ends tonight',
        body: "You're in the demotion zone. Your couch is cheering. Nobody else is.",
      },
    ],
    de: [
      { title: 'Abstiegszone. Heute Nacht.', body: 'Tu verdammt nochmal was.' },
      {
        title: 'Du steigst ab',
        body: 'Abstiegszone und die Woche endet heute. Beweg deinen Arsch ins Gym.',
      },
      {
        title: 'Ligawoche endet heute',
        body: 'Du bist in der Abstiegszone. Deine Couch jubelt. Sonst niemand.',
      },
    ],
  },
  [NotificationKind.DUEL_INVITE]: {
    en: [
      {
        title: 'Duel challenge',
        body: "{actor} challenged you. Accept or admit you're scared.",
      },
      {
        title: "You've been called out",
        body: '{actor} thinks they can beat you this week. Do they?',
      },
      {
        title: '1v1 incoming',
        body: '{actor} wants a duel. Chickening out is also an option. A sad one.',
      },
    ],
    de: [
      {
        title: 'Duell-Herausforderung',
        body: '{actor} fordert dich heraus. Annehmen oder zugeben, dass du Schiss hast.',
      },
      {
        title: 'Du wurdest herausgefordert',
        body: '{actor} glaubt, dich diese Woche zu schlagen. Stimmt das?',
      },
      {
        title: '1 gegen 1',
        body: '{actor} will ein Duell. Kneifen geht auch. Ist nur traurig.',
      },
    ],
  },
  [NotificationKind.DUEL_ACCEPTED]: {
    en: [
      { title: 'Duel accepted', body: '{actor} is in. It starts tomorrow. No excuses then.' },
      {
        title: 'Game on',
        body: "{actor} accepted your duel. Hope you weren't bluffing.",
      },
      {
        title: "It's happening",
        body: '{actor} took the bait. Duel starts tomorrow, try not to embarrass yourself.',
      },
    ],
    de: [
      {
        title: 'Duell angenommen',
        body: "{actor} ist dabei. Morgen geht's los. Dann keine Ausreden.",
      },
      {
        title: 'Es geht los',
        body: '{actor} hat dein Duell angenommen. Hoffentlich war das kein Bluff.',
      },
      {
        title: "Jetzt wird's ernst",
        body: '{actor} hat angebissen. Morgen startet das Duell, blamier dich nicht.',
      },
    ],
  },
  [`${NotificationKind.DUEL_STANDINGS}.leading`]: {
    en: [
      {
        title: 'You lead {you}–{them}',
        body: "Against {actor}, {days} days left. Don't get comfy.",
      },
      { title: 'Still ahead', body: '{you}–{them} vs {actor}. {days} days to blow it.' },
      {
        title: 'Duel standings',
        body: 'You lead {actor} {you}–{them}. Enjoy it while it lasts ({days} days).',
      },
    ],
    de: [
      {
        title: 'Du führst {you}–{them}',
        body: 'Gegen {actor}, noch {days} Tage. Werd bloß nicht bequem.',
      },
      {
        title: 'Noch vorne',
        body: "{you}–{them} gegen {actor}. Noch {days} Tage, um's zu versauen.",
      },
      {
        title: 'Duell-Zwischenstand',
        body: 'Du führst gegen {actor} {you}–{them}. Genieß es, solange es hält ({days} Tage).',
      },
    ],
  },
  [`${NotificationKind.DUEL_STANDINGS}.behind`]: {
    en: [
      { title: '{actor} leads {them}–{you}', body: 'Embarrassing. {days} days to fix it.' },
      {
        title: "You're losing",
        body: '{actor} is ahead {them}–{you}. {days} days left. Train, damn it.',
      },
      {
        title: 'Duel standings',
        body: '{actor} {them}, you {you}. Your excuses are not on the scoreboard.',
      },
    ],
    de: [
      {
        title: '{actor} führt {them}–{you}',
        body: "Peinlich. Noch {days} Tage, um's zu richten.",
      },
      {
        title: 'Du verlierst',
        body: '{actor} liegt {them}–{you} vorne. Noch {days} Tage. Trainier verdammt nochmal.',
      },
      {
        title: 'Duell-Zwischenstand',
        body: '{actor} {them}, du {you}. Deine Ausreden zählen nicht als Punkte.',
      },
    ],
  },
  [`${NotificationKind.DUEL_RESULT}.WON`]: {
    en: [
      { title: 'Duel won', body: 'You crushed {actor} {you}–{them}. Go on, rub it in.' },
      {
        title: 'Victory',
        body: "{you}–{them} against {actor}. Don't let it go to your head.",
      },
      {
        title: 'You beat {actor}',
        body: '{you}–{them}. Screenshot it, this might not happen again.',
      },
    ],
    de: [
      {
        title: 'Duell gewonnen',
        body: "Du hast {actor} {you}–{them} zerlegt. Reib's ruhig rein.",
      },
      {
        title: 'Sieg',
        body: '{you}–{them} gegen {actor}. Steig dir bloß nicht zu Kopf.',
      },
      {
        title: 'Du hast {actor} geschlagen',
        body: '{you}–{them}. Mach einen Screenshot, das passiert vielleicht nie wieder.',
      },
    ],
  },
  [`${NotificationKind.DUEL_RESULT}.LOST`]: {
    en: [
      {
        title: 'Duel lost',
        body: '{actor} beat you {them}–{you}. Rematch, or are you scared?',
      },
      {
        title: 'Ouch',
        body: "{them}–{you} for {actor}. That one's going in the group chat.",
      },
      {
        title: '{actor} won',
        body: "{them}–{you}. Your couch says it's proud of you. Nobody else is.",
      },
    ],
    de: [
      {
        title: 'Duell verloren',
        body: '{actor} hat dich {them}–{you} abgezogen. Revanche oder Schiss?',
      },
      { title: 'Autsch', body: '{them}–{you} für {actor}. Das landet im Gruppenchat.' },
      {
        title: '{actor} hat gewonnen',
        body: '{them}–{you}. Deine Couch ist stolz auf dich. Sonst niemand.',
      },
    ],
  },
  [`${NotificationKind.DUEL_RESULT}.TIE`]: {
    en: [
      {
        title: 'Duel tied',
        body: '{you}–{them} with {actor}. Equally mediocre. Rematch?',
      },
      {
        title: 'Dead heat',
        body: 'You and {actor}, {you} each. Neither of you tried hard enough.',
      },
      {
        title: "It's a draw",
        body: '{you}–{them} against {actor}. Both win, both should have trained more.',
      },
    ],
    de: [
      { title: 'Unentschieden', body: '{you}–{them} mit {actor}. Gleich mittelmäßig. Revanche?' },
      {
        title: 'Patt',
        body: 'Du und {actor}, jeweils {you}. Keiner von euch hat sich angestrengt.',
      },
      {
        title: 'Gleichstand',
        body: '{you}–{them} gegen {actor}. Beide gewinnen, beide hätten mehr trainieren sollen.',
      },
    ],
  },
  [NotificationKind.STREAK_INVITE]: {
    en: [
      {
        title: 'Streak invite',
        body: "{actor} wants a weekly streak with you. Don't be the one who breaks it.",
      },
      {
        title: 'Commitment request',
        body: '{actor} trusts you with a streak. Bold move on their part.',
      },
      {
        title: 'Weekly streak?',
        body: '{actor} wants to train together every week. Can you even handle that?',
      },
    ],
    de: [
      {
        title: 'Streak-Einladung',
        body: '{actor} will eine Wochen-Streak mit dir. Sei nicht der, der sie killt.',
      },
      {
        title: 'Verpflichtung gesucht',
        body: '{actor} traut dir eine Streak zu. Mutig von {actor}.',
      },
      {
        title: 'Wochen-Streak?',
        body: '{actor} will jede Woche mit dir durchziehen. Schaffst du das überhaupt?',
      },
    ],
  },
  [NotificationKind.STREAK_STARTED]: {
    en: [
      {
        title: 'Streak started',
        body: '{actor} is in. If this dies, everyone will know whose fault it was.',
      },
      {
        title: "You're locked in",
        body: 'Streak with {actor} starts now. No pressure. Lots of pressure.',
      },
      {
        title: 'Week one',
        body: '{actor} accepted. Hit your weekly goal or carry the shame.',
      },
    ],
    de: [
      {
        title: 'Streak gestartet',
        body: '{actor} ist dabei. Wenn die stirbt, weiß jeder, wer schuld war.',
      },
      {
        title: "Jetzt gibt's kein Zurück",
        body: 'Streak mit {actor} läuft. Kein Druck. Viel Druck.',
      },
      {
        title: 'Woche eins',
        body: '{actor} hat angenommen. Schaff dein Wochenziel oder trag die Schande.',
      },
    ],
  },
  [NotificationKind.STREAK_REMINDER]: {
    en: [
      {
        title: 'Your streak dies tonight',
        body: '{count} weeks with {actor}. Your call, champ.',
      },
      {
        title: 'Streak in danger',
        body: '{actor} did their part. You? {count} weeks on the line.',
      },
      {
        title: 'Last call',
        body: 'Train today or explain to {actor} why your {count}-week streak is gone.',
      },
    ],
    de: [
      {
        title: 'Deine Streak stirbt heute',
        body: '{count} Wochen mit {actor}. Deine Entscheidung, Champ.',
      },
      {
        title: 'Streak in Gefahr',
        body: '{actor} hat geliefert. Du? {count} Wochen stehen auf dem Spiel.',
      },
      {
        title: 'Letzter Aufruf',
        body: 'Trainier heute oder erklär {actor}, warum eure {count}-Wochen-Streak weg ist.',
      },
    ],
  },
  [NotificationKind.STREAK_FROZEN]: {
    en: [
      {
        title: 'Freeze used',
        body: 'A freeze saved your {count}-week streak with {actor}. You got lucky.',
      },
      {
        title: 'Saved by the freeze',
        body: "{count} weeks with {actor} survive. Don't count on it twice.",
      },
      {
        title: 'Streak frozen',
        body: "You slacked, the freeze didn't. {count} weeks with {actor} live on.",
      },
    ],
    de: [
      {
        title: 'Freeze eingesetzt',
        body: 'Ein Freeze hat deine {count}-Wochen-Streak mit {actor} gerettet. Glück gehabt.',
      },
      {
        title: 'Vom Freeze gerettet',
        body: '{count} Wochen mit {actor} überleben. Verlass dich nicht zweimal drauf.',
      },
      {
        title: 'Streak eingefroren',
        body: 'Du hast gechillt, der Freeze nicht. {count} Wochen mit {actor} leben weiter.',
      },
    ],
  },
  [NotificationKind.STREAK_BROKEN]: {
    en: [
      {
        title: 'Streak: dead',
        body: 'Your streak with {actor} is gone. Murder weapon: your couch.',
      },
      {
        title: 'Back to zero',
        body: 'The streak with {actor} starts over. Try not to kill this one.',
      },
      {
        title: 'RIP streak',
        body: "You and {actor} start fresh this week. Somebody slacked. We won't say who.",
      },
    ],
    de: [
      { title: 'Streak: tot', body: 'Deine Streak mit {actor} ist weg. Tatwaffe: deine Couch.' },
      {
        title: 'Zurück auf null',
        body: 'Die Streak mit {actor} fängt neu an. Bring die hier nicht auch um.',
      },
      {
        title: 'RIP Streak',
        body: 'Du und {actor} startet neu. Einer hat gechillt. Wir sagen nicht, wer.',
      },
    ],
  },
  [NotificationKind.RAID_SPAWNED]: {
    en: [
      { title: '{boss} has arrived', body: 'New raid boss. Everyone hits it this week. Even you.' },
      { title: 'New raid boss', body: "{boss} is here and doesn't fear you. Change that." },
      {
        title: 'Boss incoming',
        body: '{boss} wants a fight. Your workouts do the damage, so do some.',
      },
    ],
    de: [
      {
        title: '{boss} ist da',
        body: 'Neuer Raid-Boss. Alle hauen diese Woche drauf. Sogar du.',
      },
      {
        title: 'Neuer Raid-Boss',
        body: '{boss} ist da und hat keine Angst vor dir. Ändere das.',
      },
      {
        title: 'Boss im Anmarsch',
        body: '{boss} will Ärger. Deine Workouts machen Schaden, also mach welche.',
      },
    ],
  },
  [NotificationKind.RAID_PHASE]: {
    en: [
      { title: '{boss} is enraged', body: 'Below {percent} % HP. Everyone is fighting. Are you?' },
      { title: '{boss} at {percent} %', body: "It's getting angry. Get angrier. Go train." },
      {
        title: 'The boss is wounded',
        body: "{boss} under {percent} %. Don't let the others carry you.",
      },
    ],
    de: [
      {
        title: '{boss} rastet aus',
        body: 'Unter {percent} % KP. Alle kämpfen. Du auch?',
      },
      {
        title: '{boss} bei {percent} %',
        body: 'Er wird wütend. Werd wütender. Geh trainieren.',
      },
      {
        title: 'Der Boss wankt',
        body: '{boss} unter {percent} %. Lass dich nicht von den anderen tragen.',
      },
    ],
  },
  [NotificationKind.RAID_DEFEATED]: {
    en: [
      { title: '{boss} defeated', body: 'Trophy earned. Hopefully you actually helped.' },
      { title: 'Boss down', body: '{boss} is done. Collect your trophy, hero.' },
      { title: 'Victory', body: '{boss} fell. Even your damage counted. Barely.' },
    ],
    de: [
      {
        title: '{boss} besiegt',
        body: 'Trophäe verdient. Hoffentlich hast du wirklich geholfen.',
      },
      { title: 'Boss erledigt', body: '{boss} ist fertig. Hol dir deine Trophäe, Held.' },
      { title: 'Sieg', body: '{boss} ist gefallen. Sogar dein Schaden hat gezählt. Knapp.' },
    ],
  },
  [NotificationKind.RAID_ESCAPED]: {
    en: [
      {
        title: '{boss} escaped',
        body: 'Thanks for nothing. The next one is already waiting.',
      },
      { title: 'It got away', body: '{boss} walked off laughing. Do better next week.' },
      {
        title: 'Raid failed',
        body: '{boss} escaped. Somebody skipped leg day. Several somebodies.',
      },
    ],
    de: [
      { title: '{boss} ist entkommen', body: 'Danke für nichts. Der nächste wartet schon.' },
      { title: 'Entwischt', body: '{boss} ist lachend abgehauen. Nächste Woche besser.' },
      {
        title: 'Raid gescheitert',
        body: '{boss} ist entkommen. Irgendwer hat den Beintag geschwänzt. Mehrere.',
      },
    ],
  },
  [NotificationKind.SQUAD_INVITE]: {
    en: [
      { title: 'Squad invite', body: "{actor} wants you in {squad}. Don't drag them down." },
      {
        title: "You've been drafted",
        body: '{actor} invited you to {squad}. They must be desperate.',
      },
      { title: 'Join {squad}?', body: '{actor} needs another fighter. Even you will do.' },
    ],
    de: [
      { title: 'Squad-Einladung', body: '{actor} will dich in {squad}. Zieh sie nicht runter.' },
      {
        title: 'Du wurdest eingezogen',
        body: '{actor} lädt dich in {squad} ein. Muss ja verzweifelt sein.',
      },
      {
        title: '{squad} beitreten?',
        body: '{actor} braucht noch einen Kämpfer. Sogar du reichst.',
      },
    ],
  },
  [NotificationKind.SQUAD_RAID_STARTED]: {
    en: [
      { title: '{squad} is raiding', body: "{boss} is under attack. You're not. Fix that." },
      { title: 'Squad raid started', body: '{squad} vs {boss}. Show up or get carried.' },
      {
        title: 'Your squad needs you',
        body: "{squad} started on {boss}. Allegedly you're part of it.",
      },
    ],
    de: [
      { title: '{squad} raidet', body: '{boss} wird angegriffen. Von dir nicht. Ändere das.' },
      {
        title: 'Squad-Raid gestartet',
        body: '{squad} gegen {boss}. Komm mit oder lass dich tragen.',
      },
      {
        title: 'Dein Squad braucht dich',
        body: '{squad} kämpft gegen {boss}. Angeblich gehörst du dazu.',
      },
    ],
  },
  [NotificationKind.FRIEND_PULLED_AHEAD]: {
    en: [
      {
        title: '{actor} is ahead',
        body: '{actor}: {count} workouts this week. You: {you}. Loser.',
      },
      {
        title: '{actor} {count}, you {you}',
        body: '{actor} is pulling away. Get your ass to the gym.',
      },
      {
        title: 'Meanwhile, {actor}…',
        body: "…is at {count} workouts this week. You're at {you}. Your couch must be thrilled.",
      },
    ],
    de: [
      {
        title: '{actor} liegt vorne',
        body: '{actor}: {count} Workouts diese Woche. Du: {you}. Lappen.',
      },
      {
        title: '{actor} {count}, du {you}',
        body: '{actor} zieht davon. Beweg deinen Arsch ins Gym.',
      },
      {
        title: 'Währenddessen {actor}…',
        body: '…steht bei {count} Workouts diese Woche. Du bei {you}. Deine Couch freut sich.',
      },
    ],
  },
};

/** Arena names shown in notification text, per locale. */
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

/** Raid boss display name in notification text, per locale. */
export function raidBossName(slug: string, locale: string | null | undefined): string {
  const boss = RAID_BOSSES.find((b) => b.slug === slug);
  if (!boss) return slug;
  return locale?.toLowerCase().startsWith('de') ? boss.name.de : boss.name.en;
}

/** Copy-set key: the kind, plus a sub-variant for payload-picked kinds. */
function copyKey(kind: NotificationKind, payload: Record<string, unknown>): string {
  if (kind === NotificationKind.LEAGUE_ENDING) {
    return `${kind}.${payload.inDemotionZone === true ? 'demotion' : 'promotion'}`;
  }
  if (kind === NotificationKind.DUEL_STANDINGS) {
    return `${kind}.${payload.leading === true ? 'leading' : 'behind'}`;
  }
  if (kind === NotificationKind.DUEL_RESULT) {
    const outcome = payload.outcome === 'WON' ? 'WON' : payload.outcome === 'TIE' ? 'TIE' : 'LOST';
    return `${kind}.${outcome}`;
  }
  return kind;
}

/** Stable 32-bit FNV-1a hash → variant index. Same seed, same line. */
function variantIndex(seed: string, count: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % count;
}

/** Notification text for an actor without a username (display names stay friends-only). */
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

/**
 * Full render pipeline for one notification: picks the copy set by payload,
 * then one of the 3 variants by hashing `variantSeed` (callers pass the
 * notification id, so push and inbox show the same line), then substitutes
 * placeholders and the actor fallback. Shared by push delivery (per device
 * locale) and the inbox list.
 */
export function renderNotification(
  kind: NotificationKind,
  payload: Record<string, unknown>,
  actorUsername: string | null,
  locale: string | null | undefined,
  variantSeed: string,
): PushMessage {
  const lang: Locale = locale?.toLowerCase().startsWith('de') ? 'de' : 'en';
  const copy = NOTIFICATION_COPY[copyKey(kind, payload)]!;
  const variants = copy[lang] ?? copy.en;
  const template = variants[variantIndex(variantSeed, variants.length)] ?? variants[0]!;
  return renderPushMessage(template, {
    actor: actorUsername ? `@${actorUsername}` : anonymousActorName(locale),
    arena: arenaName(String(payload.toArena ?? payload.fromArena ?? ''), locale),
    rank: String(payload.rank ?? ''),
    places: String(payload.placesToPromotion ?? ''),
    you: String(payload.you ?? ''),
    them: String(payload.them ?? ''),
    days: String(payload.daysLeft ?? ''),
    count: String(payload.count ?? ''),
    boss: raidBossName(String(payload.bossSlug ?? ''), locale),
    squad: String(payload.squadName ?? ''),
    percent: String(payload.percent ?? ''),
  });
}
