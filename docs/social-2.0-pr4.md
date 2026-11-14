# PR 4 — Raids: community raid boss and squad raids (implementation spec)

Part of [social-2.0.md](social-2.0.md). Branch `feat/social-4-raids`, stacked on
`feat/social-3-battles`. Parts: **A backend**, **B boss models + web**, **C iOS + widget +
Watch**.

## Progress

- [x] A — DB, `raid` + `squad` modules, damage pipeline, spawn/phase/escape, trophies, pushes
- [x] B — Boss recipes (common), web 3D renderer (three.js), raid page, squad UI, celebrations
- [x] C — iOS SceneKit renderer, raid page, squad UI, widget snapshot, Watch HP ring
- [ ] Design review (impeccable / apple-design-skill), reduced motion, VoiceOver
- [ ] PR opened

## Boss visuals: minimalist 3D, bold cartoon (decided 2026-11-14)

Bosses are **procedural low-poly 3D models built from primitives**, defined once as data and
rendered natively on each platform: three.js on the web, SceneKit on iOS. No model files.

**Recipe** (`packages/common/src/raid/raid-bosses.ts`, typed, no runtime deps):

```ts
type Shape = 'sphere' | 'capsule' | 'box' | 'roundedBox' | 'cone' | 'cylinder' | 'torus';
type Slot = 'primary' | 'secondary' | 'accent' | 'eyeWhite' | 'pupil' | 'dark';
type Role = 'body' | 'limb' | 'eye' | 'pupil' | 'horn' | 'armor' | 'crack' | 'aura' | 'detail';
interface BossPart {
  id: string;
  shape: Shape;
  size: [number, number, number]; // unit-less, body ≈ 1
  position: [number, number, number];
  rotation?: [number, number, number]; // degrees
  slot: Slot;
  role: Role;
  parent?: string; // hierarchy for limbs/eyes
  minPhase?: 0 | 1 | 2 | 3; // cracks/extra armour appear per enrage phase
}
interface RaidBoss {
  slug: string;
  name: { en: string; de: string };
  lore: { en: string; de: string };
  weakTo: WeakSpot[]; // MuscleGroup values | 'CARDIO' | 'STRETCHING'
  palette: Record<Slot, string>;
  enragedPalette: Partial<Record<Slot, string>>;
  parts: BossPart[]; // ≤ 40 parts, ≤ ~6k triangles rendered
  idle: { bob: number; sway: number; periodMs: number };
}
```

**Art direction:** chunky, rounded silhouettes; one dominant body shape; big expressive eyes
(white + pupil, the pupils track the pointer/tilt slightly); 2–3 flat colours per boss plus a
dark outline colour; toon shading (2–3 light bands) with a **thick black inverted-hull
outline** (a back-face duplicate scaled ~1.04 in `dark`); soft contact shadow under the boss;
no textures. Friendly-menacing, never gory. It must read at 120 pt.

**Roster (8):**

| slug               | Name EN / DE                           | Weak to                                    | Silhouette idea                                   |
| :----------------- | :------------------------------------- | :----------------------------------------- | :------------------------------------------------ |
| `leg-day-titan`    | Leg Day Titan / Beintag-Titan          | QUADRICEPS, GLUTES, HAMSTRINGS, CALVES     | squat block body on huge legs, tiny arms          |
| `iron-back-golem`  | Iron Back Golem / Eiserner Rückengolem | BACK (no LATS enum exists; BACK covers it) | hunched stone torso, armour plates on the back    |
| `chest-hydra`      | Chest Hydra / Brust-Hydra              | CHEST, TRICEPS                             | round chest-body with three neck heads            |
| `shoulder-wyvern`  | Shoulder Wyvern / Schulter-Wyvern      | SHOULDERS                                  | small body, oversized wing-shoulders              |
| `core-kraken`      | Core Kraken / Rumpf-Krake              | ABS_CORE, HIP_FLEXORS                      | round body, six tentacle torus arcs               |
| `arm-cyclops`      | Arm Cyclops / Arm-Zyklop               | BICEPS, TRICEPS, FOREARMS                  | one giant eye, massive arms                       |
| `mobility-phantom` | Mobility Phantom / Mobilitäts-Phantom  | STRETCHING                                 | floating ghost capsule, ribbon tail               |
| `cardio-comet`     | Cardio Comet / Cardio-Komet            | CARDIO                                     | sphere with cone flame trail, constantly spinning |

Implemented in `packages/common/src/raid/raid-bosses.ts` with the real `MuscleGroup` values above (no LATS or ABS enum exists — `BACK` and `ABS_CORE`/`HIP_FLEXORS` cover them), plus the `CARDIO`/`STRETCHING` weak spots.

**Animation states** (same parameters on both platforms, in the recipe module as constants):

- **Idle:** bob + sway on `periodMs`; blink every 3–5 s (eye scaleY → 0.1, 120 ms); pupils
  follow the pointer/device tilt slightly.
- **Hit:** a 250 ms squash-and-stretch wobble, a 120 ms white emissive flash, a floating
  "-120" damage number (2D overlay), and a light haptic on iOS. Fired for new feed hits while
  the page is open and on entering the page after own damage.
