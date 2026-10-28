# Exercise Catalog Audit & Search Improvement Plan

_Date: 2026-10-28 · Scope: all system exercises after PR #8 (`e4d2eaa`, `2d09387`)_

## 0. Resolution

- **No separate curated catalog anymore.** All 1,132 system exercises come from free-exercise-db
  and wger. Each of the 122 former curated exercises is now the dataset entry it was built on
  (120 free-exercise-db photos, plus wger "Bird Dog" and "Machine Lateral Raise"). Its hand-written
  English/German text, metadata, tags and alternatives live in
  `packages/common/src/catalog/overrides.ts` and are applied at runtime.
- `scripts/import-catalog.ts` writes `core-records.ts` (the override targets, loaded right away)
  and `extended/records.ts` (everything else, loaded on demand).
- **Retired ids:** 90 former curated ids were renamed and 75 dataset duplicates removed. The
  transition layer that resolved old ids at runtime (API, web and iOS offline stores) has been
  removed again; the importer keeps the duplicates as its skip list
  (`scripts/dataset-duplicates.ts`).
- Migration `20261028120000_merge_catalog_into_datasets` renames former curated rows (references
  follow via `ON UPDATE CASCADE`) and merges duplicate rows into their replacement. It was tested
  against Postgres 17 with templates, sessions, alternatives and replaced ids.
- Regression tests: no two system exercises share an EN or DE name, the importer fails if a kept
  exercise is missing, and starter content only uses core exercises.
- **Search** is implemented as `exercise-search.util.ts` (+ vocabulary) in common, used by web
  and the API (also for "Did you mean …?" before creating a custom exercise), with a 1:1 Swift port
  (`ExerciseSearch.swift`). Both run the shared fixture `__fixtures__/exercise-search-cases.json`.
  The old `exercise-match.util` matcher is gone; the importer keeps a frozen copy of its tokenizer
  (`scripts/exercise-tokens.ts`) so re-imports produce the same ids.
- Still open: the data-quality items in §5 (equipment/muscle mislabels, non-English names, German
  names missing for 655 imported exercises).

## 1. Summary

| Source                                          | Count     |
| ----------------------------------------------- | --------- |
| Curated (`packages/common/src/catalog/data.ts`) | 122       |
| free-exercise-db (imported)                     | 719       |
| wger (imported)                                 | 369       |
| **Total system exercises**                      | **1,210** |

- **No technical duplicates**: every `id` and `slug` is unique.
- **~55 imported exercises duplicate a curated exercise** (same movement, same equipment), e.g.
  `Bankdrücken (Kurzhanteln)` ↔ wger `Benchpress Dumbbells` (DE: "Bankdrücken").
- **~20 additional pairs duplicate each other inside the imported set** (free-exercise-db ↔ wger).
- **683 of 1,088 imported exercises (63 %) have no German name**, so they show English in the German UI.
- Several data-quality problems (wrong equipment, wrong primary muscle, non-English "English" names)
  make duplicates harder to spot and break filters.

Method: every exercise was localized to DE and EN, then compared by exact name (both languages),
canonical tokens (`exerciseTokens`), an extended equipment-aware token comparison
(DB/KH/LH, plural/singular, "laying"/"lying", "OHP", German compounds …), shared image URLs, and
keyword sweeps per movement family. Candidates were then reviewed manually; variants
(e.g. "Decline", "Wide-Grip", "Single-Leg", "with Bands") are **not** counted as duplicates.

---

## 2. Duplicates of curated exercises (remove the imported entry)

Confidence: **High** = same movement and equipment; **Probable** = very likely the same, quick
manual check recommended.

### Chest

