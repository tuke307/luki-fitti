# Import training data from other apps into LukiFitti

This guide covers exporting workout plans and training history from another
fitness app and importing them into LukiFitti. The
[import script](../tools/training-import/import_training.py) reads a shared JSON
structure and writes to PostgreSQL. Other export formats require an adapter;
there is no CSV import interface in the app.

## Using the scripts

Requirements: Python 3.10 or newer and PostgreSQL access. From the repository root:

```sh
python -m pip install -r tools/training-import/requirements.txt
python tools/training-import/import_training.py --help
python -m unittest discover -s tools/training-import -p "test_*.py"
```

Use [example.json](../tools/training-import/example.json) and
[example-mapping.json](../tools/training-import/example-mapping.json) as format
references. Replace the sample data before performing a real import. Store
private exports and edited mappings under `.training-import/`, which is excluded
from Git.

Each exercise name needs a mapping to an accessible catalog `slug`.
Alternatively, a mapping can define a personal exercise:

```json
{
  "Custom exercise": {
    "custom": {
      "primaryMuscleGroup": "BICEPS",
      "equipment": "CABLE",
      "exerciseType": "STRENGTH"
    }
  }
}
```

Allowed values are defined in the Prisma schema. The JSON format supports
completed sets with `weightKg` or `weight` plus `weightUnit` (`KG`/`LBS`), reps,
duration, distance, and set type. Plan imports currently support set counts and
a fixed rep target; custom rest periods and planned weights need to be added
afterwards. Historical sessions are imported without automatic links to workout
templates.

An adapter is included for German-language Alpha Progression CSV exports:

```sh
python tools/training-import/prepare_alpha_progression.py --workouts ".training-import/Workouts.csv" --plans ".training-import/Plans.csv" --output ".training-import/normalized.json" --timezone Europe/Berlin
```

`--plans` is optional. Repeat `--warmup-first "EXACT EXERCISE NAME"` to mark the
first set of a confirmed exercise as a warmup. Without this option, missing set
types are assumed to be `WORKING`. Unknown formats stop processing; the adapter
does not support arbitrary CSV layouts. Exercise names must match the original
export, including its language.

Validate the JSON without connecting to the database:

```sh
python tools/training-import/import_training.py --input ".training-import/normalized.json" --mapping ".training-import/mapping.json" --source "source-app" --email "account@example.com" --validate-only
```

Configure `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD` or
`PGPASSFILE` in the environment. TLS is required by default. Set `PGSSLMODE`
explicitly for an agreed connection setup, such as an SSH tunnel. Do not put
credentials in commands or files committed to the repository.

```sh
# Dry run: write inside a transaction, then roll it back.
python tools/training-import/import_training.py --input ".training-import/normalized.json" --mapping ".training-import/mapping.json" --source "source-app" --email "account@example.com"

# Persist: first repeat the rollback rehearsal, then save the import.
python tools/training-import/import_training.py --input ".training-import/normalized.json" --mapping ".training-import/mapping.json" --source "source-app" --email "account@example.com" --commit
```

Reuse the same `--source` value and exercise mapping for subsequent exports.
Identical records are skipped; conflicting existing content or possible duplicate
sessions abort the import. The script does not update existing sessions
automatically. Records created by earlier one-off import scripts require a
separate reconciliation before adding data, since their IDs may differ.
Backups and reports are saved under `.training-import/` by default.
Reports separate `insertedIds` from `existingIds`. Dry runs leave `insertedIds`
empty and list proposed additions under `wouldInsertIds`; skipped existing
records must not be treated as part of a rollback of a later import.

## 1. Export the data

Use the previous app's export feature and save the available **workout plans**
and **training history** locally, for example as CSV or JSON. Check that the
export includes the latest sessions and whether plans and completed workouts
need to be exported separately.

Inspect the format, character encoding, units, and structure before parsing.
CSV delimiters, column names, and decimal separators can vary. Some exports use
nested blocks instead of a single table. Typical contents include:

