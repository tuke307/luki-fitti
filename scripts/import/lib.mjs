// Shared helpers for the converters that turn other apps' exports into a `luki-fitti-import@1`
// file (see docs/import-format.md). Node built-ins only.
import { readFileSync } from 'node:fs';

export const IMPORT_FORMAT = 'luki-fitti-import@1';

/** Minimal `--flag value` / positional parser. */
export function parseArgs(argv, { flags = [], booleans = [] } = {}) {
  const options = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (booleans.includes(name)) options[name] = true;
    else if (flags.includes(name) && i + 1 < argv.length) options[name] = argv[++i];
    else throw new Error(`Unknown or incomplete option ${arg}`);
  }
  return { options, positional };
}

/**
 * Exercise name → catalog slug mapping (JSON object). Keys are matched case-insensitively and
 * with collapsed whitespace; values must be slugs from the exercise catalog.
 */
export function loadMapping(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('The mapping file must be a JSON object of "exercise name": "catalog-slug"');
  }
  const map = new Map();
  for (const [name, slug] of Object.entries(raw)) {
    if (typeof slug !== 'string' || !slug.trim())
      throw new Error(`Mapping for "${name}" is not a slug`);
    map.set(normalizeName(name), slug.trim());
  }
  return map;
}

export const normalizeName = (name) => String(name).trim().replace(/\s+/g, ' ').toLowerCase();

/** Looks names up in the mapping and remembers the ones that are missing. */
export function createSlugResolver(mapping) {
  const unmapped = new Set();
  return {
    resolve(...candidates) {
      for (const name of candidates) {
        if (!name) continue;
        const slug = mapping.get(normalizeName(name));
        if (slug) return slug;
      }
      unmapped.add(candidates.find(Boolean) ?? '(unnamed)');
      return null;
    },
    unmapped: () => [...unmapped].sort(),
  };
}

/** Offset (ms) of `timeZone` from UTC at the instant `ms`. */
function zoneOffsetMs(ms, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour,
    +parts.minute,
    +parts.second,
  );
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Interprets a naive wall-clock time in `timeZone` (IANA name) and returns the UTC instant. */
export function zonedTimeToUtc({ year, month, day, hour = 0, minute = 0 }, timeZone) {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  let ms = naive - zoneOffsetMs(naive, timeZone);
  ms = naive - zoneOffsetMs(ms, timeZone);
  return new Date(ms);
}

export function assertTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    throw new Error(`Unknown time zone "${timeZone}" (use an IANA name such as Europe/Berlin)`);
  }
}

/** Builds the file skeleton. */
export function importFile(
  app,
  { customExercises = [], folders = [], templates = [], sessions = [] },
) {
  return {
    format: IMPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    source: { app, note: 'Converted with scripts/import' },
    customExercises,
    folders,
    templates,
    sessions,
  };
}

/**
 * Validates with the shared schema when packages/common is built (`yarn workspace
 * @luki-fitti/common build`); otherwise the in-app preview validates the file before importing.
 * Returns the issues, or `null` when the schema isn't available.
 */
export async function validateImportFile(file) {
  let schemas;
  try {
    schemas = await import(
      new URL('../../packages/common/dist/schemas/index.js', import.meta.url).href
    );
  } catch {
    return null;
  }
  const result = schemas.ImportFileSchema.safeParse(file);
  return result.success ? [] : schemas.formatImportIssues(result.error);
}

/** Shared CLI tail: report unmapped names, validate, print the file. */
export async function finish(
  file,
  resolver,
  { stdout = process.stdout, stderr = process.stderr } = {},
) {
  const unmapped = resolver.unmapped();
  if (unmapped.length > 0) {
    stderr.write(
      `These exercise names have no entry in the mapping file (add "name": "catalog-slug"):\n` +
        unmapped.map((n) => `  - ${n}`).join('\n') +
        '\n',
    );
    return 1;
  }
  const issues = await validateImportFile(file);
  if (issues === null) {
    stderr.write(
      'Note: packages/common is not built, so the file was not validated here. ' +
        'The app validates it in the import preview.\n',
    );
  } else if (issues.length > 0) {
    stderr.write(
      'The converted file does not validate:\n' +
        issues.map((i) => `  - ${i.path || '(file)'}: ${i.message}`).join('\n') +
        '\n',
    );
    return 1;
  }
  stdout.write(JSON.stringify(file, null, 2) + '\n');
  return 0;
}
