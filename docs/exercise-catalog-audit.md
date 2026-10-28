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
- **165 retired ids** (90 renamed former curated ids + 75 dataset duplicates from §2/§3) are listed
  in `packages/common/src/catalog/retired.ts`. The importer never generates them; they are
  resolved by the API (session sync, templates, routines), the web offline store, and the iOS
  offline store.
- Migration `20261028120000_merge_catalog_into_datasets` renames former curated rows (references
  follow via `ON UPDATE CASCADE`) and merges duplicate rows into their replacement. It was tested
  against Postgres 17 with templates, sessions, alternatives and replaced ids.
- Regression tests: no two system exercises share an EN or DE name, every retired id points to an
  existing exercise, and starter content only uses core exercises.
- **Search (§8)** is implemented as `exercise-search.util.ts` (+ vocabulary) in common, used by web
  and the API, with a 1:1 Swift port (`ExerciseSearch.swift`). Both run the shared fixture
  `__fixtures__/exercise-search-cases.json`.
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

## 7. Recommended fixes

1. **Importer**
   - Use the improved shared normaliser from §8 (same code as search).
   - Compare _movement tokens + resolved `EquipmentType`_ against curated **and** already-accepted
     records, in **both** languages, in both passes.
   - Add a hand-maintained `DUPLICATE_OF: Record<importedSlug, canonicalId>` and `SKIP` list for
     edge cases, seeded with §2/§3.
   - Fix equipment detection (MP/Multi Press → Smith, Latzug/Beinpresse/Butterfly → Machine/Cable)
     and stop falling back to a category muscle when it's clearly wrong.
2. **Regression test** in `extended.spec.ts`: no two system exercises may share
   (normalised DE name) or (movement tokens + equipment).
3. **Migration for existing data** — the API seeds via `upsert` and never deletes, and users may
   already have logged sets/templates with the duplicate IDs. Follow the pattern of
   `20261026110000_link_custom_smith_shoulder_press`: remap references
   (workout sets, session exercises, template exercises, routines, favourites) from duplicate ID →
   canonical ID, then delete the duplicate system rows.
4. **Clients** — keep an `EXERCISE_ID_ALIASES` map (duplicate → canonical) in `@luki-fitti/common`
   so the web offline store (IndexedDB) and iOS bundled data resolve old IDs; regenerate
   `starter_catalog.json` with `apps/apple/scripts/export-starter-catalog.ts`.

---

## 8. Plan: smarter exercise search

### 8.1 Current state

| Surface                             | Implementation                                                                                                                                                                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web picker, catalog, active session | `filterExercisesByQuery` in <ref_snippet file="/Users/MEISSTO/source/luki-fitti/apps/web/components/gym/exercise-picker.tsx" lines="23-70" /> — raw `includes()` on name, tags, labels, description; `findSimilarExercises` only if < 10 direct hits |
| API `GET /exercises?search=`        | `includes()` on name/description/enum strings in <ref_snippet file="/Users/MEISSTO/source/luki-fitti/apps/api/src/modules/exercise/exercise.service.ts" lines="126-136" />                                                                           |
| iOS                                 | `contains()` on name/tags/DE muscle label in <ref_snippet file="/Users/MEISSTO/source/luki-fitti/apps/apple/LukiFittiIOS/Features/Exercises/ExercisesAndStretchingView.swift" lines="131-140" />                                                     |

Three different implementations, none normalise punctuation, plurals or umlauts, and there is no ranking.

Measured against today's catalog (DE locale, web logic):

| Query                     | Result today                                      | Expected                                |
| ------------------------- | ------------------------------------------------- | --------------------------------------- |
| `situp`                   | **0 results**                                     | Sit-Ups, 3/4 Sit-Up, …                  |
| `bankdrucken` (no umlaut) | **0 direct**; fuzzy → "Bank-Dips"                 | Bankdrücken (LH/KH)                     |
| `bizepcurl` (typo)        | **0 results**                                     | Bizepscurls …                           |
| `pushup`                  | fuzzy top hits "Drop Push", "Push Press"          | Liegestütz first                        |
| `rdl`                     | includes "Hurdle Hops" (substring in description) | only RDL variants                       |
| `squat`                   | 80 hits in catalog order, no ranking              | Kniebeuge (LH) / Bodyweight Squat first |

### 8.2 Goals

- Forgiving input: spacing, hyphens, plurals, umlauts with or without `ue`, small typos.
- Bilingual: German and English names, gym slang and abbreviations always searchable,
  whatever the UI language is.
- Relevance ranking instead of catalog order.
- **One** algorithm for web, API and iOS, verified by the same test cases.
- Fast enough for keystroke search (< 5 ms for 1,200 exercises, no network).

### 8.3 Design — `packages/common/src/utils/exercise-search.util.ts`

**1. Normalisation (index + query)**

- Lowercase, NFD + strip diacritics, `ß→ss`, fold umlauts to **both** forms at index time
  (`drücken` → `druecken` and `drucken`) so `bankdrucken`, `bankdruecken`, `bankdrücken` all match.
- Replace punctuation/hyphens/apostrophes with spaces; collapse whitespace.
- **Compact form**: remove all spaces (`"sit-ups"` → `situps`) and match the compact query against
  compact names → `situp` ⊂ `situps` ✔.

**2. Tokenisation & light stemming**

- Plural/inflection stripping for EN (`-s`, `-es`) and DE (`-e`, `-en`, `-n`, `-er`, `-es`):
  `pushups→pushup`, `klimmzüge→klimmzug`, `sitzendes→sitzend`.
