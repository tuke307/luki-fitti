# PR 2 — Effort points, friends leaderboard, leagues (implementation spec)

Part of [social-2.0.md](social-2.0.md). Branch `feat/social-2-leagues`, stacked on
`feat/social-1-foundation`. Parts: **A backend**, **B web**, **C iOS + Watch**. Tick items as
they land.

## Progress

- [ ] A — DB, common formula + fixtures, `points` and `league` modules, rollover scheduler
- [ ] B — Web: weekly EP card, end-of-workout EP, friends leaderboard, league screen,
      promotion/demotion celebration, admin league settings
- [ ] C — iOS: same screens, Swift EP mirror (fixture tests), Watch: weekly EP + arena + rank
- [ ] PR opened

## Time model

- League week = Monday 00:00 → Sunday 24:00 **Europe/Berlin**. `weekKey` = that Monday as
  `YYYY-MM-DD`; `dayKey` = Berlin calendar date `YYYY-MM-DD` of the session's `completedAt`.
- Helpers in `@luki-fitti/common` (`league-time.util.ts`): `berlinDayKey(date)`,
  `berlinWeekKey(date)`, `weekBounds(weekKey) → { start, end }` (UTC instants, DST-safe via
  `Intl.DateTimeFormat`, no new date library), `previousWeekKey`, `nextWeekKey`. Specs must
  cover both DST switches.

## Effort point formula (`packages/common/src/utils/effort-points.util.ts`)

`computeSessionEffortPoints(session) → { total, breakdown }`, pure, input is the session DTO
shape (status, sessionType, sourceDevice, activeDurationSeconds, totalStretchSeconds,
completedAt, exercises[].exerciseTypeSnapshot, exercises[].sets[] with setType, completed,
completedAt, isPersonalRecord, durationSeconds).

| Rule                                                                       | Points                                |
| :------------------------------------------------------------------------- | :------------------------------------ |
| Not `COMPLETED`, `sourceDevice = IMPORT`, or `activeDurationSeconds < 300` | 0 total                               |
| Completed `WORKING` / `DROPSET` set of a `STRENGTH` exercise               | 10                                    |
| Completed `WARMUP` set                                                     | 2                                     |
| Completed set with `isPersonalRecord`                                      | +25, max 3 per session                |
| `CARDIO` exercise: completed set `durationSeconds`                         | 2 per full minute                     |
| `STRETCHING` session or exercise: stretch seconds                          | 2 per full minute, max 60 per session |
| Session finished with `activeDurationSeconds ≥ 600`                        | +20                                   |

Plausibility: at most `floor(activeDurationSeconds / 15)` sets count. Sets with a
`completedAt` less than 15 s after the previous counted set are ignored. Sets beyond the limit
are dropped in order. `breakdown` = `{ sets, warmups, prs, cardioMinutes, stretchMinutes,
finishBonus, droppedSets }`.

Shared fixture `packages/common/src/utils/__fixtures__/effort-points-cases.json` (≥ 12 cases:
each rule, cap of PRs, plausibility drop, import, too short, stretching cap). Used by the TS
spec now and by the Swift mirror in part C.

## Prisma (one migration `leagues`)

```prisma
enum Arena { BRONZE SILVER GOLD PLATINUM DIAMOND OBSIDIAN TITAN }
enum LeagueStage { FRIENDS GLOBAL ARENAS }
enum LeagueStageMode { AUTO FRIENDS GLOBAL ARENAS }
enum LeagueOutcome { PROMOTED STAYED DEMOTED }
// NotificationKind additions: LEAGUE_PROMOTED LEAGUE_DEMOTED LEAGUE_ENDING

// User additions
arena                Arena @default(BRONZE)
leagueInactiveWeeks  Int   @default(0)

// UserPreferences addition
pushLeagues Boolean @default(true)

// AppSettings additions
leaguesEnabled        Boolean         @default(true)
leagueStageMode       LeagueStageMode @default(AUTO)
leagueStage2MinUsers  Int             @default(10)
leagueStage3MinUsers  Int             @default(150)
leagueCohortSize      Int             @default(30)
epDailyCap            Int             @default(600)
epWeeklyGoalBonus     Int             @default(100)

model EffortPointEntry { id, userId, sessionId @unique, weekKey, dayKey, points Int,
                         firstPoints Int, breakdown Json, createdAt, updatedAt;
                         @@index([userId, weekKey]) }   // session FK onDelete: Cascade
model WeeklyScore      { id, userId, weekKey, points Int, rawPoints Int, sessions Int,
                         goalBonus Int, updatedAt; @@unique([userId, weekKey]);
                         @@index([weekKey, points]) }
model LeagueWeek       { weekKey @id, stage LeagueStage, activeUsers Int,
                         buckets Json /* Arena → bucket index, ARENAS only */,
                         closedAt DateTime?, createdAt }
model LeagueCohort     { id, weekKey, bucket Int?, createdAt; @@index([weekKey, bucket]) }
model LeagueMembership { id, cohortId, userId, weekKey, arenaAtStart Arena, finalPoints Int?,
                         finalRank Int?, outcome LeagueOutcome?, resultSeenAt DateTime?,
                         joinedAt; @@unique([userId, weekKey]); @@index([cohortId]) }
```

