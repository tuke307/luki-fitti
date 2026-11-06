#!/usr/bin/env node
// Converts the GymLife tables extracted in docs/gymlife-import.md (`json-tables/*.json`, one
// `sqlite3 -json` dump per table) into a `luki-fitti-import@1` file.
//
//   node scripts/import/gymlife-to-luki.mjs gymlife-extracted/json-tables --map mapping.json \
//     > gymlife-extracted/luki-import.json
//
// The input is private user data: keep it (and the output) inside the git-ignored
// gymlife-extracted/ folder and never commit it.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSlugResolver, finish, importFile, loadMapping, parseArgs } from './lib.mjs';

const USAGE =
  'Usage: gymlife-to-luki.mjs <json-tables dir> --map <mapping.json> [--warmup-set-type <value>]';

/**
 * Column names per table. The documented ones come first; the alternatives cover the spellings
 * seen in different GymLife versions. A missing required column stops the conversion and lists
 * the columns the table does have, so the mapping can be adjusted here.
 */
const COLUMNS = {
  id: ['ID', 'Id', 'id'],
  name: ['Name'],
  customName: ['CustomName'],
  deleted: ['Deleted', 'IsDeleted'],
  isFolder: ['IsFolder'],
  parentId: ['ParentID', 'ParentId'],
  orderNumber: ['OrderNumber', 'Order', 'SortOrder'],
  trainingId: ['TrainingID', 'TrainingId'],
  exerciseId: ['ExerciseID', 'ExerciseId'],
  restSeconds: ['RestSeconds', 'Rest'],
  trainingExerciseId: ['TrainingExerciseID', 'TrainingExerciseId'],
  reps: ['NumberOfRepetitions', 'Repetitions', 'Reps'],
  weight: ['Weight'],
  setType: ['SetType'],
  date: ['Date', 'StartDate'],
  duration: ['Duration'],
  isCompleted: ['IsCompleted'],
  trainingLogId: ['TrainingLogID', 'TrainingLogId'],
  trainingExerciseLogId: ['TrainingExerciseLogID', 'TrainingExerciseLogId'],
};

function readTable(dir, table) {
  const path = join(dir, `${table}.json`);
  if (!existsSync(path)) throw new Error(`Missing ${table}.json in ${dir}`);
  const text = readFileSync(path, 'utf8').trim();
  return text ? JSON.parse(text) : [];
}

function column(rows, table, field, { required = true } = {}) {
  const sample = rows[0];
  if (!sample) return null;
  const found = COLUMNS[field].find((c) => c in sample);
  if (!found && required) {
    throw new Error(
      `${table}.json has no ${COLUMNS[field].join('/')} column (it has: ${Object.keys(sample).join(', ')})`,
    );
  }
  return found ?? null;
}

/** GymLife stores booleans as 0/1 and as 'true'/'false'. */
export const truthy = (value) => value === 1 || value === true || value === '1' || value === 'true';

function accessor(rows, table, fields, optional = []) {
  const cols = Object.fromEntries([
    ...fields.map((f) => [f, column(rows, table, f)]),
    ...optional.map((f) => [f, column(rows, table, f, { required: false })]),
  ]);
  const live = rows.filter((r) => !(cols.deleted && truthy(r[cols.deleted])));
  return { rows: live, get: (row, field) => (cols[field] ? row[cols[field]] : undefined) };
}

const num = (value) => {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};
const inRange = (value, min, max) => {
  const n = num(value);
  return n !== undefined && n >= min && n <= max ? n : undefined;
};
const byOrder = (get) => (a, b) =>
  (num(get(a, 'orderNumber')) ?? 0) - (num(get(b, 'orderNumber')) ?? 0);
const groupBy = (rows, key) => {
  const map = new Map();
  for (const row of rows) {
    const k = String(key(row));
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return map;
};
const defined = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));

