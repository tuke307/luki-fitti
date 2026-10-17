import { Injectable, BadRequestException } from '@nestjs/common';
import crypto from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { INITIAL_EXERCISE_CATALOG } from '@luki-fitti/common/catalog';
import {
  EquipmentType,
  ExerciseCategory,
  ExerciseType,
  MuscleGroup,
  SessionExerciseOrigin,
  SessionExerciseStatus,
  SessionStatus,
  SessionType,
  SetType,
  WeightUnit,
} from '@luki-fitti/common/enums';
import type {
  ImportCommitRequestDto,
  ImportCommitResultDto,
  ImportPreviewRequestDto,
  ImportPreviewResultDto,
  ParsedImportSession,
} from '@luki-fitti/common/schemas';

@Injectable()
export class ImportService {
  constructor(private readonly prisma: PrismaService) {}

  private buildSessionFingerprint(startedAtIso: string, workoutName: string): string {
    const datePrefix = startedAtIso.slice(0, 10);
    const normalizedName = workoutName.trim().toLowerCase();
    return `${datePrefix}::${normalizedName}`;
  }

  /**
   * Parses CSV or JSON workout export files (Gymlife CSV, Gymlife JSON, Apple Health JSON).
   */
  public parseExportContent(
    content: string,
    requestedFormat: string,
  ): {
    detectedFormat: string;
    sessions: ParsedImportSession[];
    validationErrors: string[];
  } {
    const trimmed = content.trim();

    if (!trimmed) {
      return {
        detectedFormat: 'UNKNOWN',
        sessions: [],
        validationErrors: ['Uploaded file is empty'],
      };
    }

    const looksLikeJson =
      requestedFormat === 'GYMLIFE_JSON' ||
      requestedFormat === 'APPLE_HEALTH_JSON' ||
      (requestedFormat === 'AUTO' && (trimmed.startsWith('{') || trimmed.startsWith('[')));

    if (looksLikeJson) {
      try {
        const parsed = JSON.parse(trimmed);
        return this.parseJsonPayload(parsed, requestedFormat);
      } catch (err) {
        return {
          detectedFormat: 'INVALID_JSON',
          sessions: [],
          validationErrors: [
            `Invalid JSON file: ${err instanceof Error ? err.message : 'syntax error'}`,
          ],
        };
      }
    }

    return this.parseCsvPayload(trimmed);
  }

