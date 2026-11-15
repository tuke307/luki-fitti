#!/usr/bin/env node
/**
 * Exports the notification category model to a JSON fixture consumed by the
 * Swift mirror in LukiFittiModels. Run via `yarn categories:export`;
 * `yarn categories:check` verifies the checked-in files are up to date.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'src/__fixtures__/notification-categories.json');
const swiftResources = join(
  root,
  '../../apps/apple/Packages/LukiFittiKit/Sources/LukiFittiModels/Resources',
);
const checkOnly = process.argv.includes('--check');

const { NOTIFICATION_CATEGORIES, PUSH_CAP_EXEMPT_KINDS, PUSH_DAILY_CAP, notificationCollapseKey } =
  await import(join(root, 'dist/notification-categories.js'));
const { NotificationKind } = await import(join(root, 'dist/enums/index.js'));

const fixture = {
  dailyCap: PUSH_DAILY_CAP,
  categories: NOTIFICATION_CATEGORIES.map((cat) => ({
    id: cat.id,
    pref: cat.pref,
    kinds: [...cat.kinds],
  })),
  capExemptKinds: [...PUSH_CAP_EXEMPT_KINDS].sort(),
  collapseKeys: Object.values(NotificationKind).map((kind) => ({
    kind,
    key: notificationCollapseKey(kind, {
      duelId: 'D1',
      raidId: 'R1',
      weekKey: 'W1',
    }),
  })),
};
const json = JSON.stringify(fixture, null, 2) + '\n';

const stale = (path) => {
  try {
    return readFileSync(path, 'utf8') !== json;
  } catch {
    return true;
  }
};

const targets = [outPath, join(swiftResources, 'notification_categories.json')];
if (checkOnly) {
  const bad = targets.filter(stale);
  if (bad.length) {
    console.error(`${bad.join(', ')} is stale — run \`yarn categories:export\``);
    process.exit(1);
  }
} else {
  for (const path of targets) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, json, 'utf8');
  }
  console.log(`wrote ${targets.join(', ')}`);
}
