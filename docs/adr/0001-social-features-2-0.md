# 0001. Social features 2.0: friends, leagues, duels and raids

- Status: Accepted, implemented
- Date: 2026-11-13
- Deciders: Tony Meissner

## Context and problem statement

2.0.0 adds the social layer to LukiFitti: friends, weekly competition and cooperative
battles, on web (PWA), iOS and Watch. The goals are retention through friendly competition
(Duolingo leagues, Apple Fitness duels) and a cooperative showpiece (raid bosses), without
turning the workout flow itself into a noisy game. The privacy consequences of contact
matching and UGC are handled in ADR 0002.

## Decision drivers

- Fair competition across strength levels: a beginner must be able to beat an athlete.
- A small user base at launch: league mechanics have to work with 5 or 5,000 users.
- Privacy by default: profiles are friends-only; leagues reveal the minimum.
- No free-text user content (squad chat was explicitly cut), which limits moderation scope.
- One codebase for web, iOS and Watch; shared business rules in `@luki-fitti/common` with a
  Swift mirror, fixture-tested for parity.

## Considered options

- **Points model:** raw volume (sets/kg) — rejected as unfair across levels; effort points
  relative to the user's own goal with a daily cap — chosen, Apple-style.
- **Friend discovery:** username only — too weak for onboarding; phone-number contacts —
  rejected, emails only instead; email contact sync hashed on the device — chosen.
- **Competition:** fixed global league from day one — empty leagues kill the feature;
  adaptive stages that grow with active users — chosen.
- **Raid boss art:** illustrated layers animated per platform — first plan; replaced by
  procedural low-poly 3D primitives rendered with three.js (web) and SceneKit (iOS) — chosen
  2026-11-14, because one recipe produces matching bosses on both platforms.
- **Tone:** calm throughout vs. Duolingo-loud celebrations — loud, but only in the social
  area; the workout flow itself stays calm (no pop-ups between sets).

## Decision outcome

**Social account.** Social features need an account (guests stay local). On by default:
after updating to 2.0 the user picks a `@handle` (3–20 chars `[a-z0-9_]`, unique,
reserved-word and profanity filters, changeable once per 30 days) and avatar; without a
handle the user is invisible. "Pause competing" hides the user from leagues and stops
social pushes; friends stay.

**Friends.** Mutual request → accept; blocking removes the friendship and hides both users
everywhere. Ways to add: `@handle` search, invite link (`/invite/<token>`, universal link),
QR code, email contact sync. Report user → admin moderation queue (App Review 1.2).
Contact sync: the client hashes normalised emails with SHA-256 on-device; the server
compares against `emailLookupHash` of users who opted into "Find me by email" (default on,
explained), discards non-matching hashes immediately, and rate-limits (2,000 hashes per
request, 5 syncs/day). No "your contact joined" notifications.

**Effort points (EP).** Server-computed on session sync into an idempotent ledger:
10 per working set, 2 per warm-up set, +25 per PR set (max 3), 2 per cardio/stretch minute,
+20 for finishing ≥10 min, +100 weekly goal (outside the cap). **Daily cap 600 EP**
(Europe/Berlin day). Anti-cheat: only `COMPLETED` sessions, imports and history edits earn
0, sessions must sync within 72 h, implausibly fast sets are dropped, under 5 min earns
nothing, edits can only lower EP. Formula shared in `@luki-fitti/common`
(`effort-points.util.ts`) with a Swift mirror; the server value is authoritative.

**Leagues.** League week Monday–Sunday Europe/Berlin; rollover job Monday 00:05. Seven
arenas (Bronze → Titan) assigned from day one. Three adaptive stages driven by weekly
active social users (admin-tunable thresholds, defaults 10 and 150): friends leaderboard
only → one global league (top 20 % promote, bottom 20 % demote) → arena cohorts of ~30
(top 7 up, bottom 5 down, adjacent arenas merge). Zero-EP users are not placed next week;
two inactive weeks cost one arena. Placement is lazy on first points, serialised with a
Postgres advisory lock.

**Battles.** 1v1 weekly duel (challenge a friend, 7 days from next midnight, EP score,
daily standings push, max 3 active, tie = both win). Friend streak (opt-in per pair, +1
when both hit their weekly goal in the same week, one freeze per 4 weeks, Sunday reminder).

**Raids.** Community boss every week: `maxHp = activeSocialUsers(4w) × 400`, min 2,000;
damage = EP with 2× on the boss's weak muscle groups; enrage phases at 75/50/25 %; trophies
for all participants, crown for top 3, "Final blow" for the killing hit; undefeated bosses
escape. Squad raids: 2–10 friends pick a boss and difficulty (`members × 300/450/600` HP).
`RaidHit` and HP decrement share one transaction with a row lock, so the final blow is
deterministic. Bosses are procedural low-poly 3D recipes (8 bosses, ≤40 parts each) in
`@luki-fitti/common`, rendered with three.js on web and SceneKit on iOS, with a checked-in
JSON fixture and parity specs on both platforms; reduced-motion and 2D fallbacks included.

**Push.** `PushDevice` registry (APNs token auth `.p8`, Web Push VAPID), sent through a new
`push` BullMQ queue processed by `apps/email-worker` (no new deployable). Per-category
toggles, max 3 social pushes/day, quiet hours 22:00–08:00, in-app notification inbox, dead
tokens deleted.

**Access control.** Deny by default: every social read resolves viewer → target relation
(self / friend / stranger / blocked) and returns only allowed fields; blocked users get
404; profiles are friends-only by default.

**Kill switches and rollout.** `AppSettings.socialEnabled`, `leaguesEnabled`,
`raidsEnabled`, `duelsEnabled`, stage mode and thresholds, `epDailyCap`, and a
`socialBetaUserIds` allowlist. Rollout: deploy dark → beta allowlist for one league week →
enable for all at 2.0.0.

### Consequences

Good: fair points relative to personal goals; leagues that work at any scale; one boss
recipe keeps web and iOS visually identical; no new deployable for push; every feature can
be switched off at runtime.

Bad: EP computation adds a sync-time ledger and a Swift formula to keep in parity; hashed
contact matching is pseudonymisation, not anonymisation (see ADR 0002); adaptive stages
make league behaviour depend on admin-tuned thresholds.

## Implementation notes

- Shipped as four stacked PRs (#101 foundation, #102 points+leagues, #103 battles, #104
  raids) merged via #100 into `release/2.0.0`.
- Nest modules: `social`, `push`, `points`, `league`, `battle`, `raid`, plus `admin`
  switches; the in-app inbox is named `notifications` because `activity` is the Apple
  Health import module.
- Migrations: `social_foundation`, `leagues`, `battles`, `raids`.
- Boss roster: `packages/common/src/raid/raid-bosses.ts` (+ `raid-bosses.json` fixture);
  three.js is lazy-loaded on the raid page only.
- Postponed to after 2.0.0 (former "PR 5"): TestFlight beta, final privacy policy after
  legal review, App Store privacy labels and review notes, marketing screenshots.

## Links

- ADR 0002 (privacy for social features)
- `PRODUCT.md` (tone boundary: social may celebrate, workouts stay calm)