| Curated (keep)                                           | Imported duplicate(s)                                                                         | Conf.                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------ |
| `ex-dumbbell-bench-press` Bankdrücken (Kurzhanteln)      | `ex-benchpress-dumbbells` (wger) "Benchpress Dumbbells" / "Bankdrücken"                       | High — **reported case** |
| `ex-barbell-bench-press` Bankdrücken (Langhantel)        | `ex-bench-press` (wger) "Bench Press" / "Bankdrücken"                                         | High                     |
| `ex-machine-chest-press` Brustpresse (Maschine, sitzend) | `ex-seated-bench-press` (wger) "Brustpresse im Sitzen"; `ex-chest-press` (wger) "Brustpresse" | High                     |

### Back

| Curated (keep)                                                   | Imported duplicate(s)                                                              | Conf.    |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------- |
| `ex-weighted-pull-up` Klimmzug                                   | `ex-pull-ups` (wger) "Klimmzüge"; `ex-weighted-pull-ups` (fedb)                    | High     |
| `ex-lat-pulldown` Latzug (breiter Griff)                         | `ex-lat-pull-down-straight-back` (wger) "Latzug"                                   | High     |
| `ex-close-grip-lat-pulldown` Latzug (enger Griff)                | `ex-close-grip-lat-pull-down` (wger) "Latzug Eng"                                  | High     |
| `ex-barbell-bent-over-row` Vorgebeugtes Rudern (LH)              | `ex-bent-over-rowing` (wger) "Rudern Vorgebeugt"; `ex-barbell-row-overhand` (wger) | High     |
| `ex-chest-supported-dumbbell-row` Rudern auf der Schrägbank (KH) | `ex-incline-dumbbell-row` (wger) "Rudern KH Auf Schrägbank"                        | High     |
| `ex-one-arm-dumbbell-row` Einarmiges Kurzhantelrudern            | `ex-bent-over-dumbbell-rows-single-arm` (wger) "Rudern Einarmig"                   | High     |
| `ex-single-arm-cable-row` Einarmiges Rudern am Kabelzug          | `ex-unilateral-cable-row` (wger); `ex-single-arm-row` (wger, cable)                | High     |
| `ex-seated-cable-row` Rudern am Kabelzug (sitzend)               | `ex-rowing-seated-narrow-grip` (wger) "Rudern Sitzend, Eng"                        | Probable |
| `ex-machine-high-row` Rudern an der Maschine                     | `ex-seated-row-machine` (wger)                                                     | Probable |
| `ex-conventional-deadlift` Kreuzheben (klassisch)                | `ex-deadlifts` (wger) "Kreuzheben"                                                 | High     |
| `ex-back-extension` Rückenstrecker                               | `ex-lower-back-extensions` (wger)                                                  | Probable |

### Shoulders

| Curated (keep)                                                | Imported duplicate(s)                                                                     | Conf.    |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------- |
| `ex-overhead-barbell-press` Schulterdrücken stehend (LH, OHP) | `ex-shoulder-press-barbell` (wger) "Schulterdrücken"; `ex-standing-military-press` (fedb) | High     |
| `ex-arnold-press` Arnold Press                                | `ex-arnold-shoulder-press` (wger) "Arnold Press"                                          | High     |
| `ex-dumbbell-lateral-raise` Seitheben (KH)                    | `ex-lateral-raises` (wger) "Seitheben"                                                    | High     |
| `ex-barbell-front-raise` Frontheben (LH)                      | `ex-front-raises` (wger) — equipment BARBELL but DE says "am Kabel"                       | Probable |
| `ex-dumbbell-reverse-fly` Reverse Flys (KH)                   | `ex-reverse-flyes` (fedb)                                                                 | High     |
| `ex-cable-reverse-fly` Reverse Flys am Kabelzug               | `ex-cable-rear-delt-fly` (wger) "Reverse Butterfly am Kabel"                              | High     |
| `ex-reverse-pec-deck` Reverse Butterfly (Maschine)            | `ex-pec-deck-rear-delt-fly` (wger)                                                        | High     |
| `ex-barbell-shrug` Shrugs (LH)                                | `ex-shrugs-barbells` (wger) "Shrugs"                                                      | High     |
| `ex-dumbbell-shrug` Shrugs (KH)                               | `ex-shrugs-dumbbells` (wger) "Shrugs"                                                     | High     |
| `ex-cable-face-pull` Face Pulls                               | `ex-facepull` (wger) "Face Pulls"                                                         | High     |

