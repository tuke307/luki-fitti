# Import file format (`luki-fitti-import@1`)

LukiFitti imports data from one kind of file: a JSON document in the `luki-fitti-import@1`
format. You get one by:

- **exporting a backup** from LukiFitti (Profile → Data → Export Backup, web or iPhone), or
- **converting another app's export** with one of the guides:
  [GymLife](gymlife-import.md), [Alpha Progression](alpha-progression-import.md)
  (an [MCI](mci-import.md) import is not possible yet).

Upload it in the app under **Profile → Data → Import file**. The app first shows a preview (what is
new, what is already there, unknown exercises) and only imports after you confirm. Nobody needs
database access for this.

The schema lives in [`packages/common/src/schemas/import.ts`](../packages/common/src/schemas/import.ts)
(`ImportFileSchema`); the app and the API validate every file against it.

## Re-importing and idempotency

Every entry has a `key`: any stable string (≤ 120 characters) that is unique within its list.
The server turns `user + kind + key` into a fixed id (UUIDv5), so:

- importing **the same file twice changes nothing** — entries whose id already exists are skipped,
  never overwritten;
- a file that grew (e.g. a newer backup) only adds the new entries;
- the same file imported into **two accounts** creates separate copies; ids never collide;
- **changing a key** makes the entry new: it is imported again as a second copy.

If a folder in the file has the same name as one of your existing folders, the existing folder is
reused (the preview warns about it).

## Limits