- **Enrage (phase 1/2/3 at 75/50/25 % HP):** palette lerps toward `enragedPalette` by phase,
  `minPhase` cracks appear, the aura (a transparent additive sphere) grows and pulses, and the
  idle gets faster.
- **Defeated:** parts detach and fly outward with gravity and spin for 1.2 s, then fade; the
  trophy card scales in with confetti (once, `seen`).
- **Escaped:** the boss shrinks and fades upward; calm copy.
- **Interaction:** drag to rotate around Y (spring back on release).
- **Reduced motion:** a static three-quarter pose; state changes cross-fade; no shake, no flying
  parts. **No WebGL / low power:** a static 2D fallback card in the boss palette with the
  name, HP bar and an SF-Symbol-like glyph.

**Web:** `three` (pin an exact version ≥ 7 days old, vet it; no `@react-three/*` unless needed),
lazy-loaded (`import()` inside a client component) only on the raid page and the raid card.
One renderer per visible boss, `devicePixelRatio` capped at 2, paused when off-screen
(IntersectionObserver) or the tab is hidden.

**iOS:** SceneKit (`SCNView` via `UIViewRepresentable`) built from the same recipe (ported as
a Swift struct with a fixture test comparing part counts/ids/slots against a JSON export of
the TS roster: `packages/common/src/raid/__fixtures__/raid-bosses.json`, generated by a script
and checked in CI by `catalog:check`-style comparison). Widget: the app renders an
`SCNView.snapshot()` of the current boss to the app group (`WidgetSnapshotWriter`) and the widget
shows that image + HP bar. Watch: boss name, palette glyph and an HP ring (no 3D).

## Damage

- Extend `computeSessionEffortPoints` input with `exercises[].primaryMuscleSnapshot` and the
  result with `pointsByWeakSpot: Record<string, number>`: set points + PR bonus attributed to
  the exercise's primary muscle; cardio minutes → `'CARDIO'`; stretch minutes → `'STRETCHING'`;
  finish bonus unattributed. Add fixture cases; the Swift mirror follows in part C.
- `damage(session, boss) = entry.points + Σ pointsByWeakSpot[w] for w in boss.weakTo`
  (weak spot = 2×). Capped per user per raid per Berlin day at `2 × epDailyCap`.
- Applied in `PointsService.recordSession` after the ledger write, for the user's community
  raid and every ACTIVE squad raid they're in, only for sessions completed inside the raid
  window. `RaidHit` is unique per `(raidId, sessionId)`; a re-sync can only lower it
  (`min`, like the ledger). `removeSession` deletes the hits and gives HP back unless the raid is
  already DEFEATED (defeat is final).
- Every hit runs in a transaction that locks the raid row (`SELECT … FOR UPDATE` via tagged
  `$queryRaw`), updates `damage`, and checks the thresholds: phase crossings (75/50/25 %) set
  `phase` and enqueue `RAID_PHASE` once per phase. Crossing 100 % sets DEFEATED, `defeatedAt`,
  and `finalBlowUserId` = this hitter, and enqueues defeat processing after commit.

## Prisma (one migration `raids`)

```prisma
enum RaidKind { COMMUNITY SQUAD }
enum RaidStatus { ACTIVE DEFEATED ESCAPED }
enum RaidDifficulty { NORMAL HARD HEROIC }
enum SquadRole { OWNER MEMBER }
// TrophyKind additions: RAID_DEFEATED RAID_CROWN RAID_FINAL_BLOW
// NotificationKind additions: RAID_SPAWNED RAID_PHASE RAID_DEFEATED RAID_ESCAPED
//   SQUAD_INVITE SQUAD_RAID_STARTED
// UserPreferences: pushRaids Boolean @default(true)
// AppSettings: raidsEnabled Boolean @default(true), raidHpPerActiveUser Int @default(400),
//   raidMinHp Int @default(2000)

model Raid { id, kind, squadId?, bossSlug, difficulty?, weekKey, startsAt, endsAt, maxHp Int,
  damage Int @default(0), phase Int @default(0), status @default(ACTIVE), defeatedAt?,
  finalBlowUserId?, createdAt; @@unique([kind, weekKey, squadId]) @@index([status, endsAt]) }
model RaidHit { id, raidId, userId, sessionId, damage Int, firstDamage Int,
  weakSpotDamage Int, topExercise String?, dayKey, createdAt, updatedAt;
  @@unique([raidId, sessionId]) @@index([raidId, createdAt]) @@index([raidId, userId]) }
model RaidParticipantSeen { raidId, userId, seenAt; @@id([raidId, userId]) }  // celebration once
model Squad { id, name, createdById, createdAt }
model SquadMember { squadId, userId, role, joinedAt; @@id([squadId, userId]) @@index([userId]) }
model SquadInvite { id, squadId, invitedId, invitedById, createdAt;
  @@unique([squadId, invitedId]) }
```

