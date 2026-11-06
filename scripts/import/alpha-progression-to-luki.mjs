#!/usr/bin/env node
// Converts an Alpha Progression workout-history CSV export into a `luki-fitti-import@1` file.
//
//   node scripts/import/alpha-progression-to-luki.mjs history.csv --map mapping.json \
//     --tz Europe/Berlin > luki-import.json
//
// See docs/alpha-progression-import.md. Never commit export files or the converted output.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  assertTimeZone,
  createSlugResolver,
  finish,
  importFile,
  loadMapping,
  parseArgs,
  zonedTimeToUtc,
} from './lib.mjs';

const USAGE =
  'Usage: alpha-progression-to-luki.mjs <history.csv> --map <mapping.json> [--tz <IANA zone>]';

/** Splits one CSV line on `;` or tabs, honouring double quotes (`""` escapes a quote). */
export function splitCsvLine(line) {
  const delimiter = line.includes(';') ? ';' : '\t';
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      cells.push(cell.trim());
      cell = '';
    } else cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

/** `102,5` → 102.5, `+35` → 35 (added weight on a bodyweight exercise); empty → undefined. */
export function parseNumber(raw) {
  const cleaned = String(raw ?? '')
    .replace(/kg|lbs?/gi, '')
    .replace(/^\+/, '')
    .replace(/\+$/, '')
    .replace(',', '.')
    .trim();
  if (!cleaned) return undefined;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : undefined;
}

const SESSION_DATE = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/;
const DURATION = /^(\d+):(\d{2})/;
const EXERCISE_HEADER = /^\d+\.\s*(.+)$/;

/** Parses the history export into plain sessions (no mapping applied yet). */
export function parseAlphaProgressionCsv(text) {
  const sessions = [];
  let session = null;
  let exercise = null;
  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!rawLine.trim()) {
      exercise = null;
      continue;
    }
    const cells = splitCsvLine(rawLine);
    const [first = '', second = '', third = ''] = cells;
    const date = SESSION_DATE.exec(second);
    if (date && DURATION.test(third)) {
      const [, h, m] = DURATION.exec(third);
      session = {
        name: first || 'Workout',
        wallClock: {
          year: +date[1],
          month: +date[2],
          day: +date[3],
          hour: +date[4],
          minute: +date[5],
        },
        durationSeconds: +h * 3600 + +m * 60,
        exercises: [],
      };
      sessions.push(session);
      exercise = null;
      continue;
    }
    if (!session) continue;
    const header = EXERCISE_HEADER.exec(first);
    if (header && !/^\d+$/.test(first)) {
      const parts = header[1].split('·').map((p) => p.trim());
      const repsTarget = parts.length > 1 && /reps?$/i.test(parts.at(-1)) ? parts.pop() : null;
      const warmups = second
        .split(/<br\s*\/?>/i)
        .map((s) => s.split('·').map((p) => p.trim()))
        .filter((p) => /^WU\d+/i.test(p[0] ?? ''))
        .map((p) => ({
          weight: parseNumber(p[1]),
          weightUnit: /lbs?/i.test(p[1] ?? '') ? 'LBS' : 'KG',
          reps: parseNumber(p[2]?.replace(/reps?/i, '')),
        }));
      exercise = {
        name: parts[0],
        equipment: parts[1] ?? null,
        repsTarget,
        warmups,
        sets: [],
      };
      session.exercises.push(exercise);
      continue;
    }
    if (/^#$/.test(first)) continue; // column header `#;KG;REPS;RIR`
    if (exercise && /^\d+$/.test(first)) {
      const [, weight, reps, rir] = cells;
      exercise.sets.push({
        weight: parseNumber(weight),
        reps: parseNumber(reps),
        rir: parseNumber(rir),
      });
    }
  }
  return sessions;
}

const round = (value) => (value === undefined ? undefined : Math.round(value));
const defined = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));

/** Maps parsed sessions to the import format. RIR becomes RPE as `10 - RIR`. */
export function toImportFile(parsed, { resolver, timeZone }) {
  const sessions = parsed.map((s) => {
    const startedAt = zonedTimeToUtc(s.wallClock, timeZone);
    const completedAt = new Date(startedAt.getTime() + s.durationSeconds * 1000);
    return {
      key: `alpha-progression:${startedAt.toISOString()}:${s.name}`.slice(0, 120),
      workoutName: s.name.slice(0, 160),
      sessionType: 'STRENGTH',
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      activeDurationSeconds: Math.min(86_400, s.durationSeconds),
      exercises: s.exercises.flatMap((ex, orderIndex) => {
        const slug = resolver.resolve(
          ex.equipment ? `${ex.name} · ${ex.equipment}` : null,
          ex.name,
        );
        if (!slug) return [];
        const sets = [
          ...ex.warmups.map((w) => ({ ...w, setType: 'WARMUP' })),
          ...ex.sets.map((set) => ({
            weight: set.weight,
            weightUnit: 'KG',
            reps: set.reps,
            rpe: set.rir === undefined ? undefined : Math.min(10, Math.max(0, 10 - set.rir)),
            setType: 'WORKING',
          })),
        ].slice(0, 100);
        return [
          {
            exercise: { slug },
            orderIndex,
            sets: sets.map((set, i) =>
              defined({
                setNumber: i + 1,
                setType: set.setType,
                weight: set.weight,
                weightUnit: set.weightUnit,
                reps: round(set.reps),
                rpe: set.rpe,
                completed: true,
              }),
            ),
          },
        ];
      }),
    };
  });
  return importFile('Alpha Progression', { sessions });
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stderr = io.stderr ?? process.stderr;
  try {
    const { options, positional } = parseArgs(argv, { flags: ['map', 'tz'] });
    if (positional.length !== 1 || !options.map) throw new Error(USAGE);
    const timeZone = options.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    assertTimeZone(timeZone);
    const parsed = parseAlphaProgressionCsv(readFileSync(positional[0], 'utf8'));
    if (parsed.length === 0) throw new Error('No sessions found; is this the workout-history CSV?');
    const resolver = createSlugResolver(loadMapping(options.map));
    return await finish(toImportFile(parsed, { resolver, timeZone }), resolver, io);
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main();
}
