# PR 3 — Battles: 1v1 weekly duel and friend streak (implementation spec)

Part of [social-2.0.md](social-2.0.md). Branch `feat/social-3-battles`, stacked on
`feat/social-2-leagues`. Parts: **A backend**, **B web**, **C iOS + Watch**.

## Progress

- [ ] A — DB, `battle` module (duels, streaks, trophies), schedulers, pushes
- [ ] B — Web: duel card + detail, challenge flow, streak rows, trophies, result celebration
- [ ] C — iOS: same; Watch: active duel score
- [ ] PR opened

## Prisma (one migration `battles`)

```prisma
enum DuelStatus { PENDING ACTIVE COMPLETED DECLINED CANCELLED EXPIRED }
enum FriendStreakStatus { PENDING ACTIVE }
enum TrophyKind { DUEL_WIN }               // PR 4 adds RAID_* kinds
// NotificationKind additions: DUEL_INVITE DUEL_ACCEPTED DUEL_STANDINGS DUEL_RESULT
//   STREAK_INVITE STREAK_STARTED STREAK_REMINDER STREAK_FROZEN STREAK_BROKEN

// UserPreferences additions
pushDuels   Boolean @default(true)
pushStreaks Boolean @default(true)

// AppSettings additions
duelsEnabled   Boolean @default(true)
streaksEnabled Boolean @default(true)

// WeeklyScore addition (set by PointsService.recomputeWeeklyScore)
goalReached Boolean @default(false)

model Duel {
  id, challengerId, opponentId, status DuelStatus @default(PENDING),
  createdAt, respondedAt?, startDayKey String?, endDayKey String? /* exclusive */,
  startsAt DateTime?, endsAt DateTime?,
  challengerPoints Int @default(0), opponentPoints Int @default(0),
  winnerId String?, isTie Boolean @default(false),
  challengerSeenAt DateTime?, opponentSeenAt DateTime?, lastStandingsDayKey String?
  @@index([challengerId, status]) @@index([opponentId, status]) @@index([status, endsAt])
}
model FriendStreak {
  id, friendshipId @unique (FK Friendship, onDelete: Cascade), status FriendStreakStatus,
  requestedById, count Int @default(0), longest Int @default(0),
  startedWeekKey String?, lastEvaluatedWeekKey String?,
  freezes Int @default(0), weeksSinceFreeze Int @default(0), lastReminderWeekKey String?,
  createdAt, updatedAt
}
model Trophy {
  id, userId, kind TrophyKind, refId String, tier String?, createdAt
  @@unique([userId, kind, refId]) @@index([userId, createdAt])
}
```

`goalReached` = number of entries with points > 0 ≥ the user's `weeklyGoalSessions`
(independent of `epWeeklyGoalBonus`).

## Duels

- **Challenge** `POST /duels { opponentId }`: accepted friends only (relation FRIEND), not self.
  At most 3 duels per user in PENDING + ACTIVE combined, and at most one PENDING/ACTIVE duel per
  pair. Notifies the opponent (`DUEL_INVITE`).
- **Accept** `POST /duels/:id/accept` (opponent only, PENDING, not expired, still friends):
  `startDayKey` = tomorrow's Berlin day, `endDayKey` = start + 7 days. `startsAt`/`endsAt` are
  the Berlin-midnight UTC instants of those days (`weekBounds`-style helper `berlinMidnight(dayKey)`
  exported from `league-time.util.ts`). Status ACTIVE. Notifies the challenger (`DUEL_ACCEPTED`).
- **Decline** (opponent, silent) → DECLINED. **Cancel** (challenger while PENDING) → CANCELLED.
- **Expire:** PENDING older than 48 h → EXPIRED (tick job), silent.
- **Score** = Σ over days in `[startDayKey, endDayKey)` of `min(epDailyCap, Σ that day's
EffortPointEntry.points)` for each side. No weekly goal bonus. Recomputed for the user's ACTIVE
  duels at the end of `PointsService.recordSession` / `removeSession` (best-effort) and again at
  completion.
- **Complete** (tick job, `endsAt ≤ now`): final recompute. Higher score wins, equal → `isTie`.
  The winner gets a `Trophy(DUEL_WIN, refId = duel.id)`; on a tie both do, unless both scores are
  0 (no trophy then). Notify both (`DUEL_RESULT`, payload `{ duelId, outcome: 'WON' | 'LOST' |
'TIE', you, them, opponentHandle }`).
- **Unfriend or block** during PENDING/ACTIVE → CANCELLED (in the same transaction as the
  friendship delete in `SocialService.removeFriend` / `createBlock`), silent.
- **Standings push** (daily 19:00 Berlin): one `DUEL_STANDINGS` per user per active duel per day
  (`lastStandingsDayKey` guards re-runs): "You lead @anna 340–280 · 3 days left" /
  "@anna leads 280–340". Skipped on the start day.
