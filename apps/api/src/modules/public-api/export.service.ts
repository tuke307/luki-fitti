import { Injectable } from '@nestjs/common';
import { SessionStatus, type SupportedLocale } from '@luki-fitti/common/enums';
import type { ImportFile } from '@luki-fitti/common/schemas';
import { buildImportFile } from '@luki-fitti/common/utils';
import { WorkoutService } from '../workout/workout.service';
import { SessionService } from '../session/session.service';
import { ExerciseService } from '../exercise/exercise.service';

/**
 * `GET /v1/export` payload: a full `luki-fitti-import@1` backup built with the same shared
 * builder and the same service mappers the in-app backup button uses. Workouts only (custom
 * exercises, folders, templates, completed sessions) — that's all the format covers.
 */
@Injectable()
export class PublicExportService {
  constructor(
    private readonly workouts: WorkoutService,
    private readonly sessions: SessionService,
    private readonly exercises: ExerciseService,
  ) {}

  async buildExport(userId: string, locale: SupportedLocale): Promise<ImportFile> {
    const [overview, historySessions, catalog] = await Promise.all([
      this.workouts.getOverview(userId, locale),
      this.sessions.listSessions(userId, { status: SessionStatus.COMPLETED }),
      this.exercises.findAll(userId, {}, locale),
    ]);
    return buildImportFile({
      folders: overview.folders,
      unfiledTemplates: overview.unfiledTemplates,
      historySessions,
      catalog,
      customExercises: catalog.filter((e) => !e.isSystem),
      sourceApp: 'luki-fitti-api',
    });
  }
}