/** Maps the tables to the import format. */
export function convertGymlife(dir, { resolver, warmupSetType = '1' }) {
  const exercises = accessor(
    readTable(dir, 'Exercise'),
    'Exercise',
    ['id', 'name'],
    ['customName', 'deleted'],
  );
  const training = accessor(
    readTable(dir, 'Training'),
    'Training',
    ['id', 'name'],
    ['isFolder', 'parentId', 'orderNumber', 'deleted'],
  );
  const trainingExercise = accessor(
    readTable(dir, 'TrainingExercise'),
    'TrainingExercise',
    ['id', 'trainingId', 'exerciseId'],
    ['orderNumber', 'restSeconds', 'deleted'],
  );
  const gymSet = accessor(
    readTable(dir, 'GymSet'),
    'GymSet',
    ['trainingExerciseId'],
    ['reps', 'weight', 'setType', 'orderNumber', 'deleted'],
  );
  const trainingLog = accessor(
    readTable(dir, 'TrainingLog'),
    'TrainingLog',
    ['id', 'date'],
    ['name', 'trainingId', 'duration', 'isCompleted', 'deleted'],
  );
  const exerciseLog = accessor(
    readTable(dir, 'TrainingExerciseLog'),
    'TrainingExerciseLog',
    ['id', 'trainingLogId', 'exerciseId'],
    ['orderNumber', 'restSeconds', 'deleted'],
  );
  const setLog = accessor(
    readTable(dir, 'GymSetLog'),
    'GymSetLog',
    ['trainingExerciseLogId'],
    ['reps', 'weight', 'setType', 'orderNumber', 'deleted'],
  );

  const exerciseById = new Map(exercises.rows.map((r) => [String(exercises.get(r, 'id')), r]));
  const slugFor = (exerciseId) => {
    const row = exerciseById.get(String(exerciseId));
    if (!row) return null;
    return resolver.resolve(exercises.get(row, 'customName'), exercises.get(row, 'name'));
  };
  const setTypeOf = (value) =>
    String(value ?? '')
      .toLowerCase()
      .includes('warm') || String(value) === String(warmupSetType)
      ? 'WARMUP'
      : 'WORKING';

  const folderRows = training.rows.filter((r) => truthy(training.get(r, 'isFolder')));
  const folderKeys = new Map(
    folderRows.map((r) => [
      String(training.get(r, 'id')),
      `gymlife:folder:${training.get(r, 'id')}`,
    ]),
  );
  const usedFolderNames = new Set();
  const folders = folderRows.sort(byOrder(training.get)).flatMap((r, i) => {
    let name =
      String(training.get(r, 'name') ?? '')
        .trim()
        .slice(0, 80) || 'GymLife';
    for (let n = 2; usedFolderNames.has(name); n++) name = `${name.slice(0, 75)} (${n})`;
    usedFolderNames.add(name);
    return [{ key: folderKeys.get(String(training.get(r, 'id'))), name, sortOrder: i }];
  });

  const setsByTemplateExercise = groupBy(gymSet.rows, (r) => gymSet.get(r, 'trainingExerciseId'));
  const exercisesByTraining = groupBy(trainingExercise.rows, (r) =>
    trainingExercise.get(r, 'trainingId'),
  );
  const templateRows = training.rows.filter((r) => !truthy(training.get(r, 'isFolder')));
  const templateKeys = new Map(
    templateRows.map((r) => [
      String(training.get(r, 'id')),
      `gymlife:training:${training.get(r, 'id')}`,
    ]),
  );
  const templates = templateRows.sort(byOrder(training.get)).map((r, i) => {
    const id = String(training.get(r, 'id'));
    const parent = String(training.get(r, 'parentId') ?? '');
    return defined({
      key: templateKeys.get(id),
      folderKey: folderKeys.get(parent),
      name:
        String(training.get(r, 'name') ?? '')
          .trim()
          .slice(0, 100) || 'Workout',
      sortOrder: i,
      exercises: (exercisesByTraining.get(id) ?? [])
        .sort(byOrder(trainingExercise.get))
        .slice(0, 60)
        .flatMap((te, orderIndex) => {
          const slug = slugFor(trainingExercise.get(te, 'exerciseId'));
          const sets = (setsByTemplateExercise.get(String(trainingExercise.get(te, 'id'))) ?? [])
            .sort(byOrder(gymSet.get))
            .slice(0, 40)
            .map((s) => ({
              setType: setTypeOf(gymSet.get(s, 'setType')),
              weight: inRange(gymSet.get(s, 'weight'), 0, 1500) ?? null,
              reps: inRange(gymSet.get(s, 'reps'), 0, 200) ?? null,
              durationSeconds: null,
            }));
          if (!slug || sets.length === 0) return [];
          return [
            {
              exercise: { slug },
              orderIndex,
              sets,
              restSeconds: Math.round(
                inRange(trainingExercise.get(te, 'restSeconds'), 0, 900) ?? 90,
              ),
            },
          ];
        }),
    });
  });

  const nameOfTraining = new Map(
    training.rows.map((r) => [String(training.get(r, 'id')), training.get(r, 'name')]),
  );
  const exercisesByLog = groupBy(exerciseLog.rows, (r) => exerciseLog.get(r, 'trainingLogId'));
  const setsByExerciseLog = groupBy(setLog.rows, (r) => setLog.get(r, 'trainingExerciseLogId'));
  const sessions = trainingLog.rows
    .filter((r) => {
      const completed = trainingLog.get(r, 'isCompleted');
      return completed === undefined || truthy(completed);
    })
    .flatMap((r) => {
      const startedSec = num(trainingLog.get(r, 'date'));
      if (startedSec === undefined) return [];
      const durationSeconds = Math.round(inRange(trainingLog.get(r, 'duration'), 0, 86_400) ?? 0);
      const startedAt = new Date(Math.round(startedSec * 1000));
      const trainingId = String(trainingLog.get(r, 'trainingId') ?? '');
      const id = String(trainingLog.get(r, 'id'));
      return [
        defined({
          key: `gymlife:log:${id}`,
          workoutName:
            String(trainingLog.get(r, 'name') ?? nameOfTraining.get(trainingId) ?? '')
              .trim()
              .slice(0, 160) || 'Workout',
          templateKey: templateKeys.get(trainingId),
          sessionType: 'STRENGTH',
          startedAt: startedAt.toISOString(),
          completedAt: new Date(startedAt.getTime() + durationSeconds * 1000).toISOString(),
          activeDurationSeconds: durationSeconds,
          exercises: (exercisesByLog.get(id) ?? [])
            .sort(byOrder(exerciseLog.get))
            .slice(0, 100)
            .flatMap((el, orderIndex) => {
              const slug = slugFor(exerciseLog.get(el, 'exerciseId'));
              if (!slug) return [];
              const sets = (setsByExerciseLog.get(String(exerciseLog.get(el, 'id'))) ?? [])
                .sort(byOrder(setLog.get))
                .slice(0, 100)
                .map((s, i) =>
                  defined({
                    setNumber: i + 1,
                    setType: setTypeOf(setLog.get(s, 'setType')),
                    weight: inRange(setLog.get(s, 'weight'), 0, 1500),
                    weightUnit: 'KG',
                    reps: inRange(setLog.get(s, 'reps'), 0, 1000),
                    completed: true,
                  }),
                );
              return [{ exercise: { slug }, orderIndex, sets }];
            }),
        }),
      ];
    });

  return importFile('GymLife', { folders, templates, sessions });
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stderr = io.stderr ?? process.stderr;
  try {
    const { options, positional } = parseArgs(argv, { flags: ['map', 'warmup-set-type'] });
    if (positional.length !== 1 || !options.map) throw new Error(USAGE);
    const resolver = createSlugResolver(loadMapping(options.map));
    const file = convertGymlife(positional[0], {
      resolver,
      warmupSetType: options['warmup-set-type'] ?? '1',
    });
    return await finish(file, resolver, io);
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main();
}
