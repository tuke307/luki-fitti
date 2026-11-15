import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NotificationKind } from './enums';
import {
  NOTIFICATION_CATEGORIES,
  PUSH_CAP_EXEMPT_KINDS,
  PUSH_DAILY_CAP,
  notificationCategoryOf,
  notificationCollapseKey,
} from './notification-categories';
import { renderNotification } from './push-messages';

describe('NOTIFICATION_CATEGORIES', () => {
  it('puts every NotificationKind in exactly one category', () => {
    const seen = new Map<NotificationKind, number>();
    for (const cat of NOTIFICATION_CATEGORIES) {
      for (const kind of cat.kinds) seen.set(kind, (seen.get(kind) ?? 0) + 1);
    }
    for (const kind of Object.values(NotificationKind)) {
      assert.equal(seen.get(kind), 1, `${kind} must be in exactly one category`);
    }
  });

  it('keeps the web/iOS order: friends, leagues, duels, streaks, raids', () => {
    assert.deepEqual(
      NOTIFICATION_CATEGORIES.map((c) => c.id),
      ['friends', 'leagues', 'duels', 'streaks', 'raids'],
    );
  });

  it('keeps kinds in enum order inside each category', () => {
    const order = Object.values(NotificationKind);
    for (const cat of NOTIFICATION_CATEGORIES) {
      const idx = cat.kinds.map((k) => order.indexOf(k));
      assert.deepEqual(
        [...idx].sort((a, b) => a - b),
        idx,
        cat.id,
      );
    }
  });

  it('maps every kind to its category', () => {
    assert.equal(notificationCategoryOf(NotificationKind.FRIEND_REQUEST).id, 'friends');
    assert.equal(notificationCategoryOf(NotificationKind.SQUAD_RAID_STARTED).id, 'raids');
    assert.equal(notificationCategoryOf(NotificationKind.DUEL_RESULT).pref, 'pushDuels');
  });

  it('exempts only direct actions by a person from the daily cap', () => {
    assert.equal(PUSH_DAILY_CAP, 3);
    assert.deepEqual(
      [...PUSH_CAP_EXEMPT_KINDS].sort(),
      [
        NotificationKind.DUEL_INVITE,
        NotificationKind.FRIEND_ACCEPTED,
        NotificationKind.FRIEND_REQUEST,
        NotificationKind.SQUAD_INVITE,
        NotificationKind.STREAK_INVITE,
      ].sort(),
    );
  });
});

describe('notificationCollapseKey', () => {
  it('collapses repeated events of the same entity', () => {
    assert.equal(
      notificationCollapseKey(NotificationKind.DUEL_STANDINGS, { duelId: 'd1' }),
      'duel-standings:d1',
    );
    assert.equal(
      notificationCollapseKey(NotificationKind.RAID_PHASE, { raidId: 'r1' }),
      'raid-phase:r1',
    );
    assert.equal(
      notificationCollapseKey(NotificationKind.LEAGUE_ENDING, { weekKey: '2026-01-05' }),
      'league-ending:2026-01-05',
    );
  });

  it('returns null when the id is missing or the kind never collapses', () => {
    assert.equal(notificationCollapseKey(NotificationKind.RAID_PHASE, {}), null);
    assert.equal(notificationCollapseKey(NotificationKind.DUEL_STANDINGS, { duelId: 5 }), null);
    assert.equal(notificationCollapseKey(NotificationKind.FRIEND_REQUEST, {}), null);
  });
});

describe('renderNotification', () => {
  const payloads: Record<NotificationKind, Record<string, unknown>> = {
    [NotificationKind.FRIEND_REQUEST]: {},
    [NotificationKind.FRIEND_ACCEPTED]: {},
    [NotificationKind.LEAGUE_PROMOTED]: { toArena: 'GOLD', rank: 2 },
    [NotificationKind.LEAGUE_DEMOTED]: { toArena: 'SILVER', rank: 9 },
    [NotificationKind.LEAGUE_ENDING]: { inDemotionZone: true },
    [NotificationKind.DUEL_INVITE]: {},
    [NotificationKind.DUEL_ACCEPTED]: {},
    [NotificationKind.DUEL_STANDINGS]: { leading: true, you: 420, them: 180, daysLeft: 3 },
    [NotificationKind.DUEL_RESULT]: { outcome: 'LOST', you: 340, them: 610 },
    [NotificationKind.STREAK_INVITE]: {},
    [NotificationKind.STREAK_STARTED]: {},
    [NotificationKind.STREAK_REMINDER]: { count: 5 },
    [NotificationKind.STREAK_FROZEN]: { count: 5 },
    [NotificationKind.STREAK_BROKEN]: {},
    [NotificationKind.RAID_SPAWNED]: { bossSlug: 'core-kraken' },
    [NotificationKind.RAID_PHASE]: { bossSlug: 'core-kraken', percent: 50 },
    [NotificationKind.RAID_DEFEATED]: { bossSlug: 'core-kraken' },
    [NotificationKind.RAID_ESCAPED]: { bossSlug: 'core-kraken' },
    [NotificationKind.SQUAD_INVITE]: { squadName: 'Beast Mode' },
    [NotificationKind.SQUAD_RAID_STARTED]: { squadName: 'Beast Mode', bossSlug: 'core-kraken' },
  };

  for (const kind of Object.values(NotificationKind)) {
    for (const locale of ['en', 'de']) {
      it(`renders non-empty ${kind} text without leftover placeholders (${locale})`, () => {
        const msg = renderNotification(kind, payloads[kind] ?? {}, 'fabi', locale);
        assert.ok(msg.title.length > 0, `${kind} ${locale} title`);
        assert.ok(msg.body.length > 0, `${kind} ${locale} body`);
        assert.doesNotMatch(msg.title + msg.body, /\{[a-z]+\}/i);
      });
    }
  }

  it('uses the @username for actors and a fallback when there is none', () => {
    const named = renderNotification(NotificationKind.FRIEND_REQUEST, {}, 'fabi', 'en');
    assert.match(named.body, /@fabi/);
    const anon = renderNotification(NotificationKind.FRIEND_REQUEST, {}, null, 'en');
    assert.match(anon.body, /Someone/);
    const anonDe = renderNotification(NotificationKind.FRIEND_REQUEST, {}, null, 'de');
    assert.match(anonDe.body, /Jemand/);
  });

  it('picks the duel/league variants from the payload', () => {
    const behind = renderNotification(
      NotificationKind.DUEL_STANDINGS,
      { leading: false, you: 1, them: 2, daysLeft: 3 },
      'fabi',
      'en',
    );
    assert.match(behind.body, /@fabi leads/);
    const demote = renderNotification(
      NotificationKind.LEAGUE_ENDING,
      { inDemotionZone: true },
      null,
      'en',
    );
    assert.match(demote.body, /demotion zone/);
    const tie = renderNotification(
      NotificationKind.DUEL_RESULT,
      { outcome: 'TIE', you: 5, them: 5 },
      'fabi',
      'en',
    );
    assert.match(tie.title, /tied/i);
  });
});
