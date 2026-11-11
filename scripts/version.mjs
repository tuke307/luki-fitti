// Single source of truth for the app version across the monorepo.
//   node scripts/version.mjs get          → print the version (root package.json)
//   node scripts/version.mjs check        → fail unless every location agrees
//   node scripts/version.mjs set <x.y.z>  → write the version everywhere
// apps/apple/marketing/VERSION is owned by the marketing screenshots and not touched.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// LUKI_VERSION_ROOT is only for tests; normally this resolves to the repo root.
export const ROOT =
  process.env.LUKI_VERSION_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PACKAGE_JSONS = [
  'package.json',
  'apps/api/package.json',
  'apps/apple/package.json',
  'apps/email-worker/package.json',
  'apps/web/package.json',
  'packages/common/package.json',
  'packages/database/package.json',
  'packages/eslint-config/package.json',
  'packages/logger/package.json',
  'packages/typescript-config/package.json',
  'packages/ui/package.json',
];
const PROJECT_YML = 'apps/apple/project.yml';
const VERSION_SWIFT =
  'apps/apple/Packages/LukiFittiKit/Sources/LukiFittiModels/LukiFittiKitVersion.swift';
const SEMVER = /^\d+\.\d+\.\d+$/;

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// Read + write the "version" field via text so formatting and key order survive.
const pkgVersion = (rel) => read(rel).match(/"version":\s*"([^"]+)"/)?.[1];
const setPkgVersion = (rel, v) => {
  const text = read(rel);
  const out = text.replace(/("version":\s*")[^"]+(")/, `$1${v}$2`);
  if (out === text) return false;
  fs.writeFileSync(path.join(ROOT, rel), out);
  return true;
};
const ymlVersion = (rel) => read(rel).match(/MARKETING_VERSION:\s*"([^"]+)"/)?.[1];
const setYmlVersion = (rel, v) => {
  const text = read(rel);
  const out = text.replace(/(MARKETING_VERSION:\s*")[^"]+(")/, `$1${v}$2`);
  if (out === text) return false;
  fs.writeFileSync(path.join(ROOT, rel), out);
  return true;
};
const swiftVersion = (rel) => read(rel).match(/current\s*=\s*"([^"]+)"/)?.[1];
const setSwiftVersion = (rel, v) => {
  const text = read(rel);
  const out = text.replace(/(current\s*=\s*")[^"]+(")/, `$1${v}$2`);
  if (out === text) return false;
  fs.writeFileSync(path.join(ROOT, rel), out);
  return true;
};

export function getVersion() {
  return pkgVersion('package.json');
}

export function collectVersions() {
  return [
    ...PACKAGE_JSONS.map((f) => ({ file: f, version: pkgVersion(f) })),
    { file: `${PROJECT_YML} MARKETING_VERSION`, version: ymlVersion(PROJECT_YML) },
    { file: VERSION_SWIFT, version: swiftVersion(VERSION_SWIFT) },
  ];
}

export function setVersion(v) {
  if (!SEMVER.test(v)) throw new Error(`"${v}" is not a semver x.y.z`);
  const changed = [];
  for (const f of PACKAGE_JSONS) if (setPkgVersion(f, v)) changed.push(f);
  if (setYmlVersion(PROJECT_YML, v)) changed.push(`${PROJECT_YML} MARKETING_VERSION`);
  if (setSwiftVersion(VERSION_SWIFT, v)) changed.push(VERSION_SWIFT);
  return changed;
}

function cli() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'get') {
    console.log(getVersion());
  } else if (cmd === 'check') {
    const rows = collectVersions();
    const bad = rows.filter((r) => r.version !== rows[0].version);
    if (bad.length || !SEMVER.test(rows[0].version ?? '')) {
      console.error('version mismatch — run `yarn version:set x.y.z`:');
      for (const r of rows) console.error(`  ${r.version ?? 'MISSING'}\t${r.file}`);
      process.exit(1);
    }
    console.log(`version ${rows[0].version}`);
  } else if (cmd === 'set') {
    if (!arg) {
      console.error('usage: node scripts/version.mjs set <x.y.z>');
      process.exit(1);
    }
    const changed = setVersion(arg);
    console.log(
      changed.length ? `version ${arg} written to:` : `already at ${arg} — nothing changed`,
    );
    for (const f of changed) console.log(`  ${f}`);
  } else {
    console.error('usage: node scripts/version.mjs get|check|set <x.y.z>');
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    cli();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
