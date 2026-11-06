#!/usr/bin/env node
// Converts a GymLife SQLite database (extracted as in docs/gymlife-import.md) into a
// `luki-fitti-import@1` file.
//
//   node scripts/import/gymlife-to-luki.mjs gymlife-extracted/gymlife_backup.sqlite \
//     [--map gymlife-extracted/mapping.json] > gymlife-extracted/luki-import.json
//
// `--list-exercises` instead prints the exercises the file references, for building a mapping.
// Requires Node >= 22.13 (`node:sqlite`). The input is private user data: keep it (and the
// output) inside the git-ignored gymlife-extracted/ folder and never commit it.
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import {
  createSlugResolver,
  importFile,
  loadMapping,
  parseArgs,
  validateImportFile,
} from './lib.mjs';

const USAGE =
  'Usage: gymlife-to-luki.mjs <gymlife.sqlite> [--map <mapping.json>] ' +
  '[--warmup-set-type <value>] [--list-exercises]';

const REQUIRED_TABLES = [
  'Exercise',
  'Training',
  'TrainingExercise',
  'GymSet',
  'TrainingLog',
  'TrainingExerciseLog',
  'GymSetLog',
];
const OPTIONAL_TABLES = ['PrimaryMuscleGroups', 'MuscleGroup'];

/**
 * Column names per table, verified against a real GymLife backup. Primary keys are named after
 * the table (`TrainingID`, `GymSetLogID`, …) except `Exercise.ID`. The alternatives cover other
 * spellings. A missing required column stops the conversion and lists the columns the table does
 * have, so the mapping can be adjusted here.
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
  setCount: ['NumberOfSets'],
  weight: ['Weight'],
  setType: ['SetType'],
  date: ['Date', 'StartDate'],
  duration: ['Duration'],
  isCompleted: ['IsCompleted'],
  trainingLogId: ['TrainingLogID', 'TrainingLogId'],
  trainingExerciseLogId: ['TrainingExerciseLogID', 'TrainingExerciseLogId'],
  exerciseCode: ['ExerciseCode'],
  isDefaultExercise: ['IsDefaultExercise'],
  equipmentId: ['EquipmentID', 'EquipmentId'],
  primaryMuscleGroupId: ['PrimaryMuscleGroupID', 'PrimaryMuscleGroupId'],
  muscleGroupId: ['MuscleGroupID', 'MuscleGroupId'],
  isStretching: ['IsStretching'],
  description: ['Description'],
};

/** GymLife muscle group ids → LukiFitti `MuscleGroup` (see the `MuscleGroup` table). */
const MUSCLE_GROUPS = {
  1: 'ABS_CORE',
  2: 'BICEPS',
  3: 'CALVES',
  4: 'CHEST',
  5: 'FOREARMS',
  6: 'GLUTES',
  7: 'HAMSTRINGS',
  8: 'FULL_BODY',
  9: 'BACK',
  10: 'SHOULDERS',
  11: 'ABS_CORE',
  12: 'QUADRICEPS',
  13: 'SHOULDERS',
  14: 'TRICEPS',
  15: 'BACK',
  16: 'BACK',
};

/** GymLife `EquipmentID` → LukiFitti `EquipmentType`. */
const EQUIPMENT = {
  1: 'BARBELL',
  2: 'CABLE',
  3: 'DUMBBELL',
  4: 'MACHINE',
  5: 'KETTLEBELL',
  7: 'BODYWEIGHT',
  11: 'BAND',
  12: 'FOAM_ROLLER',
};

function readTables(path) {
  let db;
  try {
    db = new DatabaseSync(path, { readOnly: true });
  } catch (error) {
    throw new Error(`Cannot open ${path}: ${error instanceof Error ? error.message : error}`);
  }
  try {
    const tables = {};
    for (const table of REQUIRED_TABLES) {
      try {
        tables[table] = db.prepare(`SELECT * FROM "${table}"`).all();
      } catch {
        throw new Error(
          `Missing table "${table}" in ${path} (expected: ${REQUIRED_TABLES.join(', ')})`,
        );
      }
    }
    for (const table of OPTIONAL_TABLES) {
      try {
        tables[table] = db.prepare(`SELECT * FROM "${table}"`).all();
      } catch {
        tables[table] = [];
      }
    }
    return tables;
  } finally {
    db.close();
  }
}

function column(rows, table, field, { required = true } = {}) {
  const sample = rows[0];
  if (!sample) return null;
  const candidates = field === 'id' ? [`${table}ID`, `${table}Id`, ...COLUMNS.id] : COLUMNS[field];
  const found = candidates.find((c) => c in sample);
  if (!found && required) {
    throw new Error(
      `Table ${table} has no ${candidates.join('/')} column (it has: ${Object.keys(sample).join(', ')})`,
    );
  }
  return found ?? null;
}

