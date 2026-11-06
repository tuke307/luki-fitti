#!/usr/bin/env node
// Converts an Alpha Progression workout-history CSV export (English or German layout) and,
// optionally, its plans export into a `luki-fitti-import@1` file.
//
//   node scripts/import/alpha-progression-to-luki.mjs history.csv --plans Plans.csv \
//     --map mapping.json --tz Europe/Berlin > luki-import.json
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
  'Usage: alpha-progression-to-luki.mjs [<history.csv>] [--plans <plans.csv>] --map <mapping.json> ' +
  '[--tz <IANA zone>]';

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
const EXERCISE_HEADER = /^\d+\.\s*(.+)$/;
const REPS_TARGET = /(reps?|wdh\.?)$/i;
const lines = (text) => text.replace(/^\uFEFF/, '').split(/\r?\n/);

/** `1:05 Std.` / `1:02 hr` / `45 Min.` → seconds; anything else → undefined. */
export function parseDuration(raw) {
  const hm = /^(\d+):(\d{2})/.exec(raw);
  if (hm) return +hm[1] * 3600 + +hm[2] * 60;
  const min = /^(\d+)\s*min\.?$/i.exec(raw);
  return min ? +min[1] * 60 : undefined;
}

/** `3. Bench Press · Barbell · 8 reps` → name, equipment and the reps target (if any). */
function parseExerciseName(text) {
  const parts = text.split('·').map((p) => p.trim());
  const repsTarget = parts.length > 1 && REPS_TARGET.test(parts.at(-1)) ? parts.pop() : null;
  return { name: parts[0], equipment: parts[1] ?? null, repsTarget };
}

/**
 * Parses the history export into plain sessions (no mapping applied yet). Cardio blocks
 * (`#;KM;MIN.`) are skipped and reported through `warn`, `-;-` sets are dropped, and a set with
 * only one of weight/reps filled in stops the conversion.
 */
export function parseAlphaProgressionCsv(text, { warn = () => {} } = {}) {
  const sessions = [];
  let session = null;
  let exercise = null;
  for (const [index, rawLine] of lines(text).entries()) {
    if (!rawLine.trim()) {
      exercise = null;
      continue;
    }
    const cells = splitCsvLine(rawLine);
    const [first = '', second = '', third = ''] = cells;
    const date = SESSION_DATE.exec(second);
    const durationSeconds = parseDuration(third);
    if (date && durationSeconds !== undefined) {
      session = {
        name: first || 'Workout',
        wallClock: {
          year: +date[1],
          month: +date[2],
          day: +date[3],
          hour: +date[4],
          minute: +date[5],
        },
        durationSeconds,
        exercises: [],
      };
      sessions.push(session);
      exercise = null;
      continue;
    }
    if (!session) continue;
    const header = EXERCISE_HEADER.exec(first);
    if (header && !/^\d+$/.test(first)) {
      const warmups = second
        .split(/<br\s*\/?>/i)
        .map((s) => s.split('·').map((p) => p.trim()))
        .filter((p) => /^WU\d+/i.test(p[0] ?? ''))
        .map((p) => ({
          weight: parseNumber(p[1]),
          weightUnit: /lbs?/i.test(p[1] ?? '') ? 'LBS' : 'KG',
          reps: parseNumber(p[2]?.replace(/reps?/i, '')),
        }));
      exercise = { ...parseExerciseName(header[1]), warmups, weightUnit: 'KG', sets: [] };
      session.exercises.push(exercise);
      continue;
    }
    if (first === '#') {
      // Column header: `#;KG;REPS;RIR`, `#;KG;WDH` or, for cardio, `#;KM;MIN.`.
      if (!exercise) continue;
      if (/^KM$/i.test(second)) {
        exercise.cardio = true;
        warn(
          `Skipped cardio exercise "${exercise.name}" in "${session.name}" ` +
            `(line ${index + 1}): the import format has no distance field yet.`,
        );
      } else if (/^(KG|LBS?)$/i.test(second)) {
        exercise.weightUnit = /^KG$/i.test(second) ? 'KG' : 'LBS';
      } else {
        throw new Error(`Line ${index + 1}: unknown column header "${rawLine.trim()}"`);
      }
      continue;
    }
    if (exercise && /^\d+$/.test(first)) {
      if (exercise.cardio) continue;
      const [, weight, reps, rir] = cells;
      const dashes = [weight, reps].filter((v) => v === '-').length;
      if (dashes === 2) continue; // `-;-`: a planned set that was never done.
      if (dashes === 1) {
        throw new Error(
          `Line ${index + 1}: set ${first} of "${exercise.name}" in "${session.name}" is only ` +
            `partly filled in (${weight};${reps}). Complete or delete it in the export.`,
        );
      }
      exercise.sets.push({
        weight: parseNumber(weight),
        reps: parseNumber(reps),
        rir: rir === '-' ? undefined : parseNumber(rir),
      });
    }
  }
  for (const s of sessions) s.exercises = s.exercises.filter((e) => !e.cardio);
  return sessions;
}

