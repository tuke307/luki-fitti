import type { SupportedLocale } from '../enums';
import type { StretchingRoutineDto, WorkoutFolderDto, WorkoutTemplateDto } from '../schemas';
import {
  DEFAULT_STARTER_FOLDERS,
  DEFAULT_STARTER_TEMPLATES,
  DEFAULT_STRETCHING_ROUTINES,
  CORE_EXERCISE_CATALOG,
} from './data';
import { localizeFolder, localizeStretchingRoutine, SOURCE_LOCALE } from './localize';

export interface StarterBuildOptions {
  userId?: string;
  /** ISO timestamp used for createdAt/updatedAt. */
  timestamp?: string;
  locale?: SupportedLocale;
}

const catalogById = new Map(CORE_EXERCISE_CATALOG.map((e) => [e.id, e]));

/** Starter folders and templates as offline DTOs, linked to their definition via `systemKey`. */
export function buildStarterWorkouts({
  userId = 'local-user',
  timestamp = new Date().toISOString(),
  locale = SOURCE_LOCALE,
}: StarterBuildOptions = {}): {
  folders: WorkoutFolderDto[];
  unfiledTemplates: WorkoutTemplateDto[];
} {
  const templates: WorkoutTemplateDto[] = DEFAULT_STARTER_TEMPLATES.map((tpl) => ({
    id: tpl.id,
    systemKey: tpl.id,
    userId,
    folderId: tpl.folderId,
    name: tpl.name,
    description: tpl.description,
    estimatedDurationMinutes: tpl.estimatedDurationMinutes,
    sortOrder: tpl.sortOrder,
    createdAt: timestamp,
    updatedAt: timestamp,
    exercises: tpl.exercises.map((te) => ({ ...te, exercise: catalogById.get(te.exerciseId) })),
  }));

  const folders: WorkoutFolderDto[] = DEFAULT_STARTER_FOLDERS.map((f) => ({
    id: f.id,
    systemKey: f.id,
    userId,
    name: f.name,
    color: f.color,
    sortOrder: f.sortOrder,
    templates: templates.filter((t) => t.folderId === f.id),
  }));

  return { folders: folders.map((f) => localizeFolder(f, locale)), unfiledTemplates: [] };
}

/** Starter stretching routines as offline DTOs, linked to their definition via `systemKey`. */
export function buildStarterStretchingRoutines({
  userId = 'local-user',
  timestamp = new Date().toISOString(),
  locale = SOURCE_LOCALE,
}: StarterBuildOptions = {}): StretchingRoutineDto[] {
  return DEFAULT_STRETCHING_ROUTINES.map((r) =>
    localizeStretchingRoutine(
      {
        id: r.id,
        systemKey: r.id,
        userId,
        name: r.name,
        description: r.description,
        targetArea: r.targetArea,
        estimatedDurationSeconds: r.estimatedDurationSeconds,
        createdAt: timestamp,
        updatedAt: timestamp,
        exercises: r.exercises.map((re) => ({ ...re, exercise: catalogById.get(re.exerciseId) })),
      },
      locale,
    ),
  );
}
