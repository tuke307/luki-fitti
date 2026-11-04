# Import training data from Alpha Progression

Export workout history and plans from Alpha Progression, convert the CSV files,
and import the resulting data into your LukiFitti account. This developer workflow
requires Python 3.10 or newer and PostgreSQL access; it is not an in-app upload
feature. The iOS and web profile settings link to this guide.

The [general import guide](training-data-import.md) documents the shared JSON
format, exercise mappings, database configuration, and support for other apps.

## 1. Export your data

Use Alpha Progression's CSV export and save your **workout history** locally.
Export **plans** separately if you also want workout templates. Check that the
history includes your latest sessions. Menu labels and export options can vary
between app versions.

CSV export is available in the free version; see the
[official guide](https://alphaprogression.com/en/blog/alpha-progression-guide).
Keep private exports, mappings, and backups in `.training-import/`, which is
excluded from Git. Never commit personal training data or database credentials.

## 2. Check the supported format

The [CSV adapter](../tools/training-import/prepare_alpha_progression.py) supports
this German-language, UTF-8, semicolon-delimited layout:

```text
"Example Workout";"2026-01-12 18:00 Uhr";"1:05 Std."
"1. Example Exercise · Maschine · 10 Wdh"
#;KG;WDH
1;12,5;10
2;20;8
3;-;-
```

- Start times use `YYYY-MM-DD HH:MM Uhr`, without a UTC offset.
- Durations use `H:MM Std.` or an integer number of minutes, such as `45 Min.`.
- Strength sets use `#;KG;WDH`; cardio sets use `#;KM;MIN.`.
- Decimal commas are supported. Completely empty sets (`-;-`) are skipped;
  partially empty sets stop processing for review.
- Exercise headers contain a numbered name and equipment, with an optional
  integer rep target ending in `Wdh`.
- Plan files contain a plan name/date row, `Tag …` rows, and exercise rows with
  set counts and integer rep targets. Only these basic plan targets are imported.

English headers, tab delimiters, RIR columns, embedded `WU…` warmup entries,
and values such as `8+` require an adapted parser. They are not supported by
this adapter. Inspect the actual files before proceeding; do not discard columns
or warmup information to make an unsupported format parse. Custom-exercise and
body-measurement export files are not handled here.

## 3. Convert the CSV files

From the repository root:

```sh
python -m pip install -r tools/training-import/requirements.txt
python tools/training-import/prepare_alpha_progression.py --workouts ".training-import/Workouts.csv" --plans ".training-import/Plans.csv" --output ".training-import/normalized.json" --timezone Europe/Berlin
```

Replace the filenames with your own. Omit `--plans` if unavailable. Set
`--timezone` to the time zone in which the sessions took place. An export spanning
different local time zones needs additional normalization.

This layout has no explicit set types, so sets default to `WORKING`. Only after
confirmation for every affected occurrence, add
`--warmup-first "EXACT EXERCISE NAME"` to mark set number 1 as `WARMUP`.
Repeat the option for multiple exercises. Use the normalized name, including
equipment but excluding numbering and target reps, such as
`Example Exercise · Maschine`. If warmup behavior varies by session, review and
correct the JSON rather than applying a blanket rule.

Review converted sessions, skipped sets, units, and warmup assumptions. Estimated
end times are derived from UTC start times and exported durations. Missing
per-set timestamps, RPE, calories, and heart rates are not invented.

## 4. Map exercises and configure access

Create `.training-import/mapping.json` using
[example-mapping.json](../tools/training-import/example-mapping.json) as a format
reference. Replace its sample data with a mapping for every normalized exercise
name. Match movement, equipment, and variant to an accessible catalog slug.

If no faithful match exists, define a personal exercise with the `custom` mapping
in the [general guide](training-data-import.md#using-the-scripts). Personal
exercises and imported plans belong to the target account; personal history must
not be added to global catalogs or schema migrations.

Configure `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD` or
`PGPASSFILE` through the environment. The database login needs the relevant table
privileges and is separate from the app account selected with `--email`.
TLS is required by default; see the general guide for connection configuration.

## 5. Validate, rehearse, and import

Validate the JSON without connecting to PostgreSQL:

```sh
python tools/training-import/import_training.py --input ".training-import/normalized.json" --mapping ".training-import/mapping.json" --source "alpha-progression" --email "account@example.com" --validate-only
```

Run a database rehearsal:

```sh
python tools/training-import/import_training.py --input ".training-import/normalized.json" --mapping ".training-import/mapping.json" --source "alpha-progression" --email "account@example.com"
```

This backs up existing training data, tests inserts, verifies fields and
relationships, repeats inserts to check idempotence, and rolls back. Review the
report under `.training-import/` before proceeding.

Persist only after a successful rehearsal:

```sh
python tools/training-import/import_training.py --input ".training-import/normalized.json" --mapping ".training-import/mapping.json" --source "alpha-progression" --email "account@example.com" --commit
```

The commit run repeats the rollback rehearsal before saving, then reads the data
back for verification. Conflicting existing records are not overwritten. Reports
separate inserted IDs from existing IDs; dry runs list proposed additions under
`wouldInsertIds`.

Reload LukiFitti and verify dates, exercise order, weights, reps, warmup labels,
and templates. Historical sessions are not automatically linked to templates.
Planned weights and custom rest periods must be added afterwards.

## 6. Add missing sessions later

Export the complete history again, convert it, and reuse the same mapping,
target account, and `--source "alpha-progression"`. Repeat validation and the
rehearsal. Identical records are skipped; only missing records are added. Changed
existing records or sessions starting within one minute of each other require
review.

This CSV layout has no source IDs, so workout identity falls back to UTC start
time and workout name. Renaming a workout or changing the export time zone can
change its identity and requires reconciliation. Records created by earlier
one-off import scripts also need reconciliation because their ID schemes may
differ; do not assume this script will recognize them automatically.
