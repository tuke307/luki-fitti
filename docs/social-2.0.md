# LukiFitti 2.0.0: Social, leagues and raids

Living plan for the 2.0.0 release. **Every agent session on this work reads this file first and
updates [Status](#status) and the [Session log](#session-log) before it ends.** Decisions that
change the plan go into the [Decision log](#decision-log), not into chat.

- Branch / worktree: `feat/social-2.0` in `../luki-fitti-wt/social-2.0`, based on `develop`
  (#88 merged). Stacked PRs are merged into `feat/social-2.0`, which lands via #100.
- Release: the features ship as **2.0.0**. The version bump is its own PR (#105, into
  `develop`); its marketing screenshots for `2.0` are added there later (see `docs/release.md`).

---

## Status

Legend: `[ ]` open · `[~]` in progress · `[x]` done. Keep the PR column current.

| #   | Pull request                                         | Branch                     | PR   | State                                              |
| :-- | :--------------------------------------------------- | :------------------------- | :--- | :------------------------------------------------- |
| 0   | Plan (this document)                                 | `feat/social-2.0`          | #100 | open, collects PRs 1–4                             |
| 1   | Social foundation: profiles, friends, contacts, push | `feat/social-1-foundation` | #101 | merged ([spec](social-2.0-pr1.md))                 |
| 2   | Effort points, friends leaderboard, leagues          | `feat/social-2-leagues`    | #102 | merged ([spec](social-2.0-pr2.md))                 |
| 3   | Battles: 1v1 duel and friend streak                  | `feat/social-3-battles`    | #103 | ready for review ([spec](social-2.0-pr3.md))       |
| 4   | Raids: community raid boss and squad raids           | `feat/social-4-raids`      | #104 | draft: iOS boss parity ([spec](social-2.0-pr4.md)) |
| —   | Version bump 2.0.0 (screenshots later)               | `chore/version-2.0.0`      | #105 | draft, separate PR into `develop`                  |

Each PR branches from the previous one (stacked) and is merged into `feat/social-2.0`, which
lands in `develop` through #100. The social work is exactly four implementation PRs. The
version bump is a separate PR (#105); the former PR 5 (beta, legal, store listing, release) is
postponed and ships later together with the next feature (see [Later](#later-postponed-pr-5)).

### Open questions (answer before the PR that needs it)

- [x] **PR 4:** Boss art: minimalist 3D, bold cartoon, procedural primitives rendered with
      three.js / SceneKit (decided 2026-11-14, see `social-2.0-pr4.md`).
- [ ] **PR 1:** Legal review of contact matching and the privacy policy text (German law, GDPR
      Art. 6(1)(f) legitimate interest vs. consent). Do we need a DPIA?
- [ ] **PR 1:** APNs `.p8` key and VAPID key pair: who creates them, stored in Coolify env and
      GitHub secrets (`APNS_*`, `VAPID_*`).
- [ ] **PR 2:** League stage thresholds (defaults below: stage 2 at 10, stage 3 at 150 weekly
      active social users). Fine?
- [ ] Ghost Duel: parked for 2.1 (see [Backlog](#backlog)). Confirm.

---

## Decisions (settled with the user, 2026-11-13)

| Topic            | Decision                                                                               |
| :--------------- | :------------------------------------------------------------------------------------- |
| Points           | Effort points, capped per day (Apple-style), fair across strength levels               |
| Friend discovery | Contact sync (email only, hashed on device), invite link, QR code, `@handle` search    |
| Contact hashes   | Unmatched hashes are discarded immediately, never stored                               |
| Push             | APNs (iPhone, Watch mirrors iPhone) and Web Push (PWA)                                 |
| Tone             | Duolingo-loud: on by default for accounts, celebratory animations, promotion drama     |
| Cold start       | Adaptive league stages switched automatically by active users, admin override          |
| Battles in 2.0   | Community raid boss, squad raids, 1v1 weekly duel, friend streak                       |
| Raid boss        | Must look really good: animated, illustrated bosses (see visuals)                      |
| Privacy          | Friends-only by default; leagues show handle, avatar and points only                   |
| Platforms        | Full UI on iPhone and web; Apple Watch shows rank, weekly points, duel and raid status |
| Scope            | Everything in 2.0.0                                                                    |

Consequence of "Duolingo-loud": `PRODUCT.md` lists "achievement spam" as an anti-reference.
PR 1 updates `PRODUCT.md` so the social area may celebrate (promotion, raid kill, duel win) while
the workout flow itself stays calm (one thing at a time, no pop-ups between sets).

---

## Research summary

| Product       | What we take                                                                                                                                                                        |
| :------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duolingo      | Weekly leagues with tiers, cohorts of ~30, top ranks promote and bottom ranks demote; friend streaks; friend quests (co-op); nudges; "find friends" via contacts; loud celebrations |
| Apple Fitness | 7-day 1v1 competitions; points as % of your own goal with a daily cap (600/day) so beginners can beat athletes                                                                      |
| Strava        | Kudos, clubs, challenges; private profiles with follow approval                                                                                                                     |
| Gaming raids  | Shared boss HP, weak points, enrage phases, damage leaderboard, "final blow"                                                                                                        |

---

## Concepts

### Social account

- Social features need an account (guests stay local-only; the social tab shows a sign-up CTA).
- On by default for accounts: after updating to 2.0 the user gets an onboarding sheet to pick a
  `@handle` and avatar. Until a handle is chosen, the user is not visible to anyone.
- "Pause competing" in settings hides the user from leagues and stops social pushes; friends stay.
- `@handle`: 3–20 chars, `[a-z0-9_]`, case-insensitive unique, reserved list (admin, support,
  lukifitti, …), profanity filter, change at most once per 30 days.

### Friends

- Mutual friendship: request → accept. Blocking removes the friendship and hides both users from
  each other everywhere (search, leagues, raids, contact matches).
- Ways to add: `@handle` search, invite link (`/invite/<token>`, universal link on iOS), QR code
  (same link), contact sync.
- Report user (handle, avatar, display name) → admin moderation queue. Required by App Review
  guideline 1.2 for user-generated content.

### Contact sync (email only)

1. The client reads contacts (iOS `CNContactStore`; web: Contact Picker API where available,
   otherwise only invite link/QR), normalises emails (trim, lowercase) and sends
   `SHA-256(email)` hex values. Max 2,000 hashes per request, 5 syncs per user per day.
2. Every user has `emailLookupHash = SHA-256(normalised email)` stored and indexed.
3. The server returns only users who **opted into "Find me by email"** (default on in the
   onboarding sheet, explained in plain words), are not blocked, and have a handle.
4. Non-matching hashes are dropped after the request: never persisted, never logged.
5. No "your contact just joined" notifications (would require storing non-user hashes).

Plain SHA-256 of an email is reversible for known addresses; that is acceptable only because
the server already knows every user's email and discards non-matches. This must be stated in
the privacy policy. Rate limits prevent account enumeration.

### Effort points (EP)

Computed on the server when a completed session syncs, written to an idempotent ledger (one row
per session and kind, recomputed when a session is edited).

| Source                                      | Points                  |
| :------------------------------------------ | :---------------------- |
| Completed working set (strength)            | 10                      |
| Completed warm-up set                       | 2                       |
| Completed set that is a personal record     | +25 (max 3 per session) |
| Cardio / timed exercise, per active minute  | 2                       |
| Stretching session, per minute (max 30 min) | 2                       |
| Finished session (≥ 10 min active)          | 20                      |
| Weekly goal reached (`weeklyGoalSessions`)  | 100, once per week      |

- **Daily cap: 600 EP per day** (Europe/Berlin day). Weekly goal bonus is outside the cap.
- Weekly goal makes it relative to the user's own plan, like Apple's "% of your goal".
- **Anti-cheat:** only `COMPLETED` sessions; sessions created by import or added in the history
  editor earn 0 EP; sessions must be synced within 72 h of `completedAt`; sets are ignored when
  they are implausibly fast (more than one completed set per 15 s); sessions under 5 min active
  earn nothing. Editing a session can lower its EP, never raise it beyond the first computation.
- Shared formula lives in `@luki-fitti/common` (`effort-points.util.ts`) with a Swift mirror in
  `LukiFittiDomain` for the optimistic "+120 EP" shown at the end of a workout; the server value
  is authoritative.

### League week

Monday 00:00 to Sunday 23:59 **Europe/Berlin** for everyone (single region user base, one
rollover job). Rollover job runs Monday 00:05 via BullMQ repeatable job.

### Leagues and arenas (adaptive stages)

Seven arenas: **Bronze, Silver, Gold, Platinum, Diamond, Obsidian, Titan**. Every social user has
an arena from day one (starts in Bronze), so stage switches are seamless.

| Stage           | Trigger (weekly active social users, admin-configurable) | What users see                                                                                                                  |
| :-------------- | :------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------ |
| 1 Friends       | < 10                                                     | Friends leaderboard (weekly EP), raids, duels. Arena badge shown but no promotion yet                                           |
| 2 Global league | 10–149                                                   | One weekly league with everyone; top 20 % move up an arena, bottom 20 % down (min. cohort 5)                                    |
| 3 Arenas        | ≥ 150                                                    | Cohorts of ~30 per arena, matched by arena; top 7 promote, bottom 5 demote; adjacent arenas merge when a cohort would have < 10 |

- Stage is computed at rollover (`AppSettings.leagueStageMode = AUTO | FRIENDS | GLOBAL | ARENAS`).
- Users with 0 EP in a week are not placed in next week's cohort until they earn points again
  (no dead names in leagues); they keep their arena but drop one after 2 inactive weeks.
- Rollover push: "You were promoted to Gold", "Last day: you're 2 places from promotion".
- Friends leaderboard exists in every stage.

### Battles

**1v1 weekly duel** (Apple-style)

- Challenge a friend; starts the next Berlin midnight, runs 7 days; score = EP (daily cap applies).
- Daily push with the standings; winner gets a duel trophy; tie = both win. Max 3 active duels.

**Friend streak**

- Per friend pair, opt-in from the friend profile. +1 when both reach their weekly goal in the
  same league week. One streak freeze per pair earned every 4 weeks. Push on Sunday if one of
  the two is still missing sessions.

**Community raid boss** (one per week, everyone)

- A boss appears Monday. `maxHp = activeSocialUsers(last 4 weeks) × 400`, minimum 2,000, so the
  boss is beatable with 5 or 5,000 users.
- Damage = EP. Sets for the boss's **weak muscle groups** deal 2× damage (encourages balanced
  training).
- Phases at 75 / 50 / 25 % HP: boss "enrages" (new animation and colour), push to participants.
- Defeated by Sunday: every participant gets that boss's trophy; top 3 damage get a crown;
  the player whose damage brought HP to 0 gets "Final blow". Not defeated: boss escapes, no
  trophy, comes back later in the rotation.
- Raid page: big animated boss, HP bar, live damage feed ("@lukas hit for 120 with Squats"),
  your damage, top damage dealers, time left.

**Squad raids** (friends)

- A squad = 2–10 friends (creator invites). The squad picks a boss and difficulty (Normal,
  Hard, Heroic → `members × 300 / 450 / 600` HP), runs Monday–Sunday.
- Same mechanics as the community raid; squad chat is out of scope (no free-text UGC).

### Raid boss visuals

The boss is the showpiece of 2.0. Requirements:

- **Roster of 8 bosses** in `@luki-fitti/common` (`raid-bosses.ts`): slug, EN/DE name and
  lore line, weak muscle groups, colour palette. Examples: _Leg Day Titan_ (quads, glutes,
  hamstrings), _Iron Back Golem_ (back, lats), _Chest Hydra_ (chest, triceps), _Shoulder
  Wyvern_, _Core Kraken_, _Arm Cyclops_, _Mobility Phantom_ (stretching ×2), _Cardio Comet_.
- **Art:** layered illustrations (body, eyes, armour plates, aura/glow, cracks) exported as
  SVG for web and as vector PDF assets in the asset catalog for iOS. Layers allow animation
  without video files. Light and dark variants.
- **States:** idle (breathing, eye blink), hit (shake + flash + floating damage numbers),
  enraged (palette shift, aura grows, cracks appear per phase), defeated (shatter into
  particles + trophy reveal), escaped (fades away).
- **Web:** `framer-motion` (already a dependency) for layer animation, CSS filters for glow,
  canvas particles for the defeat shatter.
- **iOS:** SwiftUI `KeyframeAnimator`/`PhaseAnimator`, `Canvas` + `TimelineView` particles,
  `sensoryFeedback` on hits. Home screen widget with boss + HP bar.
- **Watch:** static boss art with an HP ring, haptic when the raid enters a new phase.
- Respect Reduce Motion (cross-fade states, no shake) and Reduce Transparency; VoiceOver label
  "Leg Day Titan, 38 % health left, 2 days remaining".
- Design review with `impeccable` / `apple-design-skill` before merging PR 4.

### Push notifications

- `PushDevice` registry: APNs device token (iOS; Watch gets iPhone-forwarded notifications) and
  Web Push subscriptions (PWA; on iOS Safari only when installed to the home screen).
- Sending: new BullMQ queue `push`, processed by the existing `apps/email-worker` (second
  processor; no new deployable). APNs via HTTP/2 token auth (`.p8`), Web Push via VAPID.
- Categories with per-user toggles: friend requests, duels, raids, leagues, streaks, nudges.
- Throttling: max 3 social pushes per user per day (league rollover and friend requests exempt),
  quiet hours 22:00–08:00 local time (client sends its time zone with the device).
- In-app activity inbox mirrors every push (works without push permission).
- Dead tokens (APNs 410, Web Push 404/410) are deleted.
- New dependencies (to vet with `dependency-vetting` in PR 1): `web-push`; APNs either via Node
  `http2` + `jose` (JWT ES256) or a maintained APNs client. Pin exact versions.

---

## Data model (Prisma, `packages/database`)

Additions to `User`: `handle String? @unique`, `handleChangedAt`, `avatarKey String?`,
`emailLookupHash String? @unique`, `discoverableByEmail Boolean @default(true)`,
`socialPaused Boolean @default(false)`, `arena Arena @default(BRONZE)`.

Additions to `UserPreferences`: push category toggles, `timeZone String?`.

Additions to `AppSettings`: `socialEnabled`, `leaguesEnabled`, `raidsEnabled`, `duelsEnabled`
(kill switches), `leagueStageMode`, `leagueStage2MinUsers` (10), `leagueStage3MinUsers` (150),
`leagueCohortSize` (30), `epDailyCap` (600), `socialBetaUserIds String[]` (beta allowlist; empty
= everyone).

New models:

| Model                  | Purpose                                                                                                                                                          |
| :--------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Friendship`           | `userAId < userBId`, `status PENDING/ACCEPTED`, `requestedById`, timestamps                                                                                      |
| `FriendInvite`         | `tokenHash` (SHA-256 of random token), `createdById`, `expiresAt`, `maxUses`, `uses`                                                                             |
| `UserBlock`            | `blockerId`, `blockedId`                                                                                                                                         |
| `UserReport`           | `reporterId`, `reportedId`, `reason`, `status`, admin notes                                                                                                      |
| `PushDevice`           | `userId`, `platform APNS/WEBPUSH`, `token`/`endpoint`, `p256dh`, `auth`, `locale`, `timeZone`, `lastSeenAt`                                                      |
| `Notification`         | In-app inbox: `userId`, `kind`, `actorId`, `payload Json`, `readAt` (the existing `activity` module is Apple Health import)                                      |
| `EffortPointEntry`     | Ledger: `userId`, `sessionId?`, `kind`, `points`, `dayKey`, `weekKey`; unique `(sessionId, kind)`                                                                |
| `WeeklyScore`          | `userId`, `weekKey`, `points`, `rawPoints` (pre-cap); unique `(userId, weekKey)`                                                                                 |
| `LeagueCohort`         | `weekKey`, `stage`, `arena?`                                                                                                                                     |
| `LeagueMembership`     | `cohortId`, `userId`, `finalRank?`, `outcome PROMOTED/STAYED/DEMOTED?`                                                                                           |
| `Duel`                 | `challengerId`, `opponentId`, `status`, `startsAt`, `endsAt`, `winnerId?`                                                                                        |
| `FriendStreak`         | `friendshipId`, `count`, `lastWeekKey`, `freezes`                                                                                                                |
| `Squad`, `SquadMember` | Squad of 2–10 friends                                                                                                                                            |
| `Raid`                 | `kind COMMUNITY/SQUAD`, `squadId?`, `bossSlug`, `difficulty?`, `weekKey`, `maxHp`, `damage`, `status ACTIVE/DEFEATED/ESCAPED`, `defeatedAt?`, `finalBlowUserId?` |
| `RaidHit`              | `raidId`, `userId`, `sessionId`, `damage`, `topExercise` (for the feed)                                                                                          |
| `Trophy`               | `userId`, `kind` (raid boss, duel win, arena), `refId`, `tier` (crown, final blow)                                                                               |

Raid HP is decremented in the same transaction that writes `RaidHit`, with a row lock on `Raid`
so the "final blow" is deterministic.

---

## API (`apps/api/src/modules/`)

New Nest modules, all routes authenticated, zod schemas in `@luki-fitti/common`:

- `social` — `GET/PATCH /social/profile`, `POST /social/avatar`, `GET /social/users/:handle`,
  `GET /social/search?handle=`, friends (`/social/friends`, requests, accept, decline, remove),
  invites (`POST /social/invites`, `POST /social/invites/:token/accept`), `POST /social/contacts/match`,
  blocks, reports.
- `push` — `POST/DELETE /push/devices`, `GET /push/vapid-public-key`, `GET/PATCH /push/preferences`,
  `GET /notifications`, `POST /notifications/read`.
- `points` — `GET /points/week`, `GET /points/history`; listener on session completion
  (inside `SessionService` sync path) that enqueues EP computation.
- `league` — `GET /league/current`, `GET /league/friends`, `GET /league/history`; rollover job.
- `battle` — duels (`/duels` CRUD + accept/decline), streaks (`/streaks`).
- `raid` — `GET /raids/current`, `GET /raids/:id`, `GET /raids/:id/feed`, squads
  (`/squads` CRUD + invite/leave), `POST /squads/:id/raids`.
- `admin` additions — social kill switches and stage settings, report moderation queue,
  raid rotation preview, manual rollover dry-run.

**Access control (deny by default):** every social read resolves the viewer → target relation
(self, friend, stranger, blocked) and returns only fields allowed for that relation. Strangers
see handle, avatar, arena; blocked users get 404. Profile visibility is friends-only by default.

---

## Clients

**Web (`apps/web`)** — new "Social" tab in `pwa-shell.tsx` (league, friends, raids, duels,
inbox); onboarding sheet; profile editor; QR via existing deps or a vetted QR lib; Web Push
subscription in `public/sw.js` (`push` and `notificationclick` handlers); offline: show cached
league/raid state from IndexedDB, pending "+EP" shown until the session syncs; EN/DE strings.

**iOS (`apps/apple/LukiFittiIOS`)** — new `Features/Social/` (League, Friends, Raid, Duel,
Inbox, Onboarding); `aps-environment` entitlement; `registerForRemoteNotifications` and
extended `LukiNotificationCenterDelegate`; `NSContactsUsageDescription` (EN/DE) and contact
hashing; universal link for `/invite/<token>`; end-of-workout "+EP / raid damage" card; raid
widget in `LukiFittiWidgets`; models in `LukiFittiKit` (`LukiFittiModels`, `LukiFittiStore`).

**Watch (`LukiFittiWatch`)** — light: weekly EP, arena + rank, active duel score, raid HP ring.
Data via the existing WatchConnectivity file transfer (small payload).

All new strings in EN and DE (`LukiStrings.swift` — grep for duplicate keys; web locales).

---

## Pull requests (four)

### PR 1 — Social foundation

DB migration (profile fields, friendship, invite, block, report, push device, activity,
AppSettings flags) · `social` and `push` modules · contact match · avatar upload (≤ 2 MB,
re-encode with `sharp`, strip EXIF, random storage key) · push queue + processors in the email
worker · web + iOS: onboarding, profile, friends, invite link/QR, contact sync, push permission,
inbox · admin: kill switches, report queue · `PRODUCT.md` tone update · privacy policy draft.
**Done when:** two accounts can find each other by handle, invite link and contact sync, become
friends, block/report, and receive a push on iPhone and PWA for a friend request.

### PR 2 — Effort points and leagues

EP formula (TS + Swift mirror, shared fixture tests) · ledger + weekly score on session sync ·
friends leaderboard · arenas, stage logic, cohort builder, Monday rollover job, promotion pushes
· web + iOS league screens with promotion/demotion celebration · Watch: EP + rank · admin stage
settings and rollover dry-run.
**Done when:** a seeded set of 3 / 30 / 300 users produces the correct stage and cohorts, and a
rollover promotes/demotes as specified (unit + integration tests).

### PR 3 — Battles

1v1 duel (challenge, accept, daily standings push, result, trophy) · friend streak (opt-in,
weekly evaluation in the rollover job, freezes, Sunday reminder) · trophies on the profile ·
web + iOS UI · Watch duel score.
**Done when:** a duel between two test users runs from challenge to trophy with correct capped
scores, and streaks survive/break correctly across simulated weeks.

### PR 4 — Raids

Boss roster + art assets · community raid (weekly spawn with scaled HP, damage from EP with weak
muscle multiplier, phases, final blow, trophies) · squad raids · raid page with full animation
set on web and iOS, widget, Watch HP ring · phase/defeat pushes · design review.
**Done when:** concurrent hits from multiple users produce exactly one final blow, phase pushes
fire once per phase, and the boss animations pass a design + reduced-motion review.

### Later (postponed PR 5)

Postponed by the user on 2026-11-15; it ships together with the next feature, not with PRs 1–4.
Beta (enable `socialBetaUserIds` for TestFlight testers, fix findings) · final privacy policy
(`docs/privacy-social.md` after legal review) and App Store privacy labels (contacts: "used for
app functionality, not linked/tracking" as applicable) · App Review notes (UGC:
report/block/filter) · release notes · release PR `develop` → `main`. The version bump lives in
#105; its marketing screenshots for 2.0 are added there before the release PR.

### Rollout

1. Deploy PRs 1–4 to production with `socialEnabled = false`.
2. Turn on for the beta allowlist (TestFlight + a few web users), run one full league week and
   one raid.
3. Release 2.0.0 with everything enabled; the stage logic starts in stage 1 and promotes itself
   as users join. Kill switches per feature stay available in the admin portal.

---

## Verification per PR

- `yarn workspace @luki-fitti/common build && yarn workspace @luki-fitti/database build`
  after schema/common changes
- `yarn lint`, `yarn test`, `yarn format:check`
- `swift test --package-path apps/apple/Packages/LukiFittiKit --filter LukiFittiDomainTests`
- iOS/Watch build per `AGENTS.md`
- Playwright e2e for touched web flows
- `security-review` skill on PRs 1 and 4 (auth, contacts, uploads, concurrency);
  `dependency-vetting` on any new package

---

## Backlog (after 2.0)

- **Ghost Duel (2.1 headline):** race a friend's (or your own past) workout live during a
  session, exercise by exercise, scored on effort relative to each person's e1RM, with a pace
  indicator, round wins ("4–2"), rematch push and a Watch "Round 3 · ahead by 1" view.
- Friend quests (co-op weekly goal for two), nudges / high-fives, kudos on finished workouts.
- Phone-number contact matching (needs SMS verification).
- Seasons with seasonal boss rosters.

---

## Decision log

| Date       | Decision                                                                                                                                                   |
| :--------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-13 | Scope, tone, privacy, platforms and battle formats as in [Decisions](#decisions-settled-with-the-user-2026-11-13)                                          |
| 2026-11-13 | Community raid boss included (user: "make the raid boss really cool looking"); Ghost Duel parked for 2.1 (pending confirmation)                            |
| 2026-11-13 | Max five implementation PRs, stacked, each targeting `develop` (superseded 2026-11-15)                                                                     |
| 2026-11-14 | Social replaces the Exercises tab on iPhone and web; the exercise library moves into Workouts as a "Library" segment                                       |
| 2026-11-14 | Raid bosses: minimalist 3D, bold cartoon, built from primitives (three.js on web, SceneKit on iOS), no model files                                         |
| 2026-11-14 | Order: finish PR 1 (web, iOS), then PR 2 web + iOS/Watch, then PRs 3 and 4                                                                                 |
| 2026-11-15 | PR 5 starts with the version bump only; marketing screenshots for 2.0 come later on the same PR (CI `marketing:check` stays red until then, by design)     |
| 2026-11-15 | PR 5 postponed until the next feature; the social work is four PRs. The 2.0.0 version bump is a separate PR into `develop` (#105), screenshots added later |

## Session log

Append one line per session: date, what was done, what is next.

| Date       | Done                                                                                                                                                                                                                                                                     | Next                                  |
| :--------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------ |
| 2026-11-13 | Research, decisions with the user, this plan, plan PR                                                                                                                                                                                                                    | Answer open questions, start PR 1     |
| 2026-11-13 | PR 1 part A: social_foundation migration, common social utils/schemas,                                                                                                                                                                                                   | PR 1 part B (web)                     |
|            | API social/push/notifications/admin modules, email-worker push processor                                                                                                                                                                                                 |                                       |
|            | + review fixes (push retry/SSRF/pooling, report evidence, deletion GC)                                                                                                                                                                                                   |                                       |
| 2026-11-13 | PR 2 part A: leagues migration, EP formula + fixtures, points/league                                                                                                                                                                                                     | PR 2 part B (web)                     |
|            | modules, session hooks, rollover + reminder schedulers in email-worker                                                                                                                                                                                                   |                                       |
| 2026-11-13 | PR 2 part A review fixes: chronological set ordering, mid-week                                                                                                                                                                                                           | PR 2 part B (web)                     |
|            | placement, bucket stranding, multi-week rollover close                                                                                                                                                                                                                   |                                       |
| 2026-11-13 | PR 1 part B: web social tab, onboarding, friends, invites +                                                                                                                                                                                                              | PR 1 part C (iOS)                     |
|            | AASA, web push + inbox, admin social/reports, EN/DE, e2e                                                                                                                                                                                                                 |                                       |
| 2026-11-13 | PR 1 part C: iOS Friends tab, onboarding/profile/inbox sheets,                                                                                                                                                                                                           | Security review, open PR              |
|            | APNs + invite universal links, contacts sync, Library segment                                                                                                                                                                                                            |                                       |
| 2026-11-14 | Boss art decided (minimalist 3D, bold cartoon, procedural primitives); PR 3 + PR 4 specs; PR 1 ready (#101); the shared local `lukifittidb` already has the social_foundation migration (from the PR 1 e2e run); later local tests use a separate `luki_fitti_social` DB | PR 2 parts B and C                    |
| 2026-11-13 | PR 2 part B: Social tab rename, this-week EP card, stage-aware league card,                                                                                                                                                                                              | PR 2 part C (iOS + Watch)             |
|            | celebrations, workout EP, Leagues push toggle, admin leagues page, e2e league case                                                                                                                                                                                       |                                       |
| 2026-11-13 | PR 2 part C: Swift EffortPoints mirror + fixture tests, Social tab leagues UI,                                                                                                                                                                                           | PR 2 review, open PR                  |
|            | celebration overlay, workout EP, push Leagues toggle, EN/DE, Watch social row                                                                                                                                                                                            |                                       |
| 2026-11-13 | PR 2 B+C review fixes: goal.available DTO, league-fetch error logging + decode tests,                                                                                                                                                                                    |                                       |
|            | celebration fullScreenCover + loud treatment (both platforms), web separator; watch                                                                                                                                                                                      |                                       |
|            | social:null traced to missing keychain tokens on the simulator install                                                                                                                                                                                                   |                                       |
| 2026-11-14 | PR 3 part A: battles migration, battle module (duels, streaks, trophies),                                                                                                                                                                                                | PR 3 part B (web)                     |
|            | points/social/league hooks, duels-tick + duels-standings schedulers, push prefs + copy                                                                                                                                                                                   |                                       |
| 2026-11-14 | PR 3 part B (web): duels card + per-day detail sheet, friend-menu challenge with limit/existing reasons,                                                                                                                                                                 | PR 3 part C (iOS + Watch)             |
|            | streak chips + invite/accept/end in friend rows, trophy shelves in profile + friend sheets, duel result celebration (WON/TIE/LOST + rematch), push toggles, /social/duels deep link, EN/DE, e2e                                                                          |                                       |
| 2026-11-14 | PR 3 part C (iOS + Watch): battle DTOs + API client + decoding tests from real responses,                                                                                                                                                                                | Open PR 3 for review                  |
|            | Duels section + detail sheet, friend-menu challenge/streak actions, trophy shelves,                                                                                                                                                                                      |                                       |
|            | duel celebration cover + Continue UI test, /social/duels deep link, Watch duel row, EN/DE                                                                                                                                                                                |                                       |
| 2026-11-15 | #101 + #102 merged; conflicts in #100/#102/#103 resolved by merge commits; CI runs for PRs into `feat/**`; version bump PR #105                                                                                                                                          | PR 4 iOS boss parity, then #104 ready |
