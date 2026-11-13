import { NotificationKind } from './enums';

/**
 * Localised push title/body per notification kind. `{actor}` is replaced with the
 * actor's handle or display name by the sender. Unknown locales fall back to English.
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
};

export function pushMessageFor(
  kind: NotificationKind,
  locale: string | null | undefined,
): PushMessage {
  const lang: Locale = locale?.toLowerCase().startsWith('de') ? 'de' : 'en';
  return MESSAGES[kind][lang] ?? MESSAGES[kind].en;
}

export function renderPushMessage(message: PushMessage, actor: string): PushMessage {
  return {
    title: message.title.replaceAll('{actor}', actor),
    body: message.body.replaceAll('{actor}', actor),
  };
}
