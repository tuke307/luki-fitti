# Import training data from Alpha Progression

Export your workout history from Alpha Progression, convert it into a
[`luki-fitti-import@1`](import-format.md) file, and upload it in the app under
**Profile → Data → Import file**. Nobody needs database access for this. The iOS and web
profile settings link to this guide.

> Privacy: the export contains your full training history. Keep exports, mappings and converted
> files outside the repository (for example in `.training-import/`, which is git-ignored), never
> commit them, and delete them when you are done.

Operators with direct PostgreSQL access can alternatively use the Python tools described in the
[general training data import guide](training-data-import.md). That path writes to the database
directly and is not needed for normal imports.

## 1. Export your data

Use Alpha Progression's CSV export and save your **workout history** locally. Export **plans**
separately if you also want workout templates. Check that the history includes your latest
sessions. Menu labels and export options can vary between app versions.

CSV export is available in the free version; see the
[official guide](https://alphaprogression.com/en/blog/alpha-progression-guide). Current versions
let you download the .csv directly, send it via email, or copy it to the clipboard.

## 2. Understand the export format

The workout-history CSV is **not** a flat one-row-per-set table. It is a semicolon-delimited text
format structured in blocks, one per session. The layout depends on the app language at export
time.

German export (UTF-8, semicolons):

```text
"Example Workout";"2026-01-12 18:00 Uhr";"1:05 Std."
"1. Example Exercise · Maschine · 10 Wdh"
#;KG;WDH
1;12,5;10
2;20;8
3;-;-
```

English export (some versions use tabs instead of semicolons):

```text
"Push Day A";"2026-02-19 4:54 h";"1:02 hr"

"1. Hack Squats · Machine · 8 reps";"WU1 · 37,5 kg · 9 reps<br>WU2 · 72,5 kg · 7 reps"
#;KG;REPS;RIR
1;115;8;1
2;115;8;0
3;115;6;0
```

- **Session header**: `"<workout name>";"<start>";"<duration>"`. Start times are wall clocks
  **without a time zone** (`YYYY-MM-DD HH:MM Uhr` / `YYYY-MM-DD H:MM h`). Durations use
  `H:MM Std.` / `H:MM hr`, or whole minutes such as `45 Min.`.
- **Exercise header**: `"<n>. <exercise name> · <equipment> · <target reps> Wdh|reps"`. The English
  export may add a second field listing warm-up sets as `WU<i> · <weight> kg · <reps> reps`,
  separated by `<br>`.
- **Column header**: `#;KG;WDH` or `#;KG;REPS;RIR` before each exercise's sets (cardio uses
  `#;KM;MIN.`).
- **Set rows**: `<set #>;<weight kg>;<reps>[;<RIR>]`. Completely empty sets (`-;-`) carry no data.

German plans export (`Plans.csv`): one `"<plan>";"<date>"` row per plan, a `"Tag <n>"` row per
day, then one row per exercise with its set count and rep target:

```text
"Example Plan";"2026-01-01"
"Tag 1"
"1. Example Exercise · Maschine";"3 Sätze";"10 Wdh"
```

Gotchas:

- **European decimal commas** (`102,5` = 102.5).
- A `+` suffix on reps (`8+`) means "at least N reps"; on weight (`+35`) it marks added weight on a
  bodyweight exercise.
- RIR is optional in the app, so expect empty or missing values.
- Exercise names follow the export language.
- The exact layout can vary between app versions and export kinds (plans vs. history). **Verify
  the mapping below against your own file before importing.**

## 3. Map to the LukiFitti model

| Alpha Progression                    | LukiFitti (`packages/database/prisma/schema.prisma`)                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Session header block                 | `WorkoutSession` (status `COMPLETED`, `startedAt` from the date, `activeDurationSeconds` from the duration) |
| Exercise header (`Name · Equipment`) | `SessionExercise` (`exerciseNameSnapshot`; use `Equipment` for catalog matching)                            |
| `WU<n>` entries                      | `SessionSet` with `setType = WARMUP`                                                                        |
| Set rows                             | `SessionSet` (`weight`, `reps`; RIR becomes RPE as `10 − RIR`)                                              |
| Plans export                         | One `WorkoutFolder` per plan, one `WorkoutTemplate` per `Tag` (working sets with the rep target, 90 s rest) |

Exercises: match each Alpha Progression exercise to the **global system catalog**
(`CORE_EXERCISE_CATALOG` in `packages/common/src/catalog/data.ts`, extended datasets in `packages/common/src/catalog/extended/`) by name, equipment and primary
muscle; see [finding catalog slugs](import-format.md#finding-catalog-slugs). Exercises that don't
exist in the catalog can be included in the import file as `customExercises` (they become your own
custom exercises). Adding new **system** exercises to the catalog is a separate maintainer task
(see [exercise-catalog.md](exercise-catalog.md)) and never contains personal data.

## 4. Convert and upload

1. **Map the exercise names.** Create a mapping file (keep it next to the export, not in the repo)
   from each Alpha Progression exercise to a catalog slug. Keys are matched case-insensitively;
   `"Name · Equipment"` wins over `"Name"`:

   ```json
   {
     "Hack Squats · Machine": "barbell-hack-squat",
     "Bench Press": "barbell-bench-press-medium-grip"
   }
   ```

2. **Run the converter.** The export's times are naive wall clocks; pass the time zone they were
   recorded in (defaults to the computer's zone):

   ```bash
   yarn workspace @luki-fitti/common build   # lets the converter validate its output
   node scripts/import/alpha-progression-to-luki.mjs .training-import/Workouts.csv \
     --plans .training-import/Plans.csv \
     --map .training-import/alpha-mapping.json --tz Europe/Berlin > .training-import/luki-import.json
   ```

   Both the English and the German layout are read; `--plans` is optional, and the history file
   can be left out to convert only the plans. It stops and lists every exercise name that has no
   mapping entry, and validates the file against the shared schema when `packages/common` is
   built. Warm-ups (`WU<n>`) become `WARMUP` sets, RIR becomes RPE as `10 − RIR`, decimal commas
   and `+` markers are handled. Empty sets (`-;-`) are dropped; a set with only weight or only
   reps stops the conversion with its line number so you can fix it. Cardio blocks (`#;KM;MIN.`)
   are skipped with a warning because the import format has no distance field yet.

3. **Upload it in the app:** Profile → Data → Import file. Check the preview (sessions, sets, date
   range, unknown exercises), then import. Importing the same file again changes nothing, so a
   later export can be converted and uploaded as a whole.

Plans are converted into folders and workouts (see above). Custom-exercise exports are not
converted yet: map those exercises to catalog slugs, or add them as `customExercises` by hand.
