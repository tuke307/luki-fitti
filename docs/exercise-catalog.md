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
