# Importing data from Alpha Progression (developer guide)

A rough, developer-oriented walkthrough for pulling workouts, plans and exercises out of the
Alpha Progression app and bringing them into LukiFitti. It is not an end-user feature; expect to
adapt the steps to the export you are working with.

> Privacy: the export contains your full training history. Work on a copy, never commit export
> files or extracted data, and delete them when you are done.

## 1. Export the CSV from Alpha Progression

Alpha Progression exports CSV in the **free version** — no Pro subscription needed
([official guide](https://alphaprogression.com/en/blog/alpha-progression-guide)). In the app:

1. Open **Settings** and choose **Export training data** (the entry may just be called "Export"
   or "CSV" depending on the app version).
2. Pick what to export. Available separately:
   - **Workout history** (all completed sessions — the file you want for a history import),
   - **Plans** (training plans / templates),
   - **Custom exercises**,
   - **Body measurements**.
3. Get the file off the phone: current versions let you **download the .csv directly**, send it
   **via email**, or **copy it to the clipboard** (per the App Store release notes).

## 2. Understand the export format

The workout-history CSV is **not** a flat one-row-per-set table. It is a text format, delimited
by semicolons (some exports use tabs), structured in blocks:

```text
"Push Day A";"2026-02-19 4:54 h";"1:02 hr"

"1. Hack Squats · Machine · 8 reps";"WU1 · 37,5 kg · 9 reps<br>WU2 · 72,5 kg · 7 reps"
#;KG;REPS;RIR
1;115;8;1
2;115;8;0
3;115;6;0

"2. …"
…
(blank line = next session)
```

- **Session header**: `"<workout name>";"<start date>";"<duration>"` — e.g.
  `"Push Day A";"2026-02-19 4:54 h";"1:02 hr"`. The date is a wall clock **with no timezone**
  (`YYYY-MM-DD H:MM`, note the `h` suffix); the duration is `H:MM hr`.
- **Exercise header**: `"<n>. <exercise name> · <equipment> · <target reps> reps"` plus an
  optional second field listing warm-up sets as `WU<i> · <weight> kg · <reps> reps`, separated
  by `<br>`.
- **Column header**: `#;KG;REPS;RIR` before each exercise's sets — skip it.
- **Set rows**: `<set #>;<weight kg>;<reps>;<RIR>`.
- **Blank lines** separate sessions.

Gotchas:

- **European decimal commas** (`102,5` = 102.5).
- A `+` suffix on reps (`8+`) means "at least N reps"; on weight (`+35`) it marks added weight
  on a bodyweight exercise.
- RIR is optional in the app — expect empty or missing values if the user didn't track it.
- Exercise names may be German or English depending on the app language at export time.
- The exact layout can vary between app versions and export kinds (plans vs. history).
  **Verify the mapping below against your own file before importing** — the header regexes in
  existing third-party parsers (e.g. [FreeReps](https://github.com/meltforce/FreeReps), MIT)
  are a good reference implementation.

## 3. Map to the LukiFitti model

| Alpha Progression                     | LukiFitti (`packages/database/prisma/schema.prisma`)                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| Session header block                  | `WorkoutSession` (status `COMPLETED`, `startedAt` from the date, `activeDurationSeconds` from the duration) |
| Exercise header (`Name · Equipment`)  | `SessionExercise` (`exerciseNameSnapshot`; use `Equipment` for catalog matching)               |
| `WU<n>` entries                       | `SessionSet` with `setType = WARMUP`                                                          |
| Set rows `#;KG;REPS;RIR`              | `SessionSet` (`weight`, `reps`; RIR has no field — drop it or keep in a note)                 |
| Plans export                          | `WorkoutTemplate` (+ `WorkoutFolder` if the plan has groupings) — verify layout against your export |
| Custom exercises export               | `Exercise` — see below                                                                         |

**Verify against your export:** the mapping above is based on the observed workout-history
format; plan and custom-exercise CSVs were not analyzed in detail and may use different columns.

Exercises: first match each Alpha Progression exercise to the **global system catalog**
(`INITIAL_EXERCISE_CATALOG` in `packages/common/src/catalog/data.ts`) by name, equipment and
primary muscle. Only exercises that are genuinely missing should be added — to that same
catalog, never as a separate list — together with:

- clean English name and German search terms in `tags`,
- instructions split into steps,
- an image folder from [Free Exercise DB](https://github.com/yuhonas/free-exercise-db) in
  `EXERCISE_DB_FOLDER_BY_SLUG` (use `null` when no faithful photo exists — the app then shows the
  anatomy visual),
- a Prisma migration that upserts the new system exercises (see
  `20261025140000_expand_exercise_catalog` for the pattern, including re-pointing references from
  per-user copies),
- a German translation (name, description, same number of instruction steps) in
  `packages/common/src/catalog/locales/de.ts`, keyed by exercise id —
  `yarn workspace @luki-fitti/common test` fails while one is missing,
- a regenerated iOS catalog: run `yarn workspace @luki-fitti/common build` and then
  `yarn workspace @luki-fitti/apple catalog:export`, which writes
  `apps/apple/Packages/LukiFittiKit/Sources/LukiFittiModels/Resources/starter_catalog.json` for every
  supported language (`catalog:check` verifies it is up to date).

The catalog is the only source of system exercise text: the API and the apps resolve name,
description and steps from it by id in the requested language (`Accept-Language`); the text columns
of system rows in the `Exercise` table are not used for display.

Verify image URLs return HTTP 200 before committing.

## 4. Import a user's history

Personal data (sessions, sets, templates) is user-specific and should **not** go into
migrations. Generate a one-off SQL script (or use the API) scoped to the target user:

- look the user up by e-mail inside the script; abort if not found,
- wrap everything in a transaction (`BEGIN … COMMIT`),
- use deterministic IDs (e.g. UUIDv5 from the session date + exercise + set index, since the
  export has no stable IDs) with `ON CONFLICT DO NOTHING`, so re-running is safe,
- decide the timezone up front: the export's session times are naive wall clocks — interpret
  them in the user's timezone and document the choice,
- reference exercises by system catalog slug,
- record the run (counts, source format, date) somewhere auditable — the older `ImportJob`
  model from the GymLife import no longer exists in the current schema, so log it in whatever
  audit mechanism your script uses.

Run it against a local database first, then check the totals (sessions, sets, templates) in the
app before touching production.