const firstInt = (raw) => {
  const match = /^(\d+)/.exec(String(raw ?? '').trim());
  return match ? +match[1] : undefined;
};

/**
 * Parses the plans export: a `"<plan>";"<date>"` row per plan, `"Tag <n>"` (or `"Day <n>"`) rows
 * per day, and `"<n>. <exercise> · <equipment>";"<sets> Sätze";"<reps> Wdh"` rows.
 */
export function parseAlphaProgressionPlans(text) {
  const plans = [];
  let plan = null;
  let day = null;
  for (const [index, rawLine] of lines(text).entries()) {
    if (!rawLine.trim()) continue;
    const cells = splitCsvLine(rawLine);
    const fail = (why) => {
      throw new Error(`Plans line ${index + 1}: ${why} ("${rawLine.trim()}")`);
    };
    if (cells.length === 2) {
      plan = { name: cells[0] || 'Plan', date: cells[1], days: [] };
      plans.push(plan);
      day = null;
    } else if (cells.length === 1) {
      if (!plan) fail('a day row needs a plan row before it');
      if (!/^(Tag|Day)\b/i.test(cells[0])) fail('expected a "Tag …" day row');
      day = { name: cells[0], exercises: [] };
      plan.days.push(day);
    } else if (cells.length === 3) {
      if (!day) fail('an exercise row needs a "Tag …" row before it');
      const header = EXERCISE_HEADER.exec(cells[0]);
      const sets = firstInt(cells[1]);
      const reps = firstInt(cells[2]);
      if (!header || !sets || reps === undefined)
        fail('expected "<n>. <exercise>";"<sets>";"<reps>"');
      const { name, equipment } = parseExerciseName(header[1]);
      day.exercises.push({ name, equipment, sets: Math.min(40, sets), reps: Math.min(200, reps) });
    } else {
      fail('unexpected number of columns');
    }
  }
  return plans;
}

// The plans export has no rest times; this matches the app's default rest.
const DEFAULT_REST_SECONDS = 90;

/** Plans become one folder each, with one workout (template) per day. */
function plansToTemplates(plans, resolver) {
  const folders = [];
  const templates = [];
  const seen = new Set();
  for (const [planIndex, plan] of plans.entries()) {
    const folderKey = `alpha-progression:plan:${plan.name}`.slice(0, 120);
    if (seen.has(folderKey)) throw new Error(`Two plans are named "${plan.name}"; rename one.`);
    seen.add(folderKey);
    folders.push({ key: folderKey, name: plan.name.slice(0, 80), sortOrder: planIndex });
    for (const [dayIndex, day] of plan.days.entries()) {
      const key = `alpha-progression:plan:${plan.name}:${day.name}`.slice(0, 120);
      if (seen.has(key)) throw new Error(`Plan "${plan.name}" has two days named "${day.name}".`);
      seen.add(key);
      templates.push({
        key,
        folderKey,
        name: day.name.slice(0, 100),
        sortOrder: dayIndex,
        exercises: day.exercises.slice(0, 60).flatMap((ex, orderIndex) => {
          const slug = resolver.resolve(
            ex.equipment ? `${ex.name} · ${ex.equipment}` : null,
            ex.name,
          );
          if (!slug) return [];
          const sets = Array.from({ length: ex.sets }, () => ({
            setType: 'WORKING',
            weight: null,
            reps: ex.reps,
            durationSeconds: null,
          }));
          return [{ exercise: { slug }, orderIndex, restSeconds: DEFAULT_REST_SECONDS, sets }];
        }),
      });
    }
  }
  return { folders, templates };
}

const round = (value) => (value === undefined ? undefined : Math.round(value));
const defined = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));

/** Maps parsed sessions (and plans) to the import format. RIR becomes RPE as `10 - RIR`. */
export function toImportFile(parsed, { resolver, timeZone, plans = [] }) {
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
            weightUnit: ex.weightUnit,
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
  return importFile('Alpha Progression', { ...plansToTemplates(plans, resolver), sessions });
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stderr = io.stderr ?? process.stderr;
  try {
    const { options, positional } = parseArgs(argv, { flags: ['map', 'tz', 'plans'] });
    const history = positional[0];
    if (positional.length > 1 || (!history && !options.plans) || !options.map) {
      throw new Error(USAGE);
    }
    const timeZone = options.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    assertTimeZone(timeZone);
    const warn = (message) => stderr.write(`Warning: ${message}\n`);
    const parsed = history ? parseAlphaProgressionCsv(readFileSync(history, 'utf8'), { warn }) : [];
    if (history && parsed.length === 0) {
      throw new Error('No sessions found; is this the workout-history CSV?');
    }
    const plans = options.plans
      ? parseAlphaProgressionPlans(readFileSync(options.plans, 'utf8'))
      : [];
    if (options.plans && plans.length === 0) {
      throw new Error('No plans found; is this the plans CSV?');
    }
    const resolver = createSlugResolver(loadMapping(options.map));
    return await finish(toImportFile(parsed, { resolver, timeZone, plans }), resolver, io);
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main();
}