- **Routes** (AuthGuard + SocialEnabledGuard + `duelsEnabled`, mutations + CsrfGuard):
  - `GET /duels` → `{ active, incoming, outgoing, recent }` (recent = last 10 finished). Each
    item has the opponent card (PR 1 relation rules), both scores, `daysLeft` and `outcome` for
    finished ones.
  - `GET /duels/:id` → item + per-day points for both sides. Participants only, else 404.
  - `POST /duels`, `POST /duels/:id/accept|decline|cancel`, `POST /duels/:id/seen` (sets the
    caller's `*SeenAt`; `GET /duels` returns `pendingResult` = latest unseen finished duel).

## Friend streaks

- **Invite** `POST /streaks { friendId }` (FRIEND only, one streak per friendship) → PENDING,
  notify (`STREAK_INVITE`). **Accept** `POST /streaks/:id/accept` (the other side) → ACTIVE,
  `startedWeekKey` = current week, notify the requester (`STREAK_STARTED`). **End**
  `DELETE /streaks/:id` (either side, silent). `GET /streaks` → `{ active, incoming, outgoing }`
  with the friend card, `count`, `longest`, `freezes` and `thisWeek: { you: { done, target },
them: { done, target } }` (friends see each other's session counts; that's within the
  friends-only visibility rule).
- **Evaluate** in the Monday league rollover, after the weeks are closed (independent of league
  stage and `leaguesEnabled`, gated by `streaksEnabled`): for each ACTIVE streak and each closed
  week `W` with `startedWeekKey ≤ W` and `W > lastEvaluatedWeekKey`, oldest first:
  - both `goalReached` → `count + 1`, `longest = max`, `weeksSinceFreeze + 1`; at 4 →
    `freezes = min(freezes + 1, 2)` and `weeksSinceFreeze = 0`.
  - otherwise, if `freezes > 0` → `freezes - 1`, count kept, notify both (`STREAK_FROZEN`).
  - otherwise `count = 0`, `weeksSinceFreeze = 0`, notify both (`STREAK_BROKEN`, gentle copy:
    "Your streak with @anna starts fresh this week").
  - `lastEvaluatedWeekKey = W`.
- **Reminder** in the Sunday 18:00 job: for ACTIVE streaks with `count ≥ 1` where a partner has
  not reached their goal yet this week, push that partner (`STREAK_REMINDER`: "Train today to
  keep your 5-week streak with @anna"), at most once per streak per week
  (`lastReminderWeekKey`).

## Trophies

`GET /trophies/:userId` → `{ items: [{ kind, refId, tier, createdAt }], counts }` for SELF or
FRIEND only (else 404). PR 4 adds raid trophies to the same model.

## Schedulers (league queue, email-worker)

- `duels-tick`: cron `*/15 * * * *`, tz Europe/Berlin. Expire + complete.
- `duels-standings`: cron `0 19 * * *`, tz Europe/Berlin.
- Streak evaluation runs inside the existing rollover; streak reminders run inside the existing
  Sunday reminder job.

All jobs are idempotent (status guards, `*DayKey`/`*WeekKey` markers) and run in transactions
with an explicit timeout as in PR 2.

`push-messages.ts`: EN/DE for every new kind (warm tone, PRODUCT.md "never shame").

## Tests

Challenge rules: friends only, the max-3 limit, one per pair. Accept: day keys across DST.
Expire after 48 h. Scores: daily cap, entries outside the window ignored, `removeSession`
lowers the score. Completion: win, lose, tie, 0–0 tie without trophy. Trophy unique. Unfriend
or block cancels. Standings: once per day, not on the start day. Streaks: both reached,
freeze earned at 4 weeks and capped at 2, freeze consumed, break, multi-week catch-up after a
worker outage, `startedWeekKey` respected. Reminder once per week. Trophies visibility
(stranger → 404).

## B — Web (after A and PR 2 part B)

Social tab: a "Duels" section (active duel head-to-head bar per side, days left, tap for the
detail with daily bars), incoming invites with Accept/Decline, "Challenge" from a friend's row
menu. Friend rows show the streak count with a badge, an invite/accept action, and "this week
2/4 · 3/3". Profile/friend sheet shows the trophy shelf. Result celebration for `pendingResult`
(win: big, loud, framer-motion, sound off by default on web; loss: kind; tie: shared). Reduced
motion respected. Push pref toggles "Duels" and "Streaks". EN/DE.

## C — iOS + Watch (after A and PR 2 part C)

The same screens in `Features/Social/`, haptics on a win. Watch: the active duel score
("You 340 · Anna 280 · 3 d") in the existing payload.