- German compound splitting with a known-morpheme list (`bizepscurl → bizeps curl`,
  `schrägbankdrücken → schräg bank drücken`), reusing and extending `SYNONYMS`.

**3. Synonyms & aliases** (one bidirectional dictionary, shared with the importer)

- Movement: situp ↔ sit-up ↔ sit up; pushup ↔ liegestütz; pullup ↔ klimmzug; squat ↔ kniebeuge;
  deadlift ↔ kreuzheben; bench press ↔ bankdrücken; pec deck ↔ butterfly;
  skull crusher ↔ french press ↔ stirndrücken; preacher ↔ scott; plank ↔ unterarmstütz …
- Abbreviations: OHP, RDL, DB/KH, BB/LH, SZ/EZ, MP/Multipresse/Smith.
- Per-exercise aliases: add an optional `aliases: string[]` to curated exercises for colloquial names.

**4. Matching tiers & scoring** (per exercise, highest tier wins, then summed bonuses)

| Tier                                                                       | Example                           | Score |
| -------------------------------------------------------------------------- | --------------------------------- | ----- |
| Exact normalised name (DE or EN)                                           | `crunch` → Crunch                 | 100   |
| Name starts with query / compact prefix                                    | `situp` → Sit-Ups                 | 90    |
| All query tokens in name (any order, last token as prefix for as-you-type) | `kh bank` → Bankdrücken (KH)      | 75    |
| All tokens via synonyms/aliases/tags                                       | `ohp` → Schulterdrücken (LH, OHP) | 60    |
| Typo match (Damerau-Levenshtein ≤ 1 for 4–7 chars, ≤ 2 for ≥ 8)            | `bizepcurl`, `kniebuege`          | 45    |
| Muscle / equipment label only                                              | `brust`, `kabelzug`               | 25    |

- Tokens shorter than 4 characters must match a whole token (fixes `rdl` → "hurdle").
- **Description is no longer searched** (main source of noise); optional low-weight fallback only
  when there are zero hits.
- Equipment conflict penalty (reuse the existing `findSimilarExercises` idea): query says
  "Kurzhantel", exercise is Langhantel → ×0.5.
- Tie-breakers: user's recently used / favourite exercises → custom exercises → curated →
  imported with German name → imported; then shorter name; then alphabetical.

**5. Index**

- `buildExerciseSearchIndex(exercises, locale)` precomputes normalised DE+EN names, tags, aliases,
  compact strings and token sets once (memoised on catalog identity). Needs both DE and EN names
  per exercise, so the index is built from the unlocalised record plus the translation table, not
  from the already-localised DTO.
- `searchExercises(index, query, { filters, limit })` returns `{ exercise, score, matchedField }[]`.
- Linear scan over ~1,200 entries is well under 5 ms; no search library needed, which keeps the
  logic portable to Swift. (Alternative: MiniSearch on web only — rejected because iOS/API parity
  would need a second implementation anyway.)

**6. UX**

- Highlight matched part of the name in results.
- "Meintest du …?" suggestion when there are zero results (best typo/synonym candidate).
- Optional later phase: collapse variants under the base exercise ("Kniebeuge · 12 Varianten").

### 8.4 Rollout

1. **Common module + tests** — `exercise-search.util.ts`, extend `SYNONYMS` and share the normaliser
   with `exerciseTokens`/importer. Add a JSON fixture
   `packages/common/src/utils/__fixtures__/exercise-search-cases.json` (query → expected top-3 IDs),
   run by `node --test`.
2. **Web** — replace `filterExercisesByQuery` internals (picker, catalog, active session); keep the
   function signature so call sites don't change. Update the Playwright search spec.
3. **API** — use `searchExercises` in `ExerciseService.findAll` so online and offline results match.
4. **iOS** — Swift port in `LukiFittiKit` (`ExerciseSearch.swift`), driven by the same JSON fixture
   in `LukiFittiDomainTests`; export synonyms with the starter catalog so they stay in sync.
5. **Feedback loop** — track zero-result queries via the existing Umami integration (query text
   only, no user identifiers) and add missing aliases from the results.
6. **Dependency** — do the catalog dedupe (§7) first or in parallel; otherwise better search will
   surface the duplicates even more prominently.

### 8.5 Acceptance test cases (initial fixture)

| Query                                        | Must rank in top 3                                      |
| -------------------------------------------- | ------------------------------------------------------- |
| `situp`, `sit up`, `Sit-Ups`                 | Sit-Ups                                                 |
| `pushup`, `liegestütze`                      | `ex-push-up` (Liegestütz)                               |
| `bankdrucken`, `bankdruecken`, `bench press` | `ex-barbell-bench-press`, `ex-dumbbell-bench-press`     |
| `kh bank`                                    | `ex-dumbbell-bench-press` first                         |
| `bizepcurl`, `bizeps curl`                   | `ex-barbell-curl` / `ex-ez-bar-bicep-curl`              |
| `rdl`                                        | `ex-romanian-deadlift`; must **not** return Hurdle Hops |
| `ohp`                                        | `ex-overhead-barbell-press`                             |
| `klimmzüge`, `pullups`                       | `ex-weighted-pull-up`                                   |
| `schulterdrücken multipresse`                | `ex-smith-machine-overhead-shoulder-press`              |
| `kniebuege` (typo)                           | `ex-barbell-back-squat`                                 |
| `latzug eng`                                 | `ex-close-grip-lat-pulldown`                            |