### Arms

| Curated (keep)                                                    | Imported duplicate(s)                                      | Conf. |
| ----------------------------------------------------------------- | ---------------------------------------------------------- | ----- |
| `ex-barbell-curl` Bizepscurls (LH)                                | `ex-biceps-curls-with-barbell` (wger) "Bizeps LH-Curls"    | High  |
| `ex-hammer-curl` Hammercurls (KH)                                 | `ex-hammer-curls` (wger) "Hammercurls"                     | High  |
| `ex-ez-bar-preacher-curl` Scottcurls (SZ)                         | `ex-preacher-curls` (wger, EZ_BAR)                         | High  |
| `ex-cable-tricep-pushdown` Trizepsdrücken am Seil                 | `ex-tricep-rope-pushdowns` (wger) "Trizepsdrücken am Seil" | High  |
| `ex-dumbbell-skull-crusher` French Press liegend (KH)             | `ex-skullcrusher-dumbbells` (wger) "Frenchpress"           | High  |
| `ex-seated-overhead-dumbbell-extension` Trizepsstrecken über Kopf | `ex-triceps-overhead-dumbbell` (wger)                      | High  |
| `ex-dumbbell-kickback` Trizeps-Kickbacks (KH)                     | `ex-patadas-traseras` (wger, Spanish EN name)              | High  |
| `ex-triceps-dip` Dips (Trizeps)                                   | `ex-parallel-bar-dip` (fedb)                               | High  |

### Legs & glutes

| Curated (keep)                                            | Imported duplicate(s)                                                                    | Conf.                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------- |
| `ex-barbell-back-squat` Kniebeuge (LH)                    | `ex-squats` (wger) "Kniebeuge"                                                           | High                                        |
| `ex-goblet-squat` Goblet Squat                            | `ex-dumbbell-goblet-squat` (wger)                                                        | High                                        |
| `ex-lying-leg-curl` Beinbeuger (liegend)                  | `ex-leg-curls-laying` (wger) "Beinbeuger Liegend"; `ex-leg-curl` (wger) "Beinbeuger"     | High / Probable                             |
| `ex-seated-calf-raise` Wadenheben (sitzend)               | `ex-sitting-calf-raises` (wger) "Wadenheben Sitzend"                                     | High                                        |
| `ex-barbell-hip-thrust` Hip Thrust (LH)                   | `ex-hip-thrust` (wger) "Beckenheben"                                                     | High                                        |
| `ex-hip-adduction-abduction` Hüftab-/adduktion (Maschine) | `ex-machine-hip-abduction`, `ex-seated-hip-adduction` (wger); `ex-thigh-adductor` (fedb) | Probable (curated combines both directions) |

### Core

| Curated (keep)                                            | Imported duplicate(s)                              | Conf.    |
| --------------------------------------------------------- | -------------------------------------------------- | -------- |
| `ex-crunch` Crunch                                        | `ex-abdominal-crunch` (wger) "Bauchcrunch"         | High     |
| `ex-machine-crunch` Bauchmaschine (Crunch)                | `ex-crunches-on-machine` (wger)                    | High     |
| `ex-cable-crunch` Kniender Crunch am Kabelzug             | `ex-crunches-with-cable` (wger) "Crunches am Seil" | High     |
| `ex-decline-crunch` Crunch auf der Negativbank            | `ex-negative-crunches` (wger)                      | High     |
| `ex-alternate-heel-touchers` Wechselseitiges Fersentippen | `ex-heel-touches` (wger)                           | High     |
| `ex-lying-leg-raise` Beinheben liegend                    | `ex-leg-raise` (wger) "Beine heben"                | Probable |

### Stretching & mobility