The community raid uses `squadId = null`. Postgres treats NULLs as distinct in a unique index,
so add a partial unique index in the migration SQL:
`CREATE UNIQUE INDEX "Raid_community_week" ON "Raid"("weekKey") WHERE "kind" = 'COMMUNITY'`.

## Lifecycle (league queue, email-worker)

- **Spawn** (inside the Monday rollover, after leagues and streaks): close last week's ACTIVE
  raids → ESCAPED (notify participants `RAID_ESCAPED`). Then create this week's community raid:
  boss = roster[(weeks since 2026-01-05) mod 8]; `maxHp = max(raidMinHp, eligibleActiveUsers4w
× raidHpPerActiveUser)` where eligibleActiveUsers4w = eligible users with `WeeklyScore.points
  > 0`in any of the last 4 closed weeks. Notify those users`RAID_SPAWNED`. Also lazily on
first `GET /raids/current` if missing (fresh deploy).
- **Defeat processing** (after commit): trophies for every participant (`RAID_DEFEATED`), the
  top 3 by damage (`RAID_CROWN`, ties by earliest last hit), and the final blow
  (`RAID_FINAL_BLOW`); `RAID_DEFEATED` push to participants. Idempotent through trophy
  uniqueness.
- Participants = users with ≥ 1 hit with damage > 0.

## Squads

- Create `POST /squads { name }` (1–30 chars, `isHandleAllowed`-style profanity check on the
  words). The creator is OWNER. Max 3 squads per user, 10 members per squad.
- Invite `POST /squads/:id/invites { userId }` (OWNER only, FRIEND of the owner only) → notify
  `SQUAD_INVITE`. Accept or decline via `POST /squads/:id/invites/accept|decline` (invited user).
- Leave `POST /squads/:id/leave`; kick `DELETE /squads/:id/members/:userId` (OWNER); rename
  `PATCH /squads/:id`; delete `DELETE /squads/:id` (OWNER). An owner who leaves hands OWNER to the
  longest member, or the squad is deleted when empty.
- Start a raid `POST /squads/:id/raids { bossSlug, difficulty }` (OWNER, one per squad per week,
  ≥ 2 members): `maxHp = members × {300, 450, 600}[difficulty] × max(1, daysLeftInWeek) / 7`
  (rounded up). Notify the members `SQUAD_RAID_STARTED`.
- Blocking between two members does **not** remove anyone, but they don't see each other's
  cards in that squad's feed or top list (filtered per viewer).

## Routes (AuthGuard + SocialEnabledGuard + `raidsEnabled`; mutations + CsrfGuard)

| Route                         | Notes                                                                                                                                                    |
| :---------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /raids/current`          | `{ community: RaidDto \| null, squads: RaidDto[], pendingResults: RaidResultDto[] }`                                                                     |
| `GET /raids/:id`              | `RaidDto` + `top: [{ card, damage, rank }]` (top 5) + `you: { damage, rank, trophies }`. Squad raids: members only, else 404                             |
| `GET /raids/:id/feed?cursor=` | last hits: `{ card, damage, weakSpotDamage, topExercise?, at }`. `topExercise` only for SELF/FRIEND (privacy: strangers see points, not workout content) |
| `POST /raids/:id/seen`        | marks the result celebration as shown                                                                                                                    |
| `GET /raids/bosses`           | the roster (slug, names, lore, weakTo) for the squad boss picker                                                                                         |
| Squads                        | as listed above, plus `GET /squads` (mine, with members' cards and pending invites)                                                                      |

`RaidDto = { id, kind, squad?: { id, name }, bossSlug, difficulty?, weekKey, endsAt, maxHp,
damage, phase, status, defeatedAt?, finalBlow?: card }`.

## Tests

HP formula (min HP, scaling, squad difficulty and the mid-week ratio). Damage incl. the weak-spot
multiplier and the daily cap. Re-sync only lowers. Remove gives HP back except after defeat.
Concurrent hits: exactly one final blow (fake-lock or sequential simulation plus the lock SQL
asserted). Phases fire once each. Escape at rollover. Spawn idempotent (partial unique index),
rotation. Trophies on defeat incl. crown ties. Squad rules (limits, owner-only, friends-only
invites, owner hand-over). Feed privacy (`topExercise` hidden for strangers). Blocked viewers
filtered. 404 for non-members.

## B — Web (after A and PR 3 part B)

`packages/common/src/raid/` recipes + the fixture export script. `components/gym/raid/`:
`BossCanvas` (three.js, lazy), `RaidCard` (Social tab, above Duels: boss, HP bar, time left,
your damage), `RaidPage` (big boss, HP bar with phase ticks, weak spots as chips, top
dealers, live feed polled every 20 s while visible, squads list + create/invite/start
flow), defeat/escape celebration, end-of-workout "damage dealt" line. Push pref "Raids". EN/DE.

## C — iOS + widget + Watch (after A and PR 3 part C)

`LukiFittiDesign/Raid/BossSceneView.swift` (SceneKit from the Swift recipe port), same
screens, haptics on hits and defeat, the widget snapshot, Watch HP ring + boss glyph, and the
Swift `pointsByWeakSpot` mirror with fixture tests.
