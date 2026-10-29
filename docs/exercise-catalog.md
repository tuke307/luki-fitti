# Exercise Catalog

Every system exercise comes from one of two open datasets, merged into a single catalog:

- [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense): start/finish photos
- [wger](https://wger.de) (CC-BY-SA 4.0): German names/descriptions and extra machine variants

## How it fits together

| File (`packages/common/`)           | What it is                                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/import-catalog.ts`         | Fetches both datasets and writes the two records files. Run `yarn workspace @luki-fitti/common catalog:import`; the output only changes when the sources or rules change. |
| `src/catalog/core-records.ts`       | Generated. The core exercises: the ones used by starter workouts and routines. Loaded right away.                                                                         |
| `src/catalog/extended/records.ts`   | Generated. Everything else, loaded on demand (`@luki-fitti/common/catalog/extended`).                                                                                     |
| `src/catalog/overrides.ts`          | Hand-written English/German text, metadata, tags and alternatives for the core exercises, keyed by dataset id and applied at runtime. `source` names the dataset entry.   |
| `scripts/dataset-duplicates.ts`     | Dataset entries that describe the same exercise as another one. The importer skips them and lets them lend German text to the exercise that is kept.                      |
| `scripts/exercise-tokens.ts`        | The importer's duplicate tokenizer. Frozen: changing it changes which entries are imported, and so which exercise ids exist.                                              |
| `src/utils/exercise-search.util.ts` | The app search (web, API; ported 1:1 to iOS as `ExerciseSearch.swift`). Vocabulary in `exercise-search.vocab.ts`, shared test cases in `src/utils/__fixtures__/`.         |

After changing the catalog or the search vocabulary, run `yarn workspace @luki-fitti/apple catalog:export`
so the iOS bundle (`starter_catalog.json`, `exercise_search.json`) matches.

## Adding or fixing exercises

- **Text or metadata of a core exercise:** edit `overrides.ts`; no re-import needed.
- **A duplicate slipped in:** add it to `dataset-duplicates.ts` and re-import. Ids that existed before
  need a migration that moves references to the kept exercise (see
  `20261028120000_merge_catalog_into_datasets` for the pattern).
- **German name of an extended exercise:** `DE_NAME_OVERRIDES` in `import-catalog.ts`.

Tests fail if two exercises share an English or German name, if starter content uses a non-core
exercise, and the importer fails if an exercise named as kept or as an override is not generated.

## Movement metadata and alternatives

`MuscleGroup` is too coarse to find a replacement (a row and a pullover are both `BACK`), so every
exercise also carries optional movement metadata on `ExerciseDto`:

| Field             | Values                                                                       |
| ----------------- | ---------------------------------------------------------------------------- |
| `movementPattern` | `MovementPattern`, e.g. `HORIZONTAL_PULL`, `SHOULDER_EXTENSION`, `HINGE`     |
| `laterality`      | `BILATERAL` or `UNILATERAL` (one arm / leg at a time, including alternating) |
| `mechanic`        | `COMPOUND` or `ISOLATION`, derived from the pattern                          |
| `targetRegions`   | `TargetRegion[]`, finer than `MuscleGroup` (e.g. `LATS`, `UPPER_CHEST`)      |

- **Core exercises** are hand-tagged in `overrides.ts`; `movement.spec.ts` fails if a core strength
  exercise has no pattern, or lists an alternative with a different (and not compatible) movement.
- **Extended exercises** are classified when the DTOs are built, by `inferMovementProfile` in
  `src/catalog/movement.ts`: deterministic English and German name rules (row/Rudern,
  pullover/Überzug, one-arm/einarmig, …), so no re-import is needed. Exercises no rule recognises
  (plyometrics, drills, holds) keep `movementPattern: null` and are only found by search. To fix a
  classification, adjust the rules and add the exercise to `movement.spec.ts`.
- **Custom exercises** store `movementPattern` and `laterality` in the database (optional in the
  create form).

`rankAlternatives` (`src/utils/exercise-alternatives.util.ts`, ported 1:1 to iOS as
`ExerciseAlternatives.swift`) ranks replacements: only the same or a compatible movement (e.g.
flat ↔ incline press; never a row for a straight-arm pulldown), then the predefined alternatives,
target-region overlap, slug similarity, same side, compound/isolation, exercises the user has logged
and a small bonus for different equipment. Each result carries reasons (`SAME_MOVEMENT`,
`DONE_BEFORE`, …) that the replace dialog shows as e.g. "Same movement · Cable · Both sides". The
stall suggestion of `computeWorkoutExerciseSuggestion` uses the same ranking. Shared cases live in
`src/utils/__fixtures__/alternatives-cases.json`; when the catalog or the weights change, re-check
the expected top 3 there.

The iOS bundle includes the metadata, so re-run `yarn workspace @luki-fitti/apple catalog:export`
after changing tags, rules or alternatives.

## Open data-quality issues

| Issue                                   | Examples                                                                                                                      | Cause                                                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Machine exercises labelled `BODYWEIGHT` | `ex-leg-presses-narrow`, `ex-leg-presses-wide`, `ex-rowing-t-bar`, `ex-butterfly-narrow-grip`                                 | `wgerEquipment()` falls back to `BODYWEIGHT`; "Beinpresse", "T-Bar", "Butterfly" etc. are not recognised |
| Implausible primary muscle              | `ex-core-rotation` QUADRICEPS, `ex-cat-plank` QUADRICEPS, `ex-quadruped-hip-abduction` CALVES, `ex-db-wrist-extension` BICEPS | `WGER_CATEGORY_MUSCLE` fallback (Legs → QUADRICEPS, Arms → BICEPS)                                       |
| Non-English "English" names             | `ex-isometria-alle-parallele`, `ex-military-press-mit-sz-bar`                                                                 | `NON_ENGLISH_CHARS` only catches accented characters                                                     |
| Unpolished German names                 | "Rudern Aufrecht ß-Stange", "Dips Zwischen 2 Bänke", "Lat-Ziehen Mit Gesteckten Armen Mit (Stange)", "Negativ Bankdrücken KH" | wger user content; free-exercise-db German names are not run through `cleanName()`                       |
| Missing German names                    | 655 of 1,010 extended exercises                                                                                               | Only wger matches provide German names                                                                   |

Search follow-up: track zero-result queries (Umami, query text only) and grow
`exercise-search.vocab.ts` from them, adding each new case to the shared fixture.