| Curated (keep)                                           | Imported duplicate(s)                                                          | Conf.    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ | -------- |
| `ex-doorway-pec-stretch` Brustdehnung im Türrahmen       | `ex-doorway-pectoral-stretch` (wger) — identical DE name                       | High     |
| `ex-cat-cow-spinal-flow` Katze-Kuh                       | `ex-yoga-exercise-cow-cat` (wger)                                              | High     |
| `ex-thoracic-open-book` Open Book                        | `ex-open-book` (wger)                                                          | High     |
| `ex-childs-pose-lat-stretch` Kindhaltung                 | `ex-child-s-pose` (wger) "Kinderpose"                                          | Probable |
| `ex-butterfly-adductor-stretch` Schmetterlingsdehnung    | `ex-butterfly-stretch` (wger) "Schmetterlingsdehnung"                          | High     |
| `ex-standing-quad-stretch` Quadrizepsdehnung             | `ex-quadriceps-stretch` (wger); `ex-quad-stretch` (fedb)                       | High     |
| `ex-standing-wall-calf-stretch` Wadendehnung an der Wand | `ex-calf-stretch-hands-against-wall` (fedb); `ex-standing-calf-stretch` (wger) | Probable |

---

## 3. Duplicates inside the imported set (keep one)

Prefer the free-exercise-db entry (two photos, Unlicense) but take the German name/steps from wger.

| Keep                                       | Duplicate                                                 | Conf.    |
| ------------------------------------------ | --------------------------------------------------------- | -------- |
| `ex-push-press`                            | `ex-push-ohp` (DE "Push Press")                           | High     |
| `ex-smith-machine-decline-press`           | `ex-decline-smith-press`                                  | High     |
| `ex-smith-machine-upright-row`             | `ex-upright-row-on-multi-press` ("Rudern Aufrecht MP")    | High     |
| `ex-smith-machine-overhead-shoulder-press` | `ex-shoulder-press-on-multi-press` ("Frontdrücken MP")    | High     |
| `ex-machine-bench-press`                   | `ex-flat-machine-press`                                   | High     |
| `ex-pull-through`                          | `ex-cable-pull-through`                                   | High     |
| `ex-tate-press`                            | `ex-dumbell-tate-press`                                   | High     |
| `ex-dumbbell-side-bend`                    | `ex-side-bend`                                            | High     |
| `ex-reverse-barbell-curl`                  | `ex-reverse-curl`                                         | High     |
| `ex-concentration-curls`                   | `ex-dumbbell-concentration-curl`                          | High     |
| `ex-weighted-crunches`                     | `ex-weighted-crunch`                                      | High     |
| `ex-front-barbell-squat`                   | `ex-front-squats` ("Front Kniebeuge")                     | High     |
| `ex-plank`                                 | `ex-front-plank` ("Unterarmstütz (Plank)")                | High     |
| `ex-triceps-pushdown`                      | `ex-cable-triceps-press` ("Trizepsdrücken am Kabelzug")   | High     |
| `ex-quad-stretch`                          | `ex-quadriceps-stretch` (see §2 — both duplicate curated) | High     |
| `ex-l-sit`                                 | `ex-l-hold` (DE "L Sit")                                  | High     |
| `ex-shoulder-raise-side-and-front-db`      | `ex-lateral-to-front-raises`                              | High     |
| `ex-floor-dips`                            | `ex-bench-dips-on-floor`                                  | Probable |

## 4. Same German name, different exercise (look like duplicates in the UI)

| German name    | Exercises                                     | Fix                                         |
| -------------- | --------------------------------------------- | ------------------------------------------- |
| "Shrugs"       | `ex-shrugs-barbells`, `ex-shrugs-dumbbells`   | Both are curated duplicates → removed by §2 |
| "Bankdrücken"  | `ex-bench-press`, `ex-benchpress-dumbbells`   | Both are curated duplicates → removed by §2 |
| "Arnold Press" | `ex-arnold-press`, `ex-arnold-shoulder-press` | Curated duplicate → removed by §2           |

