# Importing data from Gymlife (developer guide)

A rough, developer-oriented walkthrough for pulling workouts, templates and exercises out of the
Gymlife iOS app and bringing them into LukiFitti. It is not an end-user feature; expect to adapt
the steps to the backup you are working with.

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

## 2. Find the Gymlife SQLite database

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
**not** part of the backup. LukiFitti uses its own image mapping instead (see step 5).

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
- `Weight` is an integer in the unit the user had configured (kg in our data).
- Booleans appear both as `0/1` and as the strings `'true'/'false'`; normalize both.
- Rows with `Deleted = 1` are soft-deleted; skip them.
- `CustomName` overrides `Name` when the user renamed a built-in exercise.

## 4. Export to JSON / CSV

Dumping tables to JSON makes mapping easier to iterate on:

```bash
cd gymlife-extracted && mkdir -p json-tables
for t in Exercise Training TrainingExercise GymSet TrainingLog TrainingExerciseLog GymSetLog \
         MuscleGroup PrimaryMuscleGroups SecondaryMuscleGroups Equipment; do
  sqlite3 -json gymlife_backup.sqlite "SELECT * FROM \"$t\" WHERE COALESCE(Deleted, 0) = 0;" \
    > "json-tables/$t.json" 2>/dev/null \
  || sqlite3 -json gymlife_backup.sqlite "SELECT * FROM \"$t\";" > "json-tables/$t.json"
done
```

## 5. Map to the LukiFitti model

| Gymlife                        | LukiFitti (`packages/database/prisma/schema.prisma`)                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Training` with `IsFolder = 1` | `WorkoutFolder`                                                                                                                                         |
| `Training` (template)          | `WorkoutTemplate` (`folderId` from `ParentID`)                                                                                                          |
| `TrainingExercise` + `GymSet`  | `WorkoutTemplateExercise` (`plannedSets`, `targetRepsMin/Max`, `targetWeight`, `restSeconds`; supersets use `restSeconds = 0` between paired exercises) |
| `TrainingLog`                  | `WorkoutSession` (status `COMPLETED`, `startedAt`, `activeDurationSeconds`)                                                                             |
| `TrainingExerciseLog`          | `SessionExercise` (store `exerciseNameSnapshot` / `primaryMuscleSnapshot`)                                                                              |
| `GymSetLog`                    | `SessionSet`                                                                                                                                            |
| `Exercise`                     | `Exercise` — see below                                                                                                                                  |

Exercises: first match each Gymlife exercise to the **global system catalog**
(`INITIAL_EXERCISE_CATALOG` in `packages/common/src/catalog/index.ts`) by name, muscle group and
equipment. Only exercises that are genuinely missing should be added — to that same catalog,
never as a separate list — together with:

- clean English name and German search terms in `tags`,
- instructions split into steps (Gymlife `Description` uses newlines),
- an image folder from [Free Exercise DB](https://github.com/yuhonas/free-exercise-db) in
  `EXERCISE_DB_FOLDER_BY_SLUG` (use `null` when no faithful photo exists — the app then shows the
  anatomy visual),
- a Prisma migration that upserts the new system exercises (see
  `20261025140000_expand_exercise_catalog` for the pattern, including re-pointing references from
  per-user copies),
- a regenerated iOS catalog: `apps/apple/Packages/LukiFittiKit/Sources/LukiFittiModels/Resources/starter_catalog.json`
  (its `exercises` array is `INITIAL_EXERCISE_CATALOG` serialized after `yarn --cwd packages/common build`).

Verify image URLs return HTTP 200 before committing.

## 6. Import a user's history

Personal data (folders, templates, sessions, sets) is user-specific and should **not** go into
migrations. Generate a one-off SQL script (or use the API) scoped to the target user:

- look the user up by e-mail inside the script; abort if not found,
- wrap everything in a transaction (`BEGIN … COMMIT`),
- use deterministic IDs (e.g. UUIDv5 from the Gymlife IDs) with `ON CONFLICT DO NOTHING`, so
  re-running is safe,
- reference exercises by system catalog slug,
- record the run in `ImportJob` (`sourceFormat = 'GYMLIFE_SQLITE'`) with counts in `summaryJson`.

Run it against a local database first, then check the totals (sessions, sets, templates) in the
app before touching production.