/** GymLife stores booleans as 0/1 and as 'true'/'false'. */
export const truthy = (value) => value === 1 || value === true || value === '1' || value === 'true';

function accessor(rows, table, fields, { optional = [], filterDeleted = true } = {}) {
  const cols = Object.fromEntries([
    ...fields.map((f) => [f, column(rows, table, f)]),
    ...optional.map((f) => [f, column(rows, table, f, { required: false })]),
  ]);
  const live = filterDeleted
    ? rows.filter((r) => !(cols.deleted && truthy(r[cols.deleted])))
    : rows;
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
/** By `OrderNumber`, then by id (set tables have no order column; ids follow insertion order). */
const byOrder = (get) => (a, b) =>
  (num(get(a, 'orderNumber')) ?? 0) - (num(get(b, 'orderNumber')) ?? 0) ||
  (num(get(a, 'id')) ?? 0) - (num(get(b, 'id')) ?? 0);
/** A set row with `NumberOfSets = n` stands for n identical sets. */
const expandSets = (rows, get) =>
  rows.flatMap((row) =>
    Array.from({ length: Math.round(inRange(get(row, 'setCount'), 1, 100) ?? 1) }, () => row),
  );
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

/** Builds the table accessors shared by the converter and `--list-exercises`. */
function buildAccessors(tables) {
  return {
    // Deleted exercises stay: history still references them.
    exercises: accessor(tables.Exercise, 'Exercise', ['id', 'name'], {
      optional: [
        'customName',
        'deleted',
        'exerciseCode',
        'isDefaultExercise',
        'equipmentId',
        'primaryMuscleGroupId',
        'isStretching',
        'description',
      ],
      filterDeleted: false,
    }),
    training: accessor(tables.Training, 'Training', ['id', 'name'], {
      optional: ['isFolder', 'parentId', 'orderNumber', 'deleted'],
    }),
    trainingExercise: accessor(
      tables.TrainingExercise,
      'TrainingExercise',
      ['id', 'trainingId', 'exerciseId'],
      { optional: ['orderNumber', 'restSeconds', 'deleted'] },
    ),
    gymSet: accessor(tables.GymSet, 'GymSet', ['trainingExerciseId'], {
      optional: ['id', 'reps', 'weight', 'setType', 'setCount', 'orderNumber', 'deleted'],
    }),
    trainingLog: accessor(tables.TrainingLog, 'TrainingLog', ['id', 'date'], {
      optional: ['name', 'trainingId', 'duration', 'isCompleted', 'deleted'],
    }),
    exerciseLog: accessor(
      tables.TrainingExerciseLog,
      'TrainingExerciseLog',
      ['id', 'trainingLogId', 'exerciseId'],
      { optional: ['orderNumber', 'restSeconds', 'duration', 'deleted'] },
    ),
    setLog: accessor(tables.GymSetLog, 'GymSetLog', ['trainingExerciseLogId'], {
      optional: ['id', 'reps', 'weight', 'setType', 'setCount', 'orderNumber', 'deleted'],
    }),
    primaryMuscles: (() => {
      const a = accessor(tables.PrimaryMuscleGroups, 'PrimaryMuscleGroups', [
        'exerciseId',
        'muscleGroupId',
      ]);
      a.byExercise = groupBy(a.rows, (r) => a.get(r, 'exerciseId'));
      return a;
    })(),
    muscleGroups: accessor(tables.MuscleGroup, 'MuscleGroup', ['id', 'name']),
  };
}

/** Completed, non-deleted logs (a missing IsCompleted counts as completed). */
const completedLogRows = (trainingLog) =>
  trainingLog.rows.filter((r) => {
    const completed = trainingLog.get(r, 'isCompleted');
    return completed === undefined || truthy(completed);
  });

/** GymLife muscle ids for an exercise: join table first, `PrimaryMuscleGroupID` as fallback. */
function muscleGroupIdOf(exercises, primaryMuscles, row) {
  const ids = (primaryMuscles.byExercise.get(String(exercises.get(row, 'id'))) ?? [])
    .map((r) => num(primaryMuscles.get(r, 'muscleGroupId')))
    .filter((n) => n !== undefined);
  if (ids.length > 0) return Math.min(...ids);
  return num(exercises.get(row, 'primaryMuscleGroupId'));
}

const primaryMuscleGroupOf = (exercises, primaryMuscles, row) =>
  MUSCLE_GROUPS[muscleGroupIdOf(exercises, primaryMuscles, row)] ?? 'FULL_BODY';

const customKeyOf = (exerciseId) => `gymlife:exercise:${exerciseId}`;

function customExerciseFor(exercises, primaryMuscles, row) {
  const instructions = String(exercises.get(row, 'description') ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((line) => line.slice(0, 1000));
  return defined({
    key: customKeyOf(exercises.get(row, 'id')),
    name:
      String(exercises.get(row, 'customName') || exercises.get(row, 'name') || '')
        .trim()
        .slice(0, 120) || 'Exercise',
    primaryMuscleGroup: primaryMuscleGroupOf(exercises, primaryMuscles, row),
    equipment: EQUIPMENT[num(exercises.get(row, 'equipmentId'))] ?? 'OTHER',
    exerciseType: truthy(exercises.get(row, 'isStretching')) ? 'STRETCHING' : 'STRENGTH',
    instructions: instructions.length > 0 ? instructions : undefined,
  });
}

/** Maps the tables to the import format. */
export function convertGymlife(tables, { resolver = null, warmupSetType = '1' } = {}) {
  const {
    exercises,
    training,
    trainingExercise,
    gymSet,
    trainingLog,
    exerciseLog,
    setLog,
    primaryMuscles,
  } = buildAccessors(tables);

  const exerciseById = new Map(exercises.rows.map((r) => [String(exercises.get(r, 'id')), r]));
  const usedCustom = new Map();
  const missingExerciseIds = new Set();
  const refFor = (exerciseId) => {
    const row = exerciseById.get(String(exerciseId));
    if (!row) {
      missingExerciseIds.add(String(exerciseId));
      return null;
    }
    const slug = resolver?.resolve(exercises.get(row, 'customName'), exercises.get(row, 'name'));
    if (slug) return { slug };
    usedCustom.set(String(exerciseId), row);
    return { customKey: customKeyOf(exerciseId) };
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
          const ref = refFor(trainingExercise.get(te, 'exerciseId'));
          const sets = expandSets(
            (setsByTemplateExercise.get(String(trainingExercise.get(te, 'id'))) ?? []).sort(
              byOrder(gymSet.get),
            ),
            gymSet.get,
          )
            .slice(0, 40)
            .map((s) => ({
              setType: setTypeOf(gymSet.get(s, 'setType')),
              weight: inRange(gymSet.get(s, 'weight'), 0, 1500) ?? null,
              reps: inRange(gymSet.get(s, 'reps'), 0, 200) ?? null,
              durationSeconds: null,
            }));
          if (!ref || sets.length === 0) return [];
          return [
            {
              exercise: ref,
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
  const sessions = completedLogRows(trainingLog).flatMap((r) => {
    const startedSec = num(trainingLog.get(r, 'date'));
    if (startedSec === undefined) return [];
    const id = String(trainingLog.get(r, 'id'));
    const logExercises = exercisesByLog.get(id) ?? [];
    // A broken log Duration (>24h or missing) falls back to the per-exercise durations.
    const exerciseDurationSum = logExercises.reduce(
      (sum, el) => sum + (num(exerciseLog.get(el, 'duration')) ?? 0),
      0,
    );
    const durationSeconds = Math.round(
      inRange(trainingLog.get(r, 'duration'), 0, 86_400) ??
        (exerciseDurationSum >= 1 && exerciseDurationSum <= 86_400 ? exerciseDurationSum : 0),
    );
    const startedAt = new Date(Math.round(startedSec * 1000));
    const trainingId = String(trainingLog.get(r, 'trainingId') ?? '');
    return [
      defined({
        key: `gymlife:log:${id}`,
        workoutName:
          String(trainingLog.get(r, 'name') || nameOfTraining.get(trainingId) || '')
            .trim()
            .slice(0, 160) || 'Workout',
        templateKey: templateKeys.get(trainingId),
        sessionType: 'STRENGTH',
        startedAt: startedAt.toISOString(),
        completedAt: new Date(startedAt.getTime() + durationSeconds * 1000).toISOString(),
        activeDurationSeconds: durationSeconds,
        exercises: logExercises
          .sort(byOrder(exerciseLog.get))
          .slice(0, 100)
          .flatMap((el, orderIndex) => {
            const ref = refFor(exerciseLog.get(el, 'exerciseId'));
            if (!ref) return [];
            const sets = expandSets(
              (setsByExerciseLog.get(String(exerciseLog.get(el, 'id'))) ?? []).sort(
                byOrder(setLog.get),
              ),
              setLog.get,
            )
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
            return [{ exercise: ref, orderIndex, sets }];
          }),
      }),
    ];
  });

  const customExercises = [...usedCustom.values()].map((row) =>
    customExerciseFor(exercises, primaryMuscles, row),
  );
  const customNames = [...usedCustom.values()].map((row) =>
    String(exercises.get(row, 'customName') || exercises.get(row, 'name') || '(unnamed)').trim(),
  );
  return {
    file: importFile('GymLife', { customExercises, folders, templates, sessions }),
    customNames: customNames.sort(),
    missingExerciseIds: [...missingExerciseIds].sort(),
  };
}

/**
 * Lists every exercise referenced by a template or a completed log, for building a name→slug
 * mapping (docs/gymlife-import.md).
 */
export function listExercises(tables) {
  const {
    exercises,
    training,
    trainingExercise,
    trainingLog,
    exerciseLog,
    primaryMuscles,
    muscleGroups,
  } = buildAccessors(tables);
  const muscleNames = new Map(
    muscleGroups.rows.map((r) => [
      num(muscleGroups.get(r, 'id')),
      String(muscleGroups.get(r, 'name') ?? ''),
    ]),
  );
  const exerciseById = new Map(exercises.rows.map((r) => [String(exercises.get(r, 'id')), r]));

  const templateIds = new Set(
    training.rows
      .filter((r) => !truthy(training.get(r, 'isFolder')))
      .map((r) => String(training.get(r, 'id'))),
  );
  const completedLogIds = new Set(
    completedLogRows(trainingLog).map((r) => String(trainingLog.get(r, 'id'))),
  );
  const templateUses = new Map();
  for (const te of trainingExercise.rows) {
    if (!templateIds.has(String(trainingExercise.get(te, 'trainingId')))) continue;
    const id = String(trainingExercise.get(te, 'exerciseId'));
    templateUses.set(id, (templateUses.get(id) ?? 0) + 1);
  }
  const sessionUses = new Map();
  for (const el of exerciseLog.rows) {
    if (!completedLogIds.has(String(exerciseLog.get(el, 'trainingLogId')))) continue;
    const id = String(exerciseLog.get(el, 'exerciseId'));
    sessionUses.set(id, (sessionUses.get(id) ?? 0) + 1);
  }

  const ids = new Set([...templateUses.keys(), ...sessionUses.keys()]);
  return [...ids]
    .map((id) => exerciseById.get(id))
    .filter(Boolean)
    .map((row) => {
      const id = String(exercises.get(row, 'id'));
      const code = num(exercises.get(row, 'exerciseCode'));
      const description = String(exercises.get(row, 'description') ?? '').trim();
      const builtInName = String(exercises.get(row, 'name') ?? '').trim();
      const name = String(exercises.get(row, 'customName') || builtInName).trim();
      const muscleIds = (primaryMuscles.byExercise.get(id) ?? [])
        .map((r) => num(primaryMuscles.get(r, 'muscleGroupId')))
        .filter((n) => n !== undefined)
        .sort((a, b) => a - b);
      return {
        id: num(id) ?? id,
        code: code ?? null,
        name: name || '(unnamed)',
        builtInName: builtInName || null,
        userCreated: code === undefined || !truthy(exercises.get(row, 'isDefaultExercise')),
        equipment: EQUIPMENT[num(exercises.get(row, 'equipmentId'))] ?? 'OTHER',
        primaryMuscleGroup: primaryMuscleGroupOf(exercises, primaryMuscles, row),
        gymlifeMuscleGroups: muscleIds.map((mid) => muscleNames.get(mid)).filter(Boolean),
        description: description ? description.replace(/\s*\r?\n\s*/g, ' / ').slice(0, 300) : null,
        templateUses: templateUses.get(id) ?? 0,
        sessionUses: sessionUses.get(id) ?? 0,
        deleted: truthy(exercises.get(row, 'deleted')),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || String(a.id).localeCompare(String(b.id)));
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  try {
    const { options, positional } = parseArgs(argv, {
      flags: ['map', 'warmup-set-type'],
      booleans: ['list-exercises'],
    });
    if (positional.length !== 1) throw new Error(USAGE);
    const tables = readTables(positional[0]);
    if (options['list-exercises']) {
      stdout.write(JSON.stringify(listExercises(tables), null, 2) + '\n');
      return 0;
    }
    const resolver = options.map ? createSlugResolver(loadMapping(options.map)) : null;
    const { file, customNames, missingExerciseIds } = convertGymlife(tables, {
      resolver,
      warmupSetType: options['warmup-set-type'] ?? '1',
    });
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
    if (missingExerciseIds.length > 0) {
      stderr.write(
        `Warning: ${missingExerciseIds.length} referenced exercise id(s) have no row in the ` +
          'Exercise table and were skipped.\n',
      );
    }
    if (customNames.length > 0) {
      stderr.write(
        'Imported as custom exercises (add them to --map to use a catalog exercise instead):\n' +
          customNames.map((n) => `  - ${n}`).join('\n') +
          '\n',
      );
    }
    stdout.write(JSON.stringify(file, null, 2) + '\n');
    return 0;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main();
}