- Plans: plan name and date, training days, exercises, and set/rep targets.
- Workouts: session name, local start time, duration, exercises, and individual sets.
- Strength sets: weight and reps; cardio: duration and optional distance.

## 2. Normalize and map the export

Read the files with a suitable parser and convert them to a consistent local
intermediate structure, such as JSON:

- Check decimal separators and missing-value markers. Skip completely empty sets
  and stop for review on incomplete or unknown records.
- Interpret local start times in the export's time zone, including daylight saving
  time, and convert them to UTC. For example, use `Europe/Berlin` for German local
  times. Respect existing UTC timestamps or explicit offsets. Convert durations
  to seconds and distances to meters. Preserve weights with their original unit
  (`KG` or `LBS`), or convert them consistently.
- Match exercises to existing catalog entries by movement, equipment, and variant.
  If no faithful match exists, create a personal exercise for the target account
  rather than changing the global catalog.
- Map exported set types to LukiFitti types. If the export omits set types, only
  mark sets as `WARMUP` after confirmation; a lower weight alone is insufficient.
  Document any assumption that unknown set types are `WORKING`.

The normalized JSON can specify `sessionType` as `STRENGTH`, `STRETCHING`, or
`MIXED`. Otherwise, the importer derives it from exercise types: stretching-only
sessions are `STRETCHING`, sessions combining stretching with other exercise types
are `MIXED`, and other sessions use `STRENGTH`.

The target tables are defined in
[`schema.prisma`](../packages/database/prisma/schema.prisma):

| Export content            | LukiFitti                                               |
| ------------------------- | ------------------------------------------------------- |
| Plan and training day     | `WorkoutFolder`, `WorkoutTemplate`                      |
| Planned exercise and sets | `WorkoutTemplateExercise`, including the `sets` JSON    |
| Completed workout         | `WorkoutSession`                                        |
| Exercise within a workout | `SessionExercise` with name, muscle, and type snapshots |
| Individual set            | `SessionSet`                                            |
| Personal exercise variant | `Exercise` and `ExerciseMuscleGroup`                    |

Calculate session totals according to the app's rules: count completed sets and
reps, but exclude warmup sets from strength volume. Leave missing RPE, calorie,
and heart-rate values empty. If no explicit end time is available, an adapter can
derive it from start time and duration; do not invent individual set timestamps.
Import only available data. If no plan export exists, import completed sessions
without creating plan templates. If rest periods are missing, use the app default
or agreed values and document the assumption.

## 3. Validate, back up, and import

1. Identify the target account uniquely by email. Check the actual database schema
   and required table privileges. The database login is separate from the app account.
2. Read credentials from environment variables and prefer TLS or an SSH tunnel.
   Keep personal exports, backups, and credentials out of version control.
3. Back up the target account's affected records, including child tables. Record
   source file hashes and inserted IDs.
4. Test parsing, known values, daylight saving transitions, and relationships locally.
5. Rehearse the full import in a PostgreSQL transaction and roll it back. Verify
   fields, relationships, and totals. Repeat inserts to check for duplicates,
   then confirm that the original state is unchanged.
6. Persist only after successful validation and read the data back afterwards.
   Do not overwrite existing workouts or plans.
7. Reload the app and check history, exercise order, weights, and templates.

Assign all personal folders, templates, and exercises to the target account.
Personal imports do not belong in global starter plans or schema migrations.
Keep a local import report with source hashes, inserted IDs, and results.
The current schema has no `ImportJob` table.

## 4. Add missing workouts later

Create another complete workout export. Reconcile existing sessions using stable
IDs and additional start-time/name checks. Prefer source IDs when available.
For example, derive UUIDv5 target IDs from the target account, source app, and
source ID. If source IDs are unavailable, define a stable matching key and review
ambiguous matches. File names and export dates must not create new workout IDs.

Insert only missing sessions. Review changed existing sessions or possible
duplicates rather than overwriting them automatically. Apply the same backup
and transaction checks as for the initial import.
The importer also rejects sessions within one minute of each other in the same
input batch, matching its check against existing sessions. Review legitimate
close-starting sessions separately before importing.
