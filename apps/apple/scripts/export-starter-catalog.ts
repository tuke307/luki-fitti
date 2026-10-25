/**
 * Generates the bundled iOS/watchOS starter catalog from `@luki-fitti/common/catalog`, the single
 * source of the built-in exercises, starter workouts and stretching routines (all languages).
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
  getLocalizedExerciseCatalog,
} from '@luki-fitti/common/catalog';
import { SUPPORTED_LOCALES } from '@luki-fitti/common/enums';

const OUTPUT = fileURLToPath(
  new URL(
    '../Packages/LukiFittiKit/Sources/LukiFittiModels/Resources/starter_catalog.json',
    import.meta.url,
  ),
);
// Fixed so the generated file only changes when the catalog does.
const TIMESTAMP = '2026-10-19T00:00:00.000Z';

const catalog = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [
    locale,
    {
      exercises: getLocalizedExerciseCatalog(locale),
      folders: buildStarterWorkouts({ locale, timestamp: TIMESTAMP }).folders,
      stretchingRoutines: buildStarterStretchingRoutines({ locale, timestamp: TIMESTAMP }),
    },
  ]),
);
// Formatted like the pre-commit hook formats JSON, so committing never changes the output.
const content = await format(JSON.stringify(catalog), {
  ...(await resolveConfig(OUTPUT)),
  filepath: OUTPUT,
});

if (process.argv.includes('--check')) {
  if (readFileSync(OUTPUT, 'utf8') !== content) {
    console.error(
      'starter_catalog.json is out of date. Run: yarn workspace @luki-fitti/apple catalog:export',
    );
    process.exit(1);
  }
  console.log('starter_catalog.json is up to date.');
} else {
  writeFileSync(OUTPUT, content);
  console.log(`Wrote ${OUTPUT}`);
}
