/**
 * Generates the bundled iOS/watchOS starter catalog from `@luki-fitti/common/catalog`, the single
 * source of the built-in exercises, starter workouts and stretching routines (all languages), plus
 * `retired_exercise_ids.json` (ids of merged exercises) and `exercise_search.json` (the shared
 * search vocabulary).
 *
 *   yarn workspace @luki-fitti/apple catalog:export   # write the file
 *   yarn workspace @luki-fitti/apple catalog:check    # fail if the file is out of date
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import {
  buildStarterStretchingRoutines,
  buildStarterWorkouts,
  getExerciseSearchNames,
  INITIAL_EXERCISE_CATALOG,
  RETIRED_EXERCISE_IDS,
} from '@luki-fitti/common/catalog';
import {
  ALL_SYSTEM_EXERCISES,
  getAllLocalizedExercises,
} from '@luki-fitti/common/catalog/extended';
import { SUPPORTED_LOCALES } from '@luki-fitti/common/enums';
import { EXERCISE_SEARCH_PHRASES, EXERCISE_SEARCH_SYNONYMS } from '@luki-fitti/common/utils/client';

const resource = (name: string) =>
  fileURLToPath(
    new URL(`../Packages/LukiFittiKit/Sources/LukiFittiModels/Resources/${name}`, import.meta.url),
  );
// Fixed so the generated file only changes when the catalog does.
const TIMESTAMP = '2026-10-19T00:00:00.000Z';

const catalog = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [
    locale,
    {
      exercises: getAllLocalizedExercises(locale),
      folders: buildStarterWorkouts({ locale, timestamp: TIMESTAMP }).folders,
      stretchingRoutines: buildStarterStretchingRoutines({ locale, timestamp: TIMESTAMP }),
    },
  ]),
);
const search = {
  phrases: EXERCISE_SEARCH_PHRASES.map(([pattern, replacement]) => ({ pattern, replacement })),
  synonyms: EXERCISE_SEARCH_SYNONYMS,
  /** Ranked first among equal matches: the everyday exercises of the starter workouts. */
  coreExerciseIds: INITIAL_EXERCISE_CATALOG.map((e) => e.id),
  /** Names in every language, for exercises whose name differs between languages. */
  exerciseNames: Object.fromEntries(
    ALL_SYSTEM_EXERCISES.map((e) => [e.id, getExerciseSearchNames(e)]).filter(
      ([, names]) => names.length > 1,
    ),
  ),
};

const outputs = {
  'starter_catalog.json': catalog,
  'retired_exercise_ids.json': RETIRED_EXERCISE_IDS,
  'exercise_search.json': search,
};
let outdated = false;
for (const [name, data] of Object.entries(outputs)) {
  const path = resource(name);
  // Formatted like the pre-commit hook formats JSON, so committing never changes the output.
  const content = await format(JSON.stringify(data), {
    ...(await resolveConfig(path)),
    filepath: path,
  });
  if (process.argv.includes('--check')) {
    const current = (() => {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return null;
      }
    })();
    if (current !== content) {
      console.error(`${name} is out of date. Run: yarn workspace @luki-fitti/apple catalog:export`);
      outdated = true;
    } else {
      console.log(`${name} is up to date.`);
    }
  } else {
    writeFileSync(path, content);
    console.log(`Wrote ${path}`);
  }
}
if (outdated) process.exit(1);
