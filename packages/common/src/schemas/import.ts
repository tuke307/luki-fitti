import { z } from 'zod';
import {
  EquipmentType,
  ExerciseType,
  Laterality,
  MovementPattern,
  MuscleGroup,
  SessionType,
  SetType,
  WeightUnit,
} from '../enums';
import { TemplateSetSchema } from './index';

// ─────────────────────────────────────────────────────────────────────────────
// File import / backup format `luki-fitti-import@1` (see docs/import-format.md).
// The file is the only way to bring data in: converters for other apps and the app's own
// backup export both write it, and `POST /api/import/{preview,commit}` read it.
// ─────────────────────────────────────────────────────────────────────────────

export const IMPORT_FORMAT = 'luki-fitti-import@1';
/** Upload limit for an import file, enforced by the clients and the API body parser. */
export const IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const IMPORT_LIMITS = {
  customExercises: 1_000,
  folders: 200,
  templates: 2_000,
  sessions: 10_000,
  totalSets: 200_000,
  exercisesPerTemplate: 60,
  exercisesPerSession: 100,
  setsPerExercise: 100,
  issues: 50,
} as const;

const MIN_DATE_MS = Date.UTC(2000, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;

const ImportKeySchema = z.string().min(1).max(120);
const text = (max: number) => z.string().trim().min(1).max(max);
const ImportDateSchema = z.iso.datetime({ offset: true }).refine((value) => {
  const ms = Date.parse(value);
  return ms >= MIN_DATE_MS && ms <= Date.now() + DAY_MS;
}, 'Date must be between 2000-01-01 and tomorrow');

/** System exercises are referenced by catalog slug, custom exercises by their key in the file. */
export const ImportExerciseRefSchema = z.union([
  z.strictObject({ slug: z.string().min(1).max(200) }),
  z.strictObject({ customKey: ImportKeySchema }),
]);

export const ImportCustomExerciseSchema = z.strictObject({
  key: ImportKeySchema,
  name: text(120),
  primaryMuscleGroup: z.enum(MuscleGroup),
  equipment: z.enum(EquipmentType),
  exerciseType: z.enum(ExerciseType),
  movementPattern: z.enum(MovementPattern).optional(),
  laterality: z.enum(Laterality).optional(),
  description: z.string().trim().max(2000).optional(),
  instructions: z.array(text(1000)).max(30).optional(),
});

export const ImportFolderSchema = z.strictObject({
  key: ImportKeySchema,
  name: text(80),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
});

// Lazy because `./index` re-exports this module (circular import).
const ImportTemplateSetSchema = z.lazy(() => TemplateSetSchema.strict());

export const ImportTemplateExerciseSchema = z.strictObject({
  exercise: ImportExerciseRefSchema,
  orderIndex: z.number().int().min(0).max(1_000),
  sets: z.array(ImportTemplateSetSchema).min(1).max(40),
  restSeconds: z.number().int().min(0).max(900),
  alternativeExercises: z.array(ImportExerciseRefSchema).max(20).optional(),
});

export const ImportTemplateSchema = z.strictObject({
  key: ImportKeySchema,
  folderKey: ImportKeySchema.optional(),
  name: text(100),
  description: z.string().trim().max(500).optional(),
  estimatedDurationMinutes: z.number().int().min(5).max(360).optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
  exercises: z.array(ImportTemplateExerciseSchema).max(IMPORT_LIMITS.exercisesPerTemplate),
});

export const ImportSessionSetSchema = z.strictObject({
  setNumber: z.number().int().min(1).max(IMPORT_LIMITS.setsPerExercise),
  setType: z.enum(SetType),
  weight: z.number().min(0).max(1500).optional(),
  weightUnit: z.enum(WeightUnit),
  reps: z.number().int().min(0).max(1000).optional(),
  durationSeconds: z.number().int().min(0).max(86_400).optional(),
  rpe: z.number().min(0).max(10).optional(),
  completed: z.boolean(),
});

export const ImportSessionExerciseSchema = z.strictObject({
  exercise: ImportExerciseRefSchema,
  orderIndex: z.number().int().min(0).max(1_000),
  restSeconds: z.number().int().min(0).max(1800).optional(),
  sets: z.array(ImportSessionSetSchema).max(IMPORT_LIMITS.setsPerExercise),
});

export const ImportSessionSchema = z.strictObject({
  key: ImportKeySchema,
  workoutName: text(160),
  templateKey: ImportKeySchema.optional(),
  sessionType: z.enum(SessionType).optional(),
  startedAt: ImportDateSchema,
  completedAt: ImportDateSchema,
  activeDurationSeconds: z.number().int().min(0).max(86_400).optional(),
  notes: z.string().trim().max(2000).optional(),
  exercises: z.array(ImportSessionExerciseSchema).max(IMPORT_LIMITS.exercisesPerSession),
});

function addDuplicateKeyIssues(
  ctx: z.RefinementCtx,
  list: string,
  items: Array<{ key: string }>,
  field: 'key' | 'name' = 'key',
) {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const value = (item as Record<string, unknown>)[field] as string;
    if (seen.has(value)) {
      ctx.addIssue({ code: 'custom', path: [list, index, field], message: `Duplicate ${field}` });
    }
    seen.add(value);
  });
}

