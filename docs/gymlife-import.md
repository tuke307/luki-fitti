# Importing data from GymLife (developer guide)

A rough, developer-oriented walkthrough for pulling workouts, templates and exercises out of the
GymLife iOS app and bringing them into LukiFitti. It is not an end-user feature; expect to adapt
the steps to the backup you are working with. The converter needs Node ≥ 22.13 (`node:sqlite`;
the repo requires `>=22` anyway).

> Privacy: an iPhone backup contains far more than Gymlife data (messages, health data, photos).
> Work on a copy, never commit backup files or extracted data, and delete them when you are done.
> `gymlife-extracted/` is git-ignored for this reason.

## 1. Create an unencrypted iPhone backup

1. Connect the iPhone to the Mac with a cable and unlock it ("Trust this computer").
2. Open **Finder → (your iPhone) → General**.
3. Select **Back up all of the data on your iPhone to this Mac**.
4. **Uncheck "Encrypt local backup"** (encrypted backups store files as unreadable blobs).
   If it was enabled before, unchecking asks for the backup password.
5. Click **Back Up Now** and wait for it to finish.

Backups live in:

```text
~/Library/Application Support/MobileSync/Backup/<DEVICE-UDID>/
```

Terminal needs **Full Disk Access** (System Settings → Privacy & Security) to read this folder.

## 2. Find the GymLife SQLite database

A backup stores files under hashed names. `Manifest.db` (SQLite) maps them back to app paths.

```bash
cd ~/Library/Application\ Support/MobileSync/Backup/<DEVICE-UDID>

# Find the Gymlife app domain and its database files
sqlite3 Manifest.db \
  "SELECT fileID, domain, relativePath FROM Files
   WHERE domain LIKE '%gymlife%' AND relativePath LIKE '%.sqlite%';"
```

Each `fileID` is stored at `<first two characters of fileID>/<fileID>`. Copy the main database
(not the `-wal` / `-shm` side files, unless the main file looks empty) to a working folder:

```bash
mkdir -p ~/source/luki-fitti/gymlife-extracted
cp "<ab>/<abcdef…>" ~/source/luki-fitti/gymlife-extracted/gymlife_backup.sqlite
```

Exercise images referenced in the database (`Exercise.Image`) ship inside the app bundle and are
**not** part of the backup. LukiFitti uses its own image mapping instead (see step 4).

## 3. Explore the schema

```bash
sqlite3 gymlife-extracted/gymlife_backup.sqlite ".tables"
```

Tables that matter:

| Table                                                                      | Contents                                                                                                                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Exercise`                                                                 | Exercise library (`Name`, `Description` = newline-separated steps, `PrimaryMuscleGroupID`, `EquipmentID`, `IsStretching`, `IsDefaultExercise`, `CustomName`) |
| `PrimaryMuscleGroups`, `SecondaryMuscleGroups`, `MuscleGroup`, `Equipment` | Lookup tables for the IDs above                                                                                                                              |
| `Training`                                                                 | Templates **and** folders (`IsFolder`, `ParentID`, `OrderNumber`)                                                                                            |
| `TrainingExercise`                                                         | Exercises of a template (`OrderNumber`, `RestSeconds`, superset flags `IsSuperSet` / `SuperSetID` / `IsFirstOfSuperSet` / `IsLastOfSuperSet`)                |
| `GymSet`                                                                   | Planned sets of a template exercise (`NumberOfRepetitions`, `Weight`, `SetType`)                                                                             |
| `TrainingLog`                                                              | Completed workouts (`Date`, `Duration`, `IsCompleted`, heart rate, calories)                                                                                 |
| `TrainingExerciseLog`                                                      | Exercises performed in a workout                                                                                                                             |
| `GymSetLog`                                                                | Logged sets (`NumberOfRepetitions`, `Weight`, `SetType`)                                                                                                     |

Gotchas:

- `Date` / `StartDate` are **Unix seconds** (floats); `Duration` is seconds.
- `Weight` is in the unit the user had configured (kg in our data) and can be **decimal**
  (e.g. `17.5`), not only integer.
- Booleans appear both as `0/1` and as the strings `'true'/'false'`; normalize both.
- `Deleted` exists only on `Exercise`, `Training` and `TrainingLog` — not on the link/set tables.
  Soft-deleted trainings/logs are skipped, but soft-deleted exercises are kept: history still
  references them.
- `CustomName` overrides `Name` when the user renamed a built-in exercise.
- `GymSet` / `GymSetLog` rows carry `NumberOfSets`: one row can stand for several identical sets.

## 4. Map to the LukiFitti model

| Gymlife                        | LukiFitti (`packages/database/prisma/schema.prisma`)                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Training` with `IsFolder = 1` | `WorkoutFolder`                                                                                                                                         |
| `Training` (template)          | `WorkoutTemplate` (`folderId` from `ParentID`)                                                                                                          |
| `TrainingExercise` + `GymSet`  | `WorkoutTemplateExercise` (`plannedSets`, `targetRepsMin/Max`, `targetWeight`, `restSeconds`; supersets use `restSeconds = 0` between paired exercises) |
| `TrainingLog`                  | `WorkoutSession` (status `COMPLETED`, `startedAt`, `activeDurationSeconds`)                                                                             |
| `TrainingExerciseLog`          | `SessionExercise` (store `exerciseNameSnapshot` / `primaryMuscleSnapshot`)                                                                              |
| `GymSetLog`                    | `SessionSet`                                                                                                                                            |
| `Exercise`                     | `Exercise` — see below                                                                                                                                  |