| What                          | Limit                                                         |
| ----------------------------- | ------------------------------------------------------------- |
| File size                     | 10 MB                                                         |
| Folders / workouts / sessions | 200 / 2,000 / 10,000                                          |
| Custom exercises              | 1,000                                                         |
| Sets (templates + sessions)   | 200,000 per file                                              |
| Exercises per workout/session | 60 / 100; sets per exercise 40 / 100                          |
| Weight                        | 0–1500 (in the set's `weightUnit`)                            |
| Reps / RPE                    | 0–1000 (template sets 0–200) / 0–10                           |
| Durations                     | ≤ 24 h                                                        |
| Dates                         | 2000-01-01 … tomorrow, ISO 8601 with offset (`Z` or `+02:00`) |
| Rate                          | 20 previews and 5 imports per hour                            |

Unknown fields are rejected, so typos surface instead of being ignored silently. The preview lists
at most 50 problems.

## Fields

`?` = optional.

**File**

| Field             | Type                                        |
| ----------------- | ------------------------------------------- |
| `format`          | `"luki-fitti-import@1"`                     |
| `exportedAt`      | ISO date-time                               |
| `source`          | `{ app: string ≤ 60, note?: string ≤ 500 }` |
| `customExercises` | list (below), may be empty                  |
| `folders`         | list, may be empty                          |
| `templates`       | list, may be empty                          |
| `sessions`        | list, may be empty                          |

**Exercise reference** — `{ "slug": "barbell-squat" }` for a catalog exercise, or
`{ "customKey": "<key>" }` for an entry of `customExercises` in the same file.

**`customExercises[]`** — `key`, `name` (≤ 120), `primaryMuscleGroup`, `equipment`,
`exerciseType`, `movementPattern?`, `laterality?`, `description?` (≤ 2000), `instructions?`
(≤ 30 steps). Enum values are the ones in `packages/common/src/enums/index.ts`
(e.g. `CHEST`, `BARBELL`, `STRENGTH`, `UNILATERAL`).

**`folders[]`** — `key`, `name` (≤ 80, unique in the file), `color?` (`#RRGGBB`), `sortOrder?`.

**`templates[]`** (workouts) — `key`, `folderKey?` (a folder key from the same file; without it
the workout is unfiled), `name` (≤ 100), `description?`, `estimatedDurationMinutes?` (5–360),
`sortOrder?`, `exercises[]`:

- `exercise` (reference), `orderIndex`, `restSeconds` (0–900), `alternativeExercises?` (references),
- `sets[]` (1–40): `{ setType, weight?, reps?, durationSeconds? }`; `setType` is `WARMUP`,
  `WORKING`, `DROPSET` or `STRETCH`; missing values may be `null`.

**`sessions[]`** (completed workouts) — `key`, `workoutName` (≤ 160), `templateKey?`,
`sessionType?` (`STRENGTH`, `STRETCHING`, `MIXED`), `startedAt`, `completedAt` (not before
`startedAt`), `activeDurationSeconds?` (defaults to the time between start and end), `notes?`,
`exercises[]`:

- `exercise` (reference), `orderIndex`, `restSeconds?`,
- `sets[]`: `{ setNumber (1–100), setType, weight?, weightUnit ("KG" | "LBS"), reps?,
durationSeconds?, rpe?, completed }`.

Sessions are imported as completed; totals (volume, sets, reps) and the calorie estimate are
computed by the server the same way as for workouts recorded in the app.

## Example

```json
{
  "format": "luki-fitti-import@1",
  "exportedAt": "2026-11-01T09:00:00.000Z",
  "source": { "app": "Example" },
  "customExercises": [
    {
      "key": "landmine-press",
      "name": "Landmine Press",
      "primaryMuscleGroup": "SHOULDERS",
      "equipment": "BARBELL",
      "exerciseType": "STRENGTH"
    }
  ],
  "folders": [{ "key": "push-pull", "name": "Push / Pull" }],
  "templates": [
    {
      "key": "push",
      "folderKey": "push-pull",
      "name": "Push Day",
      "exercises": [
        {
          "exercise": { "slug": "barbell-bench-press-medium-grip" },
          "orderIndex": 0,
          "restSeconds": 120,
          "sets": [
            { "setType": "WARMUP", "weight": 40, "reps": 10 },
            { "setType": "WORKING", "weight": 80, "reps": 8 }
          ]
        }
      ]
    }
  ],
  "sessions": [
    {
      "key": "2026-10-30-push",
      "workoutName": "Push Day",
      "templateKey": "push",
      "startedAt": "2026-10-30T17:00:00Z",
      "completedAt": "2026-10-30T18:02:00Z",
      "exercises": [
        {
          "exercise": { "slug": "barbell-bench-press-medium-grip" },
          "orderIndex": 0,
          "sets": [
            {
              "setNumber": 1,
              "setType": "WORKING",
              "weight": 80,
              "weightUnit": "KG",
              "reps": 8,
              "rpe": 8,
              "completed": true
            }
          ]
        },
        {
          "exercise": { "customKey": "landmine-press" },
          "orderIndex": 1,
          "sets": [
            {
              "setNumber": 1,
              "setType": "WORKING",
              "weight": 25,
              "weightUnit": "KG",
              "reps": 10,
              "completed": true
            }
          ]
        }
      ]
    }
  ]
}
```

A larger example (used by the tests) is
[`import-file-example.json`](../packages/common/src/utils/__fixtures__/import-file-example.json).

## Finding catalog slugs

Every system exercise has a slug (e.g. `barbell-squat`, `dumbbell-bench-press`). To list them all
with their English names, equipment and primary muscle group (tab-separated):

```bash
yarn workspace @luki-fitti/common build
node --input-type=module -e "const { ALL_SYSTEM_EXERCISES } = await import('./packages/common/dist/catalog/extended/index.js'); for (const e of ALL_SYSTEM_EXERCISES) console.log([e.slug, e.name, e.equipment, e.primaryMuscleGroup].join('\t'));"
```

The same slugs are in the iOS bundle
(`apps/apple/Packages/LukiFittiKit/Sources/LukiFittiModels/Resources/starter_catalog.json`).
How the catalog is built is described in [exercise-catalog.md](exercise-catalog.md). Your own
custom exercises' slugs also resolve, but prefer `customExercises` so a file works in any account.
A slug that doesn't exist blocks the import; the preview lists the unknown ones.

## Privacy

The file is processed in memory and is never stored on the server or written to logs. Only an
audit row with counts (how many sessions, workouts, … were imported) is kept. Exports and
converted files contain your full training history: keep them private and delete them when you
are done.