export const ImportFileSchema = z
  .strictObject({
    format: z.literal(IMPORT_FORMAT),
    exportedAt: z.iso.datetime({ offset: true }),
    source: z.strictObject({
      app: text(60),
      note: z.string().trim().max(500).optional(),
    }),
    customExercises: z.array(ImportCustomExerciseSchema).max(IMPORT_LIMITS.customExercises),
    folders: z.array(ImportFolderSchema).max(IMPORT_LIMITS.folders),
    templates: z.array(ImportTemplateSchema).max(IMPORT_LIMITS.templates),
    sessions: z.array(ImportSessionSchema).max(IMPORT_LIMITS.sessions),
  })
  .superRefine((file, ctx) => {
    addDuplicateKeyIssues(ctx, 'customExercises', file.customExercises);
    addDuplicateKeyIssues(ctx, 'folders', file.folders);
    addDuplicateKeyIssues(ctx, 'folders', file.folders, 'name');
    addDuplicateKeyIssues(ctx, 'templates', file.templates);
    addDuplicateKeyIssues(ctx, 'sessions', file.sessions);

    const customKeys = new Set(file.customExercises.map((e) => e.key));
    const folderKeys = new Set(file.folders.map((f) => f.key));
    const templateKeys = new Set(file.templates.map((t) => t.key));
    const checkRef = (ref: ImportExerciseRef, path: Array<string | number>) => {
      if ('customKey' in ref && !customKeys.has(ref.customKey)) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'customKey'],
          message: 'Unknown customKey',
        });
      }
    };

    file.templates.forEach((template, t) => {
      if (template.folderKey !== undefined && !folderKeys.has(template.folderKey)) {
        ctx.addIssue({
          code: 'custom',
          path: ['templates', t, 'folderKey'],
          message: 'Unknown folderKey',
        });
      }
      template.exercises.forEach((ex, e) => {
        const path = ['templates', t, 'exercises', e];
        checkRef(ex.exercise, [...path, 'exercise']);
        ex.alternativeExercises?.forEach((alt, a) =>
          checkRef(alt, [...path, 'alternativeExercises', a]),
        );
      });
    });

    let totalSets = 0;
    file.sessions.forEach((session, s) => {
      if (session.templateKey !== undefined && !templateKeys.has(session.templateKey)) {
        ctx.addIssue({
          code: 'custom',
          path: ['sessions', s, 'templateKey'],
          message: 'Unknown templateKey',
        });
      }
      if (Date.parse(session.completedAt) < Date.parse(session.startedAt)) {
        ctx.addIssue({
          code: 'custom',
          path: ['sessions', s, 'completedAt'],
          message: 'completedAt must not be before startedAt',
        });
      }
      session.exercises.forEach((ex, e) => {
        checkRef(ex.exercise, ['sessions', s, 'exercises', e, 'exercise']);
        totalSets += ex.sets.length;
      });
    });
    file.templates.forEach((t) => t.exercises.forEach((ex) => (totalSets += ex.sets.length)));
    if (totalSets > IMPORT_LIMITS.totalSets) {
      ctx.addIssue({
        code: 'custom',
        path: [],
        message: `At most ${IMPORT_LIMITS.totalSets} sets per file`,
      });
    }
  });

export type ImportExerciseRef = z.infer<typeof ImportExerciseRefSchema>;
export type ImportCustomExercise = z.infer<typeof ImportCustomExerciseSchema>;
export type ImportFolder = z.infer<typeof ImportFolderSchema>;
export type ImportTemplateExercise = z.infer<typeof ImportTemplateExerciseSchema>;
export type ImportTemplate = z.infer<typeof ImportTemplateSchema>;
export type ImportSessionSet = z.infer<typeof ImportSessionSetSchema>;
export type ImportSessionExercise = z.infer<typeof ImportSessionExerciseSchema>;
export type ImportSession = z.infer<typeof ImportSessionSchema>;
export type ImportFile = z.infer<typeof ImportFileSchema>;
/** The file as written by hand or a converter (template set fields may be omitted). */
export type ImportFileInput = z.input<typeof ImportFileSchema>;

export interface ImportIssueDto {
  path: string;
  message: string;
}

/** At most 50 short issues; never includes the offending input values. */
export function formatImportIssues(error: z.ZodError): ImportIssueDto[] {
  return error.issues.slice(0, IMPORT_LIMITS.issues).map((issue) => ({
    path: issue.path.join('.').slice(0, 200),
    message: issue.message.slice(0, 200),
  }));
}

export interface ImportKindCountsDto {
  total: number;
  new: number;
  existing: number;
}

export type ImportWarningCode = 'FOLDER_NAME_REUSED';

export interface ImportWarningDto {
  code: ImportWarningCode;
  /** Key of the affected entry in the file. */
  key: string;
  /** Display name of the affected entry. */
  name: string;
}

export interface ImportPreviewDto {
  format: typeof IMPORT_FORMAT;
  sourceApp: string;
  counts: {
    customExercises: ImportKindCountsDto;
    folders: ImportKindCountsDto;
    templates: ImportKindCountsDto;
    sessions: ImportKindCountsDto;
  };
  totalSets: number;
  /** New sets only (sets of sessions that are already imported are skipped). */
  newSets: number;
  earliestSessionAt: string | null;
  latestSessionAt: string | null;
  /** Catalog slugs that do not exist (at most 50); the file cannot be imported while any remain. */
  unknownSlugs: string[];
  unknownSlugCount: number;
  warnings: ImportWarningDto[];
}

export interface ImportCommitResultDto extends ImportPreviewDto {
  jobId: string;
}
