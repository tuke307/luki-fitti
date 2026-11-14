#!/usr/bin/env node
/**
 * Exports the raid boss roster (recipes included) to a JSON fixture consumed by
 * the Swift SceneKit port. Run via `yarn raid:export`; `yarn raid:check`
 * verifies the checked-in file is up to date.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'src/raid/__fixtures__/raid-bosses.json');
const checkOnly = process.argv.includes('--check');

const { RAID_BOSSES, validateBossRecipe } = await import(join(root, 'dist/raid/raid-bosses.js'));

const problems = RAID_BOSSES.flatMap((boss) =>
  validateBossRecipe(boss).map((p) => `${boss.slug}: ${p}`),
);
if (problems.length) {
  console.error('invalid boss recipes:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}

const json = JSON.stringify(RAID_BOSSES, null, 2) + '\n';

if (checkOnly) {
  let current = null;
  try {
    current = readFileSync(outPath, 'utf8');
  } catch {
    /* missing file */
  }
  if (current !== json) {
    console.error(`${outPath} is stale — run \`yarn raid:export\``);
    process.exit(1);
  }
  console.log('raid-bosses.json is up to date');
} else {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, json);
  console.log(`wrote ${outPath}`);
}
