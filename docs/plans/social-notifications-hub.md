# Plan: mean notifications, per-type push settings and the social hub

Branch plan for 2.0.0. Lands on `release/2.0.0` as three PRs; delete this file before the PR
into `develop`.

## Decisions (from the audit, 2026-11-15)

- **Tone:** mean for everyone, one voice, no "nice mode". German and English, light swearing
  allowed. Applies to push and inbox text only; the workout flow stays calm.
- **Friend nudge:** no live presence ("Fabi is at the gym"). Instead a weekly comparison:
  "@fabi already did 2 workouts this week. You? 0." Fires when a friend pulls ahead.
- **Settings:** every notification type has its own toggle, grouped by category, identical on
  web and iOS.
- **Social tab:** hub plus detail pages; friend management moves behind a people icon.

## PR 1 — Notification plumbing (`feat/notification-settings`)

### Bugs from the audit

1. **Daily cap (ADR 0001, never built).** At most 3 social pushes per user per local day
   (device time zone, counted by delivery day after quiet-hours delay). Exempt: direct actions
   by a person (`FRIEND_REQUEST`, `FRIEND_ACCEPTED`, `DUEL_INVITE`, `STREAK_INVITE`,
   `SQUAD_INVITE`). Over the cap: inbox row only, no push job. Store the delivery day on the
   `Notification` row (`pushDayKey String?`) so the count is one indexed query.
2. **Web pushes overwrite each other.** `sw.js` uses one tag for everything. New rule: tag =
   `collapseKey` from the payload when set, else the notification id; `renotify: true`.
   Collapse keys: `duel-standings:<duelId>`, `raid-phase:<raidId>`, `league-ending:<weekKey>`.
3. **APNs:** add `thread-id` per category and `apns-collapse-id` = the same collapse key.
4. **Inbox only understands 2 of 20 kinds.** `GET /notifications?locale=en|de` returns
   server-rendered `title` and `body` per item, using the same renderer as push
   (`@luki-fitti/common/push-messages`). Web and iOS inboxes show those strings; the client
   switches on `kind` only for the icon. No Swift copy mirror needed.
5. **Inbox rows are tappable** and open `payload.url` through the existing deep-link routing
   (web `parseOpenParam`, iOS `SocialDeepLink`). Opening the inbox still marks all read.

### Per-type toggles

- Schema (`UserPreferences`): keep the five category booleans, add `pushNudges Boolean
@default(true)` and `pushDisabledKinds NotificationKind[] @default([])`.
- Effective rule: category on **and** kind not in `pushDisabledKinds`.
- Move the kind → category map (`KIND_PREF` in `notification.service.ts`) to
  `@luki-fitti/common` as `NOTIFICATION_CATEGORIES` (ordered categories, each with its ordered
  kinds); Swift mirror in `LukiFittiModels` with a parity fixture test like the boss recipes.
- DTO: `PushPreferencesDto` gains `nudges: boolean` and `disabledKinds: NotificationKind[]`;
  `UpdatePushPreferencesSchema` accepts both (kinds validated against the enum).
- UI, same structure and strings on both platforms:
  Settings → Notifications → one row per category (Friends, Nudges, Leagues, Duels, Streaks,
  Raids) with a master toggle; tapping the row opens the category page with one toggle per
  type. Type toggles are disabled while the category is off.
- iOS gains the missing Duels and Streaks categories.

### Tests

- `notification.service.spec`: cap counts per delivery day, exempt kinds bypass it, disabled
  kind skips the push but keeps the inbox row, category off wins over kind on.
- `push-sender.service.spec`: collapse key → APNs `apns-collapse-id` and `thread-id`.
- Inbox list renders `title`/`body` per locale for every kind (table test over the enum).
- Common: every `NotificationKind` appears in exactly one category (fails when a kind is added
  without a category).
- e2e (web): toggle a type off, reload, still off.

## PR 2 — Mean copy and the friend nudge (`feat/mean-notifications`)

### Copy rules

- 3–5 variants per kind and locale. The variant is picked deterministically from the
  notification id (stable hash), so push and inbox show the same line.
- Mock behaviour and laziness, never the person: no body, weight, food, looks, identity or
  health jokes; no slurs. Light swearing OK ("Arsch", "verdammt", "damn", "ass").
- Strangers are never named: league and raid copy has no actor. Only friends appear by
  `@username`.
- Celebrations may be mean too ("You won. Don't let it go to your head.").
- `PRODUCT.md` → "Notification voice" (updated with this plan) is the source of truth for the
  tone.
- App Store: the age-rating questionnaire needs "Infrequent/Mild Profanity or Crude Humor"
  (waiting on user).

### Draft lines (sign-off needed before PR 2)