## Points pipeline (`apps/api/src/modules/points/`)

- Hook in `SessionService.syncSession` after the transaction, for **every** sync of a
  `COMPLETED` session (not only `justCompleted`), plus `deleteSession`:
  `PointsService.recordSession(userId, sessionId)` / `removeSession`. Errors are logged, never
  break the sync.
- Only when `SocialAccessService.isEnabledFor(userId)` and `leaguesEnabled`.
- Live window: a session earns points only if it is synced within 72 h of `completedAt`,
  `completedAt ≤ now + 5 min`, and its `weekKey` is the current or the previous week while the
  previous week is not closed yet. Otherwise there's no entry, or the existing entry is kept.
- First entry: `points = firstPoints = total`. Later recomputes:
  `points = min(firstPoints, newTotal)` (edits can only lower).
- After every change, recompute that week's `WeeklyScore` from the ledger:
  `sum over dayKey of min(epDailyCap, Σ day points)` + `goalBonus` (`epWeeklyGoalBonus` when the
  number of entries with points > 0 ≥ the user's `weeklyGoalSessions`). `rawPoints` = uncapped
  sum.
- When the weekly score goes from 0 to > 0 and the week's stage ≥ GLOBAL, the user is placed
  into a cohort (lazy placement, below).
- `GET /points/week?weekKey=` → `{ weekKey, points, rawPoints, dailyCap, days: [{ dayKey,
points, capped }], sessions: [{ sessionId, workoutName, points, breakdown }], goal: { target,
done, bonus } }`. Own data only.
- `POST /points/preview` is **not** needed: clients compute the optimistic value with the
  shared formula.

## Leagues (`apps/api/src/modules/league/`)

**Stage of a week** is decided when its `LeagueWeek` row is created (by the rollover or lazily
on first access): `AUTO` → `activeUsers` = distinct eligible users with `WeeklyScore.points > 0`
in the previous week. Below `leagueStage2MinUsers` → FRIENDS, below `leagueStage3MinUsers` →
GLOBAL, otherwise ARENAS. A non-AUTO mode forces the stage. Eligible = social enabled for the
user, has a handle, not `socialPaused`.

**Lazy placement** (first points of the week, eligible users only):

- GLOBAL: one cohort per week (`bucket = null`).
- ARENAS: bucket of the user's arena from `LeagueWeek.buckets`. Buckets are computed at week
  creation by walking arenas bottom-up and merging adjacent arenas until a bucket has ≥ 10
  users active last week. Join the bucket's newest cohort with fewer than `leagueCohortSize`
  members, otherwise create one. Serialise with a Postgres advisory lock per
  `(weekKey, bucket)` so concurrent syncs don't overfill.
- `arenaAtStart` = the user's arena at placement.

**Rollover** (BullMQ job scheduler on a new `league` queue, cron `5 0 * * 1`, tz
`Europe/Berlin`, processed in `apps/email-worker`; idempotent per `weekKey`; safe to re-run):

1. Close the previous week if `closedAt` is null. For each cohort, rank by `WeeklyScore.points`
   desc (tie: earlier `WeeklyScore.updatedAt` wins) and write `finalPoints`, `finalRank` and
   `outcome`:
   - GLOBAL: cohort size n ≥ 5 → top `ceil(0.2n)` PROMOTED, bottom `floor(0.2n)` DEMOTED.
   - ARENAS: top `max(1, round(7n/30))` PROMOTED, bottom `round(5n/30)` DEMOTED (n ≥ 5).
   - BRONZE never demotes; TITAN never promotes (→ STAYED). Apply the arena change to `User.arena`.
   - FRIENDS: no cohorts and no outcomes.
2. Inactivity: eligible users with no membership in the closed week (GLOBAL/ARENAS only) get
   `leagueInactiveWeeks += 1`; at 2, drop one arena (not below BRONZE) and reset to 0. Members
   reset to 0.
3. Create the new week's `LeagueWeek` (stage + buckets).
4. Notify PROMOTED/DEMOTED users (`LEAGUE_PROMOTED` / `LEAGUE_DEMOTED`, payload
   `{ weekKey, fromArena, toArena, rank }`, pref `pushLeagues`).

**Reminder** (second scheduler, cron `0 18 * * 0`, tz `Europe/Berlin`): in GLOBAL/ARENAS,
members within 2 ranks of the promotion line (outside it) or inside the demotion zone get
`LEAGUE_ENDING` (`{ placesToPromotion }` or `{ inDemotionZone: true }`). Max one per user per
week.

**Routes** (AuthGuard + SocialEnabledGuard; mutations + CsrfGuard):

| Route                                | Notes                                                                                                                                                                                                                                                                                                                   |
| :----------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /league/current`                | `{ weekKey, stage, endsAt, arena, cohort: null \| { members: [{ rank, card, points, isSelf, zone: 'PROMOTE' \| 'SAFE' \| 'DEMOTE' }], promoteCount, demoteCount }, pendingResult: null \| { weekKey, outcome, fromArena, toArena, rank, points } }` (pendingResult = latest closed membership with `resultSeenAt` null) |
| `POST /league/results/:weekKey/seen` | sets `resultSeenAt` (celebration shown once)                                                                                                                                                                                                                                                                            |
| `GET /league/friends?weekKey=`       | self + accepted friends (not blocked, has handle), weekly points, ranked; works in every stage                                                                                                                                                                                                                          |
| `GET /league/history`                | last 12 closed memberships: `{ weekKey, arena, rank, outcome, points }`                                                                                                                                                                                                                                                 |

Cards follow the PR 1 relation rules (cohort members who aren't friends get the stranger card;
blocked pairs are filtered out of each other's view, but still ranked).

`/auth/me` `social` gains `arena`.

**Admin**: `GET/PUT /admin/settings/leagues` (the AppSettings fields above), `GET
/admin/leagues/preview` (dry run: stage the next rollover would pick, active users, buckets,
outcomes for the open week; writes nothing).

`push-messages.ts`: EN/DE texts for the three new kinds, with arena names localised (Bronze/
Bronze, Silver/Silber, Gold/Gold, Platinum/Platin, Diamond/Diamant, Obsidian/Obsidian,
Titan/Titan).

## Tests

Formula fixtures. Week/day keys across DST. Daily cap + goal bonus recompute. Edits only lower.
Import/too-short/late sync earn 0. Delete removes points. Stage selection (AUTO thresholds and
forced modes). Bucket merging. Lazy placement fills cohorts to size and creates the next one.
Concurrent placement doesn't overfill. Rollover outcomes for n = 3, 5, 10, 30 in both stages.
Bronze/Titan edges. Inactivity drop after 2 weeks. Rollover idempotent when run twice. Reminder
selection. Seeded scenario 3 / 30 / 300 users → FRIENDS / GLOBAL / ARENAS.

## B — Web (after A and PR 1 part B)

Social tab sections: "This week" card (EP, daily bars with cap marker, goal bonus), friends
leaderboard, league (stage-aware: FRIENDS shows the friends board plus an "arenas unlock when
more people train" note), arena badge, history. End-of-workout summary shows "+N EP"
(optimistic, shared formula, replaced by the server value after sync). Promotion/demotion
celebration on `pendingResult` (framer-motion, respects reduced motion), then `seen`. Push
pref toggle "Leagues". Admin page for league settings + preview. EN/DE.

## C — iOS + Watch (after A and PR 1 part C)

Swift `EffortPoints` in `LukiFittiDomain` with `LukiFittiDomainTests` reading the shared
fixture. Same screens as web in `Features/Social/`. End-of-workout EP card. Celebration
sheet. Watch: weekly EP, arena and rank in the existing WatchConnectivity payload (keep it
small).