Recommendation: German names should always include the equipment in parentheses, like curated
names do ("Shrugs (Kurzhanteln)"), so equal names cannot happen again.

## 5. Data-quality findings

| Issue                                         | Examples                                                                                                                                                                                                                | Cause                                                                                                            |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Machine/Smith exercises labelled `BODYWEIGHT` | `ex-seated-bench-press`, `ex-leg-curls-laying`, `ex-sitting-calf-raises`, `ex-close-grip-lat-pull-down`, `ex-leg-presses-narrow/-wide`, `ex-upright-row-on-multi-press`, `ex-rowing-t-bar`, `ex-pec-deck-rear-delt-fly` | `wgerEquipment()` falls back to `BODYWEIGHT`; "MP"/"Multi Press", "Latzug", "Beinpresse" etc. are not recognised |
| Contradicting equipment                       | `ex-front-raises`: BARBELL vs DE "Frontheben am Kabel"                                                                                                                                                                  | wger equipment list vs name                                                                                      |
| Implausible primary muscle                    | `ex-core-rotation` QUADRICEPS, `ex-cat-plank` QUADRICEPS, `ex-quadruped-hip-abduction` CALVES, `ex-bench-dips-on-floor` BICEPS, `ex-db-wrist-extension` BICEPS                                                          | `WGER_CATEGORY_MUSCLE` fallback (Legs → QUADRICEPS, Arms → BICEPS)                                               |
| Non-English "English" names                   | `ex-patadas-traseras`, `ex-isometria-alle-parallele`, `ex-military-press-mit-sz-bar`                                                                                                                                    | `NON_ENGLISH_CHARS` only catches accented characters                                                             |
| Unpolished German names                       | "Rudern Aufrecht ß-Stange", "Dips Zwischen 2 Bänke", "Lat-Ziehen Mit Gesteckten Armen", "Negativ Bankdrücken KH"                                                                                                        | wger user content; fedb-path German names are not run through `cleanName()`                                      |
| Missing German names                          | 683 / 1,088 imported                                                                                                                                                                                                    | Only wger matches provide German names                                                                           |

## 6. Why the importer let duplicates through

In <ref_file file="/Users/MEISSTO/source/luki-fitti/packages/common/scripts/import-catalog.ts" />:

1. **free-exercise-db pass only skips exact token matches** (`seenTokens.has(tokens)`); there is no
   near-duplicate check there at all.
2. **The wger near-duplicate check compares English names only** and needs ≥ 75 % token overlap
   relative to the longer name. Curated names include the equipment ("Barbell Bench Press"),
   wger names often don't ("Bench Press") → 2/3 = 67 % → not a duplicate.
3. **`exerciseTokens()` does not normalise** plurals ("Shrugs", "Raises"), compounds
   ("Benchpress", "Facepull", "Skullcrusher"), abbreviations (DB/KH/LH/BB/OHP/MP) or
   "laying"/"sitting", so many identical exercises get different token sets.
4. **German names are never compared** with the curated German locale (`locales/de.ts`), even though
   wger's German names often match curated German names exactly ("Brustdehnung im Türrahmen").
5. **Equipment is compared by name words, not by the resolved `EquipmentType`.**

## 7. Follow-ups

The duplicate fixes and the search are implemented (§0). Still open:

- Data quality (§5): equipment detection in `wgerEquipment()` (MP / Multi Press, Latzug,
  Beinpresse, Butterfly), implausible category-fallback muscles, non-English names that slip past
  `NON_ENGLISH_CHARS`, unpolished German names, and German names for the remaining imported
  exercises.
- Search: track zero-result queries (Umami, query text only) and grow
  `exercise-search.vocab.ts` from them; add new cases to the shared fixture
  `packages/common/src/utils/__fixtures__/exercise-search-cases.json` (run by TS and Swift).