Exercises: each GymLife exercise is matched to the **system catalog** by slug (step 5). The
catalog is generated from free-exercise-db and wger and covers the GymLife library well; an
exercise without a faithful match is imported as a per-user custom exercise. Changing the catalog
itself is a separate task, described in [exercise-catalog.md](exercise-catalog.md).

## 5. Import a user's history

Personal data (folders, templates, sessions, sets) is user-specific and never goes into migrations
or SQL scripts. Convert the SQLite file into a [`luki-fitti-import@1`](import-format.md) file and
let the user upload it in the app. Nobody needs database access. The steps below are written so
an AI agent can follow them end to end.

1. **List the exercises the backup uses.** The converter reads the `.sqlite` directly:

   ```bash
   node scripts/import/gymlife-to-luki.mjs gymlife-extracted/gymlife_backup.sqlite \
     --list-exercises > gymlife-extracted/exercises.json
   ```

   Each entry has the exercise `id`, GymLife `code` (`ExerciseCode`, `null` for user-created
   ones), `name` (`CustomName` if the user renamed it, otherwise `Name`), `builtInName`, flags
   (`userCreated`, `deleted`), the LukiFitti `equipment` / `primaryMuscleGroup` it would get as a
   custom exercise, the GymLife `gymlifeMuscleGroups`, a `description` excerpt, and how often it
   is used (`templateUses`, `sessionUses`). Soft-deleted exercises appear too — history still
   references them.

2. **List the catalog slugs** (with name, equipment and primary muscle group) as described in
   [finding catalog slugs](import-format.md#finding-catalog-slugs).

3. **Write `gymlife-extracted/mapping.json`**: a JSON object `{ "<name from the list>": "<slug>" }`
   for every exercise that has a faithful match in the catalog. Keys are matched
   case-insensitively and both `name` and `builtInName` are tried (users often rename built-ins),
   so either can be used as the key. Match on movement, equipment and muscle group; use the
   `description` to disambiguate vague names (e.g. "Row", "Upper back"). Only map when the catalog
   exercise is the _same movement_; when in doubt, ask the user — and leave anything without a
   faithful match out of the file entirely. Unmapped exercises are imported as custom exercises,
   so nothing is lost. Every slug you use must appear in the catalog list from step 2.

4. **Run the converter** and keep the output inside the git-ignored folder:

   ```bash
   yarn workspace @luki-fitti/common build   # lets the converter validate its output
   node scripts/import/gymlife-to-luki.mjs gymlife-extracted/gymlife_backup.sqlite \
     --map gymlife-extracted/mapping.json > gymlife-extracted/luki-import.json
   ```

   It converts folders (`Training.IsFolder`), templates with their planned sets, and completed
   workouts (`TrainingLog.IsCompleted`) with their logged sets; soft-deleted trainings and logs
   are skipped, soft-deleted _exercises_ are imported anyway, and GymLife ids become the entry
   keys. Weights are taken as kg. Sets whose `SetType` is `1` (or contains "warm") become
   warm-ups; pass `--warmup-set-type <value>` if your data uses another value. A `TrainingLog`
   duration that is missing or outside 0–24 h falls back to the sum of that log's
   `TrainingExerciseLog.Duration`. Exercises left out of the mapping become entries in
   `customExercises` (key `gymlife:exercise:<ID>`) and are listed on stderr — add them to the
   mapping and rerun if you wanted a catalog exercise instead. The converter also names the
   columns a table actually has if one it expects is missing (adjust `COLUMNS` in the script
   then).

   The column names were verified against a real GymLife backup: primary keys are named after
   their table (`TrainingID`, `TrainingExerciseID`, `GymSetID`, `TrainingLogID`,
   `TrainingExerciseLogID`, `GymSetLogID`; only `Exercise` uses `ID`), and the links are
   `TrainingExercise.TrainingID` / `ExerciseID`, `GymSet.TrainingExerciseID`,
   `TrainingLog.TrainingID`, `TrainingExerciseLog.TrainingLogID` / `ExerciseID` and
   `GymSetLog.TrainingExerciseLogID`. A set row with `NumberOfSets = n` stands for n identical
   sets (GymLife's own `totalRepetitions` only add up that way); set rows have no order column,
   so they are ordered by id. That backup had `SetType = 0` on every set, so the warm-up value
   `1` is still unconfirmed; check yours before relying on it.

5. **Sanity-check the counts** against the source:

   ```bash
   sqlite3 gymlife-extracted/gymlife_backup.sqlite \
     "SELECT COUNT(*) FROM TrainingLog
      WHERE IsCompleted IN (1, '1', 'true') AND COALESCE(Deleted, 0) NOT IN (1, '1', 'true');"
   sqlite3 gymlife-extracted/gymlife_backup.sqlite \
     "SELECT SUM(g.NumberOfSets) FROM GymSetLog g
      JOIN TrainingExerciseLog e ON e.TrainingExerciseLogID = g.TrainingExerciseLogID
      JOIN TrainingLog l ON l.TrainingLogID = e.TrainingLogID
      WHERE l.IsCompleted IN (1, '1', 'true') AND COALESCE(l.Deleted, 0) NOT IN (1, '1', 'true');"
   ```

   These should match the number of `sessions` and the total number of session sets in the
   output.

6. **Upload it in the app:** Profile → Data → Import file. Check the preview, then import.
   Importing the same file again changes nothing.

Delete `gymlife-extracted/` when you are done.