  private parseJsonPayload(
    data: any,
    requestedFormat: string,
  ): {
    detectedFormat: string;
    sessions: ParsedImportSession[];
    validationErrors: string[];
  } {
    const validationErrors: string[] = [];
    const sessions: ParsedImportSession[] = [];

    const rawWorkouts = Array.isArray(data)
      ? data
      : Array.isArray(data?.workouts)
        ? data.workouts
        : Array.isArray(data?.sessions)
          ? data.sessions
          : Array.isArray(data?.data?.workouts)
            ? data.data.workouts
            : null;

    if (!rawWorkouts) {
      return {
        detectedFormat: 'JSON',
        sessions: [],
        validationErrors: [
          'JSON root must contain a "workouts" or "sessions" array, or be an array of workout objects.',
        ],
      };
    }

    const isAppleHealth =
      requestedFormat === 'APPLE_HEALTH_JSON' ||
      rawWorkouts.some((w: any) => 'workoutActivityType' in (w ?? {}));

    for (const [idx, w] of rawWorkouts.entries()) {
      if (!w || typeof w !== 'object') {
        validationErrors.push(`Row ${idx + 1}: Workout entry is not a valid object.`);
        continue;
      }

      const rawDate = w.date || w.startedAt || w.startDate || w.start;
      const parsedDate = rawDate ? new Date(rawDate) : new Date();
      if (isNaN(parsedDate.getTime())) {
        validationErrors.push(`Workout #${idx + 1}: Invalid date "${String(rawDate)}".`);
        continue;
      }

      const workoutName = String(
        w.workoutName || w.name || w.title || w.workoutActivityType || 'Imported Workout',
      ).trim();
      const folderName = w.folder || w.folderName || w.split || null;
      const durationSeconds = Number(w.durationSeconds || w.duration || 3600) || 3600;
      const startedAtIso = parsedDate.toISOString();

      const rawExercises = Array.isArray(w.exercises) ? w.exercises : [];
      const exercises = rawExercises
        .filter((ex: any) => ex && (ex.name || ex.exerciseName))
        .map((ex: any) => {
          const sourceName = String(ex.name || ex.exerciseName).trim();
          const rawSets = Array.isArray(ex.sets) ? ex.sets : [];
          const sets = rawSets.map((s: any, sIdx: number) => ({
            setNumber: Number(s.setNumber ?? s.set ?? sIdx + 1),
            setType:
              String(s.setType || s.type || 'WORKING').toUpperCase() === 'WARMUP'
                ? SetType.WARMUP
                : SetType.WORKING,
            weight:
              s.weight !== undefined && s.weight !== null && s.weight !== ''
                ? Number(s.weight)
                : null,
            weightUnit:
              String(s.unit || s.weightUnit || 'KG').toUpperCase() === 'LBS'
                ? WeightUnit.LBS
                : WeightUnit.KG,
            reps:
              s.reps !== undefined && s.reps !== null && s.reps !== '' ? Number(s.reps) : null,
            durationSeconds:
              s.durationSeconds !== undefined && s.durationSeconds !== null
                ? Number(s.durationSeconds)
                : null,
            notes: s.notes ? String(s.notes) : null,
          }));

          return {
            sourceName,
            matchedExerciseId: null,
            matchedExerciseName: null,
            sets:
              sets.length > 0
                ? sets
                : [
                    {
                      setNumber: 1,
                      setType: SetType.WORKING,
                      weight: ex.weight !== undefined ? Number(ex.weight) : null,
                      weightUnit: WeightUnit.KG,
                      reps: ex.reps !== undefined ? Number(ex.reps) : 10,
                      durationSeconds: null,
                      notes: null,
                    },
                  ],
          };
        });

      sessions.push({
        fingerprint: this.buildSessionFingerprint(startedAtIso, workoutName),
        workoutName,
        folderName: folderName ? String(folderName) : null,
        startedAt: startedAtIso,
        durationSeconds,
        isDuplicate: false,
        exercises,
      });
    }

    return {
      detectedFormat: isAppleHealth ? 'APPLE_HEALTH_JSON' : 'GYMLIFE_JSON',
      sessions,
      validationErrors,
    };
  }

  private parseCsvPayload(csvText: string): {
    detectedFormat: string;
    sessions: ParsedImportSession[];
    validationErrors: string[];
  } {
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      return {
        detectedFormat: 'GYMLIFE_CSV',
        sessions: [],
        validationErrors: ['CSV file must contain a header row and at least one data row.'],
      };
    }

    const delimiter = lines[0]!.includes(';') && !lines[0]!.includes(',') ? ';' : ',';
    const headers = this.splitCsvLine(lines[0]!, delimiter).map((h) =>
      h.toLowerCase().replace(/[^a-z0-9]/g, ''),
    );

    const findCol = (candidates: string[]) =>
      headers.findIndex((h) => candidates.some((c) => h.includes(c)));

    const dateIdx = findCol(['date', 'datum', 'startedat', 'start']);
    const workoutIdx = findCol(['workout', 'routine', 'training', 'split', 'session']);
    const folderIdx = findCol(['folder', 'ordner', 'plan']);
    const exerciseIdx = findCol(['exercise', 'uebung', 'übung', 'movement']);
    const setIdx = findCol(['setorder', 'setnumber', 'set', 'satz']);
    const weightIdx = findCol(['weight', 'gewicht', 'load', 'kg', 'lbs']);
    const unitIdx = findCol(['unit', 'einheit']);
    const repsIdx = findCol(['reps', 'repetitions', 'wdh', 'wiederholungen']);
    const durationIdx = findCol(['duration', 'seconds', 'dauer', 'time']);
    const notesIdx = findCol(['note', 'notiz', 'comment']);

    if (exerciseIdx === -1) {
      return {
        detectedFormat: 'GYMLIFE_CSV',
        sessions: [],
        validationErrors: [
          'Missing required CSV column: "Exercise" (or "Exercise Name" / "Übung").',
        ],
      };
    }