| Kind                     | English                                                       | German                                                                         |
| ------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| FRIEND_PULLED_AHEAD      | @fabi already did 2 workouts this week. You? 0. Loser.        | @fabi hat diese Woche schon 2 Workouts. Du? 0. Lappen.                         |
| FRIEND_PULLED_AHEAD      | @fabi is pulling away. 3 to 1. Get your ass to the gym.       | @fabi zieht davon. 3 zu 1. Beweg deinen Arsch ins Gym.                         |
| STREAK_REMINDER          | Your 5-week streak with @anna dies tonight. Your call, champ. | Deine 5-Wochen-Streak mit @anna stirbt heute Nacht. Deine Entscheidung, Champ. |
| STREAK_BROKEN            | Streak with @anna: dead. Murder weapon: your couch.           | Streak mit @anna: tot. Tatwaffe: deine Couch.                                  |
| DUEL_STANDINGS (behind)  | @fabi leads 420–180. Embarrassing. 3 days to fix it.          | @fabi führt 420–180. Peinlich. Noch 3 Tage.                                    |
| DUEL_STANDINGS (leading) | You lead @fabi 420–180. Don't get comfy.                      | Du führst gegen @fabi 420–180. Werd bloß nicht bequem.                         |
| DUEL_RESULT (lost)       | @fabi beat you 610–340. Rematch, or are you scared?           | @fabi hat dich 610–340 abgezogen. Revanche oder Schiss?                        |
| DUEL_RESULT (won)        | You crushed @fabi 610–340. Go on, rub it in.                  | Du hast @fabi 610–340 zerlegt. Reib's ihm ruhig rein.                          |
| LEAGUE_ENDING (demotion) | Demotion zone. Tonight. Do something, damn it.                | Abstiegszone. Heute Nacht. Tu verdammt nochmal was.                            |
| LEAGUE_DEMOTED           | Back to Silver. Gold was clearly too much for you.            | Zurück nach Silber. Gold war wohl zu viel für dich.                            |
| LEAGUE_PROMOTED          | Gold. Rank 2. Fine, you're not useless.                       | Gold. Rang 2. Okay, du bist doch nicht nutzlos.                                |
| RAID_PHASE               | Gorgon is enraged at 50 %. Your squad is fighting. Are you?   | Gorgon rastet bei 50 % aus. Dein Squad kämpft. Du auch?                        |
| RAID_ESCAPED             | Gorgon escaped. Thanks for nothing.                           | Gorgon ist entkommen. Danke für nichts.                                        |
| FRIEND_REQUEST           | @fabi wants to be friends. Brave of them.                     | @fabi will mit dir befreundet sein. Mutig.                                     |
| DUEL_INVITE              | @fabi challenged you. Accept or admit you're scared.          | @fabi fordert dich heraus. Annehmen oder zugeben, dass du Schiss hast.         |

### New kind `FRIEND_PULLED_AHEAD` (category Nudges)

- Trigger: in `PointsService.recordSession`, after the session's ledger row is written.
  Actor A = the user who synced. "Workouts this week" = A's sessions in the current Berlin
  league week with points > 0 (server value, authoritative).
- For each friend F of A (social enabled, not paused, not blocked either way): notify F when
  this session made A's count go from `≤ F` to `> F` (pulled ahead), or widened A's lead to
  2+ for the first time this week.
- Skip F when F trained today or already reached the weekly goal.
- Limits: F gets at most 1 nudge per day in total, at most 2 per week from the same A.
  Counts towards the daily cap of 3.
- Payload: `{ count: A's workouts, you: F's workouts, url: '/social/friends' }`.
- Migration: add the enum value. Tests: crossing fires once, no second nudge the same day,
  paused/blocked/goal-reached friends skipped, per-pair weekly limit.

## PR 3 — Social hub (`feat/social-hub`)

### Hub (Social tab root, identical order on web and iOS)

1. Header: title, bell (unread badge), people icon (badge = incoming friend requests).
2. Username prompt while no username is set (unchanged).
3. **This week** hero: your workouts and EP this week vs goal, plus one "next move" line
   picked by priority: incoming invite (friend, duel, streak, squad) → friend ahead of you →
   duel behind → league demotion zone → raid active and you've dealt no damage.
4. **Friends this week** strip: avatars sorted by workouts this week with a count ("2×");
   tap opens the friend sheet, "See all" opens Friends.
5. Compact cards, one line of status each, tap opens the detail page:
   League (arena, rank, places to promotion) · Duels (best active score, or "Challenge
   someone") · Raids (boss, HP bar, your damage, squad raid count) · Streaks (active count,
   longest).
6. Trophies row (count + latest three) → trophy page.

### Detail pages

- **League:** today's full league card and leaderboard.
- **Duels:** incoming, active, sent, history; "Challenge" picks a friend.
- **Raids:** community raid, squad raids, squads management (today's `SquadsCard`).
  `RaidPage` per raid unchanged.
- **Friends** (people icon): requests on top, friends sorted by workouts this week, sent,
  add friends (search, invite, contacts), blocked (now on web too).
- **Friend sheet** takes over the per-friend actions (challenge, start/end streak, remove,
  block, report). Friend rows only show avatar, name, this-week count and streak count.

Navigation: iOS pushes detail pages on a `NavigationStack`; web keeps tab state and turns
`SocialSection` into a page with a back button (`league | duels | raids | friends |
trophies`). Deep links map 1:1 (`/social/requests` → Friends, scrolled to requests;
new `/social/league`). Celebration overlays stay on the hub.

### Integration elsewhere

- **Social tab badge** (web + iOS): actionable items only (incoming friend, duel, streak and
  squad invites). Unread inbox count stays on the bell.
- **Home card** (web + iOS): the same "next move" line plus duel score or league rank;
  hidden when social is off. Tapping opens the matching detail page.
- **History session detail:** "+N EP" line for sessions that earned points.

### Tests

- Unit: "next move" priority picker (shared in `@luki-fitti/common`, Swift mirror with parity
  fixture).
- e2e (web): hub renders, people icon opens Friends, deep link `/social/duels` opens Duels,
  tab badge shows an incoming request.
- iOS UI test: hub → Friends → friend sheet actions; existing social walkthrough updated.

## Open points

- Sign-off on the draft lines above.
- Age rating update in App Store Connect (profanity).
