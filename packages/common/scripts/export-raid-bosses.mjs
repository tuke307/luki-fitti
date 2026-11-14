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
const vectorsPath = join(root, 'src/raid/__fixtures__/raid-boss-vectors.json');
const swiftResources = join(
  root,
  '../../apps/apple/Packages/LukiFittiKit/Sources/LukiFittiModels/Resources',
);
const checkOnly = process.argv.includes('--check');

const { RAID_BOSSES, validateBossRecipe, bossBounds, raidPhaseFor } = await import(
  join(root, 'dist/raid/raid-bosses.js')
);

const problems = RAID_BOSSES.flatMap((boss) =>
  validateBossRecipe(boss).map((p) => `${boss.slug}: ${p}`),
);
if (problems.length) {
  console.error('invalid boss recipes:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}

const json = JSON.stringify(RAID_BOSSES, null, 2) + '\n';

// Expected values for the Swift fixture tests: bounds (at the default −18° yaw)
// and phase transitions, exported from the TS implementation so the port is
// checked against the same numbers.
const vectors = {
  bounds: Object.fromEntries(
    RAID_BOSSES.map((boss) => {
      const b = bossBounds(boss, -0.32);
      return [
        boss.slug,
        {
          center: b.center,
          radius: b.radius,
          halfWidth: b.halfWidth,
          halfHeight: b.halfHeight,
        },
      ];
    }),
  ),
  phases: [0, 100, 500, 1100, 1600, 1900, 2000].map((damage) => ({
    damage,
    maxHp: 2000,
    phase: raidPhaseFor(damage, 2000),
  })),
};
const vectorsJson = JSON.stringify(vectors, null, 2) + '\n';

const stale = (path, json) => {
  try {
    return readFileSync(path, 'utf8') !== json;
  } catch {
    return true;
  }
};

if (checkOnly) {
  const targets = [
    [outPath, json],
    [vectorsPath, vectorsJson],
    [join(swiftResources, 'raid_bosses.json'), json],
    [join(swiftResources, 'raid_boss_vectors.json'), vectorsJson],
  ];
  const bad = targets.filter(([path, j]) => stale(path, j)).map(([path]) => path);
  if (bad.length) {
    console.error(`${bad.join(', ')} is stale — run \`yarn raid:export\``);
    process.exit(1);
  }
  console.log('raid boss fixtures are up to date');
} else {
  mkdirSync(dirname(outPath), { recursive: true });
  mkdirSync(swiftResources, { recursive: true });
  writeFileSync(outPath, json);
  writeFileSync(vectorsPath, vectorsJson);
  writeFileSync(join(swiftResources, 'raid_bosses.json'), json);
  writeFileSync(join(swiftResources, 'raid_boss_vectors.json'), vectorsJson);
  console.log(`wrote ${outPath} (+ vectors, copied to LukiFittiKit resources)`);
}