    const validationErrors: string[] = [];
    const sessionMap = new Map<string, ParsedImportSession>();

    for (let i = 1; i < lines.length; i++) {
      const cols = this.splitCsvLine(lines[i]!, delimiter);
      const exerciseName = (cols[exerciseIdx] ?? '').trim();
      if (!exerciseName) {
        validationErrors.push(`Row ${i + 1}: Missing exercise name.`);
        continue;
      }

      const rawDate = dateIdx >= 0 ? (cols[dateIdx] ?? '').trim() : '';
      const parsedDate = rawDate ? new Date(rawDate) : new Date();
      if (isNaN(parsedDate.getTime())) {
        validationErrors.push(`Row ${i + 1}: Invalid date "${rawDate}".`);
        continue;
      }

      const startedAtIso = parsedDate.toISOString();
      const workoutName =
        (workoutIdx >= 0 ? (cols[workoutIdx] ?? '').trim() : '') || 'Gymlife Workout';
      const folderName = folderIdx >= 0 ? (cols[folderIdx] ?? '').trim() || null : null;
      const fingerprint = this.buildSessionFingerprint(startedAtIso, workoutName);

      let session = sessionMap.get(fingerprint);
      if (!session) {
        session = {
          fingerprint,
          workoutName,
          folderName,
          startedAt: startedAtIso,
          durationSeconds: 3600,
          isDuplicate: false,
          exercises: [],
        };
        sessionMap.set(fingerprint, session);
      }

      let exercise = session.exercises.find(
        (e) => e.sourceName.toLowerCase() === exerciseName.toLowerCase(),
      );
      if (!exercise) {
        exercise = {
          sourceName: exerciseName,
          matchedExerciseId: null,
          matchedExerciseName: null,
          sets: [],
        };
        session.exercises.push(exercise);
      }

      const rawWeight = weightIdx >= 0 ? (cols[weightIdx] ?? '').replace(',', '.').trim() : '';
      const rawReps = repsIdx >= 0 ? (cols[repsIdx] ?? '').trim() : '';
      const rawDuration = durationIdx >= 0 ? (cols[durationIdx] ?? '').trim() : '';
      const rawUnit = unitIdx >= 0 ? (cols[unitIdx] ?? '').trim().toUpperCase() : 'KG';
      const rawSet = setIdx >= 0 ? (cols[setIdx] ?? '').trim() : '';

      const weight = rawWeight !== '' && !isNaN(Number(rawWeight)) ? Number(rawWeight) : null;
      const reps = rawReps !== '' && !isNaN(Number(rawReps)) ? Math.round(Number(rawReps)) : null;
      const durationSeconds =
        rawDuration !== '' && !isNaN(Number(rawDuration)) ? Math.round(Number(rawDuration)) : null;

      exercise.sets.push({
        setNumber:
          rawSet !== '' && !isNaN(Number(rawSet))
            ? Math.max(1, Math.round(Number(rawSet)))
            : exercise.sets.length + 1,
        setType: SetType.WORKING,
        weight,
        weightUnit: rawUnit.includes('LB') ? WeightUnit.LBS : WeightUnit.KG,
        reps,
        durationSeconds,
        notes: notesIdx >= 0 ? (cols[notesIdx] ?? '').trim() || null : null,
      });
    }

    return {
      detectedFormat: 'GYMLIFE_CSV',
      sessions: Array.from(sessionMap.values()),
      validationErrors,
    };
  }

  private splitCsvLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  private matchExerciseFromCatalog(
    sourceName: string,
    catalog: Array<{ id: string; name: string; tags: string[] }>,
  ): {
    matchedExerciseId: string | null;
    matchedExerciseName: string | null;
    confidence: 'EXACT' | 'FUZZY' | 'UNMATCHED';
  } {
    const q = sourceName.trim().toLowerCase();
    const exact = catalog.find((c) => c.name.toLowerCase() === q);
    if (exact) {
      return {
        matchedExerciseId: exact.id,
        matchedExerciseName: exact.name,
        confidence: 'EXACT',
      };
    }

    const GENERIC_TAGS = new Set([
      'push',
      'pull',
      'legs',
      'chest',
      'back',
      'shoulders',
      'arms',
      'biceps',
      'triceps',
      'forearms',
      'quads',
      'hamstrings',
      'glutes',
      'calves',
      'abs',
      'core',
      'compound',
      'isolation',
      'stretching',
      'mobility',
      'cardio',
      'warmup',
      'cooldown',
      'unilateral',
      'full body',
    ]);

    const fuzzy = catalog.find(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        q.includes(c.name.toLowerCase()) ||
        (c.tags ?? []).some((t) => {
          const tagLower = t.toLowerCase();
          if (GENERIC_TAGS.has(tagLower)) return false;
          return tagLower === q || (tagLower.length >= 5 && q.includes(tagLower));
        }),
    );
    if (fuzzy) {
      return {
        matchedExerciseId: fuzzy.id,
        matchedExerciseName: fuzzy.name,
        confidence: 'FUZZY',
      };
    }

    return {
      matchedExerciseId: null,
      matchedExerciseName: null,
      confidence: 'UNMATCHED',
    };
  }

  async previewImport(
    userId: string,
    dto: ImportPreviewRequestDto,
  ): Promise<ImportPreviewResultDto> {
    const parsed = this.parseExportContent(dto.content, dto.format ?? 'AUTO');

    const [dbExercises, existingSessions] = await Promise.all([
      this.prisma.exercise.findMany({
        where: { OR: [{ isSystem: true }, { userId }] },
        select: { id: true, name: true, tags: true },
      }),
      this.prisma.workoutSession.findMany({
        where: { userId },
        select: { startedAt: true, workoutNameSnapshot: true },
      }),
    ]);

    const catalog =
      dbExercises.length > 0
        ? dbExercises
        : INITIAL_EXERCISE_CATALOG.map((c) => ({ id: c.id, name: c.name, tags: c.tags }));

    const existingFingerprints = new Set(
      existingSessions.map((s) =>
        this.buildSessionFingerprint(s.startedAt.toISOString(), s.workoutNameSnapshot),
      ),
    );

    const uniqueExerciseNames = new Set<string>();
    const templatesSet = new Set<string>();
    let totalSetsFound = 0;
    let duplicateSessionsCount = 0;

    for (const s of parsed.sessions) {
      templatesSet.add(s.workoutName);
      if (existingFingerprints.has(s.fingerprint)) {
        s.isDuplicate = true;
        duplicateSessionsCount += 1;
      }
      for (const ex of s.exercises) {
        uniqueExerciseNames.add(ex.sourceName);
        totalSetsFound += ex.sets.length;
        const match = this.matchExerciseFromCatalog(ex.sourceName, catalog);
        ex.matchedExerciseId = match.matchedExerciseId;
        ex.matchedExerciseName = match.matchedExerciseName;
      }
    }

    const exerciseSuggestions = Array.from(uniqueExerciseNames).map((sourceName) => {
      const match = this.matchExerciseFromCatalog(sourceName, catalog);
      return {
        sourceName,
        ...match,
      };
    });

    const unmappedExercises = exerciseSuggestions
      .filter((s) => s.confidence === 'UNMATCHED')
      .map((s) => s.sourceName);

    return {
      detectedFormat: parsed.detectedFormat,
      fileName: dto.fileName,
      totalSessionsFound: parsed.sessions.length,
      duplicateSessionsCount,
      totalSetsFound,
      templatesFound: Array.from(templatesSet),
      unmappedExercises,
      exerciseSuggestions,
      sessionsPreview: parsed.sessions,
      validationErrors: parsed.validationErrors,
    };
  }

  async commitImport(userId: string, dto: ImportCommitRequestDto): Promise<ImportCommitResultDto> {
    const preview = await this.previewImport(userId, {
      fileName: dto.fileName,
      format: dto.format,
      content: dto.content,
    });

    if (preview.totalSessionsFound === 0) {
      throw new BadRequestException(
        preview.validationErrors[0] || 'No valid workout sessions found in export file.',
      );
    }

    const mappingBySource = new Map(
      (dto.exerciseMappings ?? []).map((m) => [m.sourceName.toLowerCase(), m]),
    );

    let importedSessions = 0;
    let importedSets = 0;
    let importedTemplates = 0;
    let createdCustomExercises = 0;
    let skippedDuplicates = 0;

    const dbCatalog = await this.prisma.exercise.findMany({
      where: { OR: [{ isSystem: true }, { userId }] },
    });
    const catalogById = new Map(dbCatalog.map((e) => [e.id, e]));

    const result = await this.prisma.$transaction(async (tx) => {
      const resolvedExerciseMap = new Map<
        string,
        { id: string; name: string; primaryMuscleGroup: MuscleGroup; exerciseType: ExerciseType }
      >();

      for (const suggestion of preview.exerciseSuggestions) {
        const key = suggestion.sourceName.toLowerCase();
        const override = mappingBySource.get(key);

        if (override?.action === 'SKIP') {
          continue;
        }

        if (override?.action === 'MAP' && override.targetExerciseId) {
          const target =
            catalogById.get(override.targetExerciseId) ??
            INITIAL_EXERCISE_CATALOG.find((c) => c.id === override.targetExerciseId);
          if (target) {
            resolvedExerciseMap.set(key, {
              id: target.id,
              name: target.name,
              primaryMuscleGroup: target.primaryMuscleGroup as MuscleGroup,
              exerciseType: target.exerciseType as ExerciseType,
            });
            continue;
          }
        }

        if (suggestion.matchedExerciseId && override?.action !== 'CREATE_CUSTOM') {
          const target =
            catalogById.get(suggestion.matchedExerciseId) ??
            INITIAL_EXERCISE_CATALOG.find((c) => c.id === suggestion.matchedExerciseId);
          if (target) {
            resolvedExerciseMap.set(key, {
              id: target.id,
              name: target.name,
              primaryMuscleGroup: target.primaryMuscleGroup as MuscleGroup,
              exerciseType: target.exerciseType as ExerciseType,
            });
            continue;
          }
        }

        const slug = `imported-${suggestion.sourceName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
        const customEx = await tx.exercise.create({
          data: {
            slug,
            userId,
            name: suggestion.sourceName,
            description: `Imported from ${dto.fileName}`,
            instructions: [],
            category: ExerciseCategory.COMPOUND,
            exerciseType: ExerciseType.STRENGTH,
            primaryMuscleGroup: override?.primaryMuscleGroup ?? MuscleGroup.FULL_BODY,
            equipment: override?.equipment ?? EquipmentType.OTHER,
            tags: ['imported', 'gymlife'],
            isSystem: false,
          },
        });
        createdCustomExercises += 1;
        resolvedExerciseMap.set(key, {
          id: customEx.id,
          name: customEx.name,
          primaryMuscleGroup: customEx.primaryMuscleGroup as MuscleGroup,
          exerciseType: customEx.exerciseType as ExerciseType,
        });
      }

      const templateByName = new Map<string, string>();
      if (dto.importTemplates) {
        for (const s of preview.sessionsPreview) {
          const tplKey = s.workoutName.toLowerCase();
          if (templateByName.has(tplKey) || s.exercises.length === 0) continue;

          let folderId: string | null = null;
          if (s.folderName) {
            const folder = await tx.workoutFolder.upsert({
              where: { userId_name: { userId, name: s.folderName } },
              update: {},
              create: { userId, name: s.folderName, color: '#CCFF00' },
            });
            folderId = folder.id;
          }

          const existingTpl = await tx.workoutTemplate.findFirst({
            where: { userId, name: { equals: s.workoutName, mode: 'insensitive' } },
          });

          if (existingTpl) {
            templateByName.set(tplKey, existingTpl.id);
          } else {
            const createdTpl = await tx.workoutTemplate.create({
              data: {
                userId,
                folderId,
                name: s.workoutName,
                description: `Imported from ${dto.fileName}`,
                estimatedDurationMinutes: Math.round(s.durationSeconds / 60) || 60,
              },
            });

            for (const [idx, ex] of s.exercises.entries()) {
              const resolved = resolvedExerciseMap.get(ex.sourceName.toLowerCase());
              if (!resolved) continue;
              const firstSet = ex.sets[0];
              await tx.workoutTemplateExercise.create({
                data: {
                  templateId: createdTpl.id,
                  exerciseId: resolved.id,
                  orderIndex: idx,
                  plannedSets: Math.max(1, ex.sets.length),
                  targetRepsMin: firstSet?.reps ?? 8,
                  targetRepsMax: firstSet?.reps ?? 12,
                  targetWeight: firstSet?.weight ?? null,
                  weightUnit: firstSet?.weightUnit ?? WeightUnit.KG,
                  restSeconds: 90,
                },
              });
            }

            templateByName.set(tplKey, createdTpl.id);
            importedTemplates += 1;
          }
        }
      }

      for (const s of preview.sessionsPreview) {
        if (s.isDuplicate && dto.skipDuplicates) {
          skippedDuplicates += 1;
          continue;
        }

        let totalVolumeKg = 0;
        let totalSetsCompleted = 0;
        let totalRepsCompleted = 0;

        for (const ex of s.exercises) {
          for (const set of ex.sets) {
            totalSetsCompleted += 1;
            totalRepsCompleted += set.reps ?? 0;
            if (set.weight && set.reps) {
              const wKg = set.weightUnit === WeightUnit.LBS ? set.weight * 0.45359237 : set.weight;
              totalVolumeKg += wKg * set.reps;
            }
          }
        }

        const createdSession = await tx.workoutSession.create({
          data: {
            clientSessionId: `import-${crypto.randomUUID()}`,
            userId,
            templateId: templateByName.get(s.workoutName.toLowerCase()) ?? null,
            sessionType: SessionType.STRENGTH,
            workoutNameSnapshot: s.workoutName,
            status: SessionStatus.COMPLETED,
            startedAt: new Date(s.startedAt),
            completedAt: new Date(new Date(s.startedAt).getTime() + s.durationSeconds * 1000),
            activeDurationSeconds: s.durationSeconds,
            totalVolumeKg: Math.round(totalVolumeKg * 10) / 10,
            totalSetsCompleted,
            totalRepsCompleted,
          },
        });

        for (const [idx, ex] of s.exercises.entries()) {
          const resolved = resolvedExerciseMap.get(ex.sourceName.toLowerCase());
          if (!resolved) continue;

          const createdEx = await tx.sessionExercise.create({
            data: {
              clientExerciseId: `import-ex-${crypto.randomUUID()}`,
              sessionId: createdSession.id,
              exerciseId: resolved.id,
              exerciseNameSnapshot: resolved.name,
              primaryMuscleSnapshot: resolved.primaryMuscleGroup,
              exerciseTypeSnapshot: resolved.exerciseType,
              origin: SessionExerciseOrigin.PLANNED,
              status: SessionExerciseStatus.COMPLETED,
              orderIndex: idx,
              plannedSets: Math.max(1, ex.sets.length),
            },
          });

          for (const [sIdx, set] of ex.sets.entries()) {
            await tx.sessionSet.create({
              data: {
                clientSetId: `import-set-${crypto.randomUUID()}`,
                sessionExerciseId: createdEx.id,
                setNumber: set.setNumber ?? sIdx + 1,
                setType: set.setType,
                weight: set.weight,
                weightUnit: set.weightUnit,
                reps: set.reps,
                durationSeconds: set.durationSeconds,
                completed: true,
                completedAt: new Date(s.startedAt),
                notes: set.notes ?? null,
              },
            });
            importedSets += 1;
          }
        }

        importedSessions += 1;
      }

      const job = await tx.importJob.create({
        data: {
          userId,
          sourceFormat: preview.detectedFormat,
          fileName: dto.fileName,
          status: 'COMPLETED',
          totalRecords: preview.totalSessionsFound,
          importedSessions,
          importedTemplates,
          skippedDuplicates,
          errorsCount: preview.validationErrors.length,
          summaryJson: {
            importedSets,
            createdCustomExercises,
            validationErrors: preview.validationErrors,
          },
        },
      });

      return job;
    });

    return {
      importJobId: result.id,
      detectedFormat: preview.detectedFormat,
      importedSessions,
      importedSets,
      importedTemplates,
      createdCustomExercises,
      skippedDuplicates,
      errors: preview.validationErrors,
    };
  }

  async listImportJobs(userId: string) {
    return this.prisma.importJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
}
