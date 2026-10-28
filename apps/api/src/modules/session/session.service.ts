import { Injectable, NotFoundException, ForbiddenException, Optional } from '@nestjs/common';
import crypto from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { WorkoutService } from '../workout/workout.service';
import {
  ExerciseType,
  SessionExerciseOrigin,
  SessionExerciseStatus,
  SessionSourceDevice,
  SessionStatus,
  SessionType,
  SetType,
  WeightUnit,
  type SupportedLocale,
} from '@luki-fitti/common/enums';
import {
  getExerciseText,
  resolveExerciseId,
  getStarterNote,
  getStarterRoutineText,
  getStarterTemplateText,
} from '@luki-fitti/common/catalog';
import { TemplateSetSchema } from '@luki-fitti/common/schemas';
import type {
  HeartRateSampleDto,
  StartSessionDto,
  SyncSessionPayloadDto,
  SyncSessionResponseDto,
  WorkoutSessionDto,
} from '@luki-fitti/common/schemas';

const LBS_TO_KG = 0.45359237;

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly workoutService?: WorkoutService,
  ) {}

  /**
   * Computes volume and duration metrics consistently:
   * - Strength volume (KG) = sum of weight(kg) * reps for completed WORKING/DROPSET sets on STRENGTH exercises.
   * - Stretching duration (sec) = sum of durationSeconds for completed sets on STRETCHING exercises or STRETCH setType.
   * Incomparable measurements are never combined.
   */
  public computeSessionMetrics(exercises: SyncSessionPayloadDto['exercises']) {
    let totalVolumeKg = 0;
    let totalSetsCompleted = 0;
    let totalRepsCompleted = 0;
    let totalStretchSeconds = 0;

    for (const ex of exercises) {
      const isStretchType = ex.exerciseTypeSnapshot === ExerciseType.STRETCHING;

      for (const s of ex.sets) {
        if (!s.completed) continue;
        totalSetsCompleted += 1;

        if (isStretchType || s.setType === SetType.STRETCH) {
          totalStretchSeconds += s.durationSeconds ?? 0;
          if (s.reps) totalRepsCompleted += s.reps;
        } else {
          const reps = s.reps ?? 0;
          totalRepsCompleted += reps;
          if (s.setType !== SetType.WARMUP && s.weight && s.weight > 0 && reps > 0) {
            const weightKg = s.weightUnit === WeightUnit.LBS ? s.weight * LBS_TO_KG : s.weight;
            totalVolumeKg += weightKg * reps;
          }
        }
      }
    }

    return {
      totalVolumeKg: Math.round(totalVolumeKg * 10) / 10,
      totalSetsCompleted,
      totalRepsCompleted,
      totalStretchSeconds,
    };
  }

  /** Snapshots (workout/exercise names, notes) are taken in the user's language at start. */
  async startSession(
    userId: string,
    dto: StartSessionDto,
    locale: SupportedLocale,
  ): Promise<WorkoutSessionDto> {
    const existing = await this.prisma.workoutSession.findUnique({
      where: { clientSessionId: dto.clientSessionId },
      include: {
        exercises: {
          orderBy: { orderIndex: 'asc' },
          include: { sets: { orderBy: { setNumber: 'asc' } } },
        },
      },
    });

    if (existing) {
      if (existing.userId !== userId) {
        throw new ForbiddenException('Session belongs to another user');
      }
      return this.mapSessionDto(existing);
    }

    let workoutName = dto.workoutName ?? 'Custom Gym Session';
    let sessionType = dto.sessionType ?? SessionType.STRENGTH;
    const exercisesToCreate: Array<any> = [];

    if (dto.templateId) {
      const tpl = await this.prisma.workoutTemplate.findUnique({
        where: { id: dto.templateId },
        include: {
          exercises: {
            orderBy: { orderIndex: 'asc' },
            include: { exercise: true },
          },
        },
      });
      if (!tpl || tpl.userId !== userId) {
        throw new ForbiddenException('Workout template not found or access denied');
      }
      workoutName =
        (tpl.systemKey && getStarterTemplateText(tpl.systemKey, locale)?.name) || tpl.name;
      sessionType = SessionType.STRENGTH;

      const templateExerciseIds = tpl.exercises.map((te) => te.exerciseId);
      const latestCompletedExercises =
        templateExerciseIds.length > 0
          ? await this.prisma.sessionExercise.findMany({
              where: {
                exerciseId: { in: templateExerciseIds },
                session: {
                  userId,
                  status: SessionStatus.COMPLETED,
                },
              },
              orderBy: { session: { startedAt: 'desc' } },
              include: {
                sets: {
                  where: {
                    completed: true,
                    setType: { notIn: [SetType.WARMUP, SetType.STRETCH] },
                  },
                  orderBy: { setNumber: 'asc' },
                },
              },
            })
          : [];

      const latestByExerciseId = new Map<string, (typeof latestCompletedExercises)[number]>();
      for (const item of latestCompletedExercises) {
        if (item.exerciseId && item.sets.length > 0 && !latestByExerciseId.has(item.exerciseId)) {
          latestByExerciseId.set(item.exerciseId, item);
        }
      }

      for (const [idx, te] of tpl.exercises.entries()) {
        const lastEx = latestByExerciseId.get(te.exerciseId);
        const primaryLastWeight = lastEx?.sets[0]?.weight ?? te.targetWeight ?? null;
        const sets: Array<any> = [];
        let setNum = 1;
        const explicit = TemplateSetSchema.array().safeParse(te.sets ?? []);
        if (explicit.success && explicit.data.length > 0) {
          // An explicit per-set plan already reflects the last workout: copy it one to one.
          for (const planned of explicit.data) {
            sets.push({
              clientSetId: crypto.randomUUID(),
              setNumber: setNum++,
              setType: planned.setType,
              weight: planned.weight,
              weightUnit: te.weightUnit,
              reps: planned.reps,
              durationSeconds: planned.durationSeconds ?? te.targetDurationSeconds ?? null,
              completed: false,
            });
          }
        } else {
          for (let w = 0; w < (te.warmupSets ?? 0); w++) {
            sets.push({
              clientSetId: crypto.randomUUID(),
              setNumber: setNum++,
              setType: SetType.WARMUP,
              weight: primaryLastWeight ? Math.round(primaryLastWeight * 0.6 * 2) / 2 : null,
              weightUnit: te.weightUnit,
              reps: te.targetRepsMin ?? 10,
              completed: false,
            });
          }
          for (let s = 0; s < te.plannedSets; s++) {
            const histSet = lastEx?.sets[s] ?? lastEx?.sets[lastEx.sets.length - 1];
            sets.push({
              clientSetId: crypto.randomUUID(),
              setNumber: setNum++,
              setType: SetType.WORKING,
              weight: histSet?.weight ?? te.targetWeight ?? null,
              weightUnit: te.weightUnit,
              reps: histSet?.reps ?? te.targetRepsMin ?? 10,
              durationSeconds: te.targetDurationSeconds ?? null,
              completed: false,
            });
          }
        }

        exercisesToCreate.push({
          clientExerciseId: crypto.randomUUID(),
          exerciseId: te.exerciseId,
          exerciseNameSnapshot:
            (te.exercise.isSystem && getExerciseText(te.exerciseId, locale)?.name) ||
            te.exercise.name,
          primaryMuscleSnapshot: te.exercise.primaryMuscleGroup,
          exerciseTypeSnapshot: te.exercise.exerciseType,
          origin: SessionExerciseOrigin.PLANNED,
          status: idx === 0 ? SessionExerciseStatus.IN_PROGRESS : SessionExerciseStatus.PENDING,
          orderIndex: idx,
          plannedSets: te.plannedSets,
          plannedWarmupSets: te.warmupSets ?? 0,
          targetRepsMin: te.targetRepsMin,
          targetRepsMax: te.targetRepsMax,
          targetWeight: primaryLastWeight ?? te.targetWeight,
          targetDurationSeconds: te.targetDurationSeconds,
          restSeconds: te.restSeconds,
          alternativeExerciseIds: te.alternativeExerciseIds ?? [],
          notes:
            (tpl.systemKey &&
              getStarterNote(tpl.systemKey, te.orderIndex, te.exerciseId, locale)) ||
            te.notes,
          sets,
        });
      }
    } else if (dto.stretchingRoutineId) {
      const routine = await this.prisma.stretchingRoutine.findUnique({
        where: { id: dto.stretchingRoutineId },
        include: {
          exercises: {
            orderBy: { orderIndex: 'asc' },
            include: { exercise: true },
          },
        },
      });
      if (!routine || routine.userId !== userId) {
        throw new ForbiddenException('Stretching routine not found or access denied');
      }
      workoutName =
        (routine.systemKey && getStarterRoutineText(routine.systemKey, locale)?.name) ||
        routine.name;
      sessionType = SessionType.STRETCHING;

      for (const [idx, re] of routine.exercises.entries()) {
        const sets = Array.from({ length: re.sets }, (_, sIdx) => ({
          clientSetId: crypto.randomUUID(),
          setNumber: sIdx + 1,
          setType: SetType.STRETCH,
          weight: null,
          weightUnit: dto.weightUnit ?? WeightUnit.KG,
          reps: re.reps ?? null,
          durationSeconds: re.durationSeconds ?? 45,
          completed: false,
        }));

        exercisesToCreate.push({
          clientExerciseId: crypto.randomUUID(),
          exerciseId: re.exerciseId,
          exerciseNameSnapshot:
            (re.exercise.isSystem && getExerciseText(re.exerciseId, locale)?.name) ||
            re.exercise.name,
          primaryMuscleSnapshot: re.exercise.primaryMuscleGroup,
          exerciseTypeSnapshot: re.exercise.exerciseType,
          origin: SessionExerciseOrigin.PLANNED,
          status: idx === 0 ? SessionExerciseStatus.IN_PROGRESS : SessionExerciseStatus.PENDING,
          orderIndex: idx,
          plannedSets: re.sets,
          plannedWarmupSets: 0,
          targetRepsMin: re.reps,
          targetRepsMax: re.reps,
          targetWeight: null,
          targetDurationSeconds: re.durationSeconds,
          restSeconds: re.transitionSeconds,
          alternativeExerciseIds: [],
          notes:
            (routine.systemKey &&
              getStarterNote(routine.systemKey, re.orderIndex, re.exerciseId, locale)) ||
            re.notes,
          sets,
        });
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const session = await tx.workoutSession.create({
        data: {
          clientSessionId: dto.clientSessionId,
          userId,
          templateId: dto.templateId ?? null,
          stretchingRoutineId: dto.stretchingRoutineId ?? null,
          sessionType,
          workoutNameSnapshot: workoutName,
          status: SessionStatus.IN_PROGRESS,
          weightUnit: dto.weightUnit ?? WeightUnit.KG,
          sourceDevice: dto.sourceDevice ?? SessionSourceDevice.WEB,
          version: 1,
        },
      });

      for (const ex of exercisesToCreate) {
        const { sets, ...exData } = ex;
        const createdEx = await tx.sessionExercise.create({
          data: {
            ...exData,
            sessionId: session.id,
          },
        });
        for (const s of sets) {
          await tx.sessionSet.create({
            data: {
              ...s,
              sessionExerciseId: createdEx.id,
            },
          });
        }
      }

      return tx.workoutSession.findUniqueOrThrow({
        where: { id: session.id },
        include: {
          exercises: {
            orderBy: { orderIndex: 'asc' },
            include: { sets: { orderBy: { setNumber: 'asc' } } },
          },
        },
      });
    });

    return this.mapSessionDto(created);
  }

  /**
   * A sync is only a conflict when the server holds changes this device has not seen.
   * Retries from the device that wrote the latest version (e.g. after iOS froze the tab before the
   * response arrived) are never conflicts. Clients without a device id keep the legacy rule.
   */
  private isSyncConflict(
    existing: { version: number; lastWriterDeviceId?: string | null },
    payload: SyncSessionPayloadDto,
  ): boolean {
    const knownVersion = payload.baseVersion ?? payload.version;
    if (!payload.deviceId) return existing.version > payload.version;
    if (existing.lastWriterDeviceId === payload.deviceId) return false;
    // Rows written before device ids existed were bumped one past the client version on every sync.
    if (!existing.lastWriterDeviceId && existing.version - knownVersion <= 1) return false;
    return existing.version > knownVersion;
  }

  /**
   * Idempotent synchronization of an offline-first session.
   * Uses clientSessionId, clientExerciseId, and clientSetId so repeated sync
   * attempts never create duplicate sessions or duplicate set entries.
   */
  async syncSession(
    userId: string,
    rawPayload: SyncSessionPayloadDto,
    locale: SupportedLocale = 'en',
  ): Promise<SyncSessionResponseDto> {
    // Offline clients may still hold ids of exercises that were merged into another one.
    const payload: SyncSessionPayloadDto = {
      ...rawPayload,
      exercises: rawPayload.exercises.map((ex) => ({
        ...ex,
        exerciseId: ex.exerciseId && resolveExerciseId(ex.exerciseId),
        replacedExerciseId: ex.replacedExerciseId && resolveExerciseId(ex.replacedExerciseId),
        alternativeExerciseIds: ex.alternativeExerciseIds && [
          ...new Set(ex.alternativeExerciseIds.map(resolveExerciseId)),
        ],
      })),
    };
    const existing = await this.prisma.workoutSession.findUnique({
      where: { clientSessionId: payload.clientSessionId },
      include: {
        exercises: {
          orderBy: { orderIndex: 'asc' },
          include: { sets: { orderBy: { setNumber: 'asc' } } },
        },
      },
    });

    if (existing && existing.userId !== userId) {
      throw new ForbiddenException('Cannot synchronize a session owned by another user');
    }

    if (existing && !payload.forceOverwrite && this.isSyncConflict(existing, payload)) {
      return {
        session: this.mapSessionDto(existing),
        conflictDetected: true,
        serverVersion: existing.version,
      };
    }

    const metrics = this.computeSessionMetrics(payload.exercises);
    const nextVersion = existing
      ? Math.max(existing.version, payload.version) + 1
      : payload.deviceId
        ? payload.version
        : 1;
    const lastWriterDeviceId = payload.deviceId ?? null;

    const hrSamples = payload.heartRateSamples ?? null;
    const allBpms: number[] = [];
    if (hrSamples && hrSamples.length > 0) {
      for (const sample of hrSamples) {
        if (typeof sample.bpm === 'number' && sample.bpm >= 20 && sample.bpm <= 260) {
          allBpms.push(sample.bpm);
        }
      }
    }
    if (allBpms.length === 0) {
      for (const ex of payload.exercises) {
        for (const s of ex.sets) {
          if (typeof s.avgHeartRateBpm === 'number') allBpms.push(s.avgHeartRateBpm);
          if (typeof s.peakHeartRateBpm === 'number') allBpms.push(s.peakHeartRateBpm);
        }
      }
    }

    const computedAvgHr =
      allBpms.length > 0
        ? Math.round(allBpms.reduce((acc, v) => acc + v, 0) / allBpms.length)
        : null;
    const computedMaxHr = allBpms.length > 0 ? Math.max(...allBpms) : null;
    const computedMinHr = allBpms.length > 0 ? Math.min(...allBpms) : null;

    const avgHeartRateBpm =
      payload.avgHeartRateBpm ?? computedAvgHr ?? existing?.avgHeartRateBpm ?? null;
    const maxHeartRateBpm =
      payload.maxHeartRateBpm ?? computedMaxHr ?? existing?.maxHeartRateBpm ?? null;
    const minHeartRateBpm =
      payload.minHeartRateBpm ?? computedMinHr ?? existing?.minHeartRateBpm ?? null;
    const activeCaloriesKcal =
      payload.activeCaloriesKcal !== undefined
        ? payload.activeCaloriesKcal
        : (existing?.activeCaloriesKcal ?? null);
    const totalCaloriesKcal =
      payload.totalCaloriesKcal !== undefined
        ? payload.totalCaloriesKcal
        : (existing?.totalCaloriesKcal ?? null);
    const healthKitWorkoutUuid =
      payload.healthKitWorkoutUuid !== undefined
        ? payload.healthKitWorkoutUuid
        : (existing?.healthKitWorkoutUuid ?? null);
    const sourceDevice =
      payload.sourceDevice ??
      (existing?.sourceDevice as SessionSourceDevice | undefined) ??
      SessionSourceDevice.WEB;
    const heartRateSamplesJson: Array<{ offsetSec: number; bpm: number }> | undefined =
      hrSamples !== null
        ? hrSamples.map((s) => ({ offsetSec: s.offsetSec, bpm: s.bpm }))
        : Array.isArray(existing?.heartRateSamplesJson)
          ? (existing.heartRateSamplesJson as Array<{ offsetSec: number; bpm: number }>)
          : undefined;

    let resolvedTemplateId = payload.templateId ?? null;
    if (resolvedTemplateId && this.prisma.workoutTemplate?.findUnique) {
      const tplExists = await this.prisma.workoutTemplate.findUnique({
        where: { id: resolvedTemplateId },
        select: { id: true },
      });
      if (!tplExists) resolvedTemplateId = null;
    }

    let resolvedStretchingRoutineId = payload.stretchingRoutineId ?? null;
    if (resolvedStretchingRoutineId && this.prisma.stretchingRoutine?.findUnique) {
      const routineExists = await this.prisma.stretchingRoutine.findUnique({
        where: { id: resolvedStretchingRoutineId },
        select: { id: true },
      });
      if (!routineExists) resolvedStretchingRoutineId = null;
    }

    const candidateExerciseIds = Array.from(
      new Set(payload.exercises.map((e) => e.exerciseId).filter((id): id is string => Boolean(id))),
    );
    let validExerciseIds: Set<string> | null = null;
    if (candidateExerciseIds.length > 0 && this.prisma.exercise?.findMany) {
      const foundExercises = await this.prisma.exercise.findMany({
        where: { id: { in: candidateExerciseIds } },
        select: { id: true },
      });
      validExerciseIds = new Set(foundExercises.map((e) => e.id));
    }

    const synced = await this.prisma.$transaction(async (tx) => {
      if (
        (payload.status === SessionStatus.IN_PROGRESS || payload.status === SessionStatus.PAUSED) &&
        tx.workoutSession.deleteMany
      ) {
        await tx.workoutSession.deleteMany({
          where: {
            userId,
            status: { in: [SessionStatus.IN_PROGRESS, SessionStatus.PAUSED] },
            clientSessionId: { not: payload.clientSessionId },
          },
        });
      }

      const session = await tx.workoutSession.upsert({
        where: { clientSessionId: payload.clientSessionId },
        update: {
          workoutNameSnapshot: payload.workoutNameSnapshot,
          sessionType: payload.sessionType,
          status: payload.status,
          startedAt: new Date(payload.startedAt),
          pausedAt: payload.pausedAt ? new Date(payload.pausedAt) : null,
          completedAt: payload.completedAt ? new Date(payload.completedAt) : null,
          activeDurationSeconds: payload.activeDurationSeconds,
          weightUnit: payload.weightUnit,
          totalVolumeKg: metrics.totalVolumeKg,
          totalSetsCompleted: metrics.totalSetsCompleted,
          totalRepsCompleted: metrics.totalRepsCompleted,
          totalStretchSeconds: metrics.totalStretchSeconds,
          notes: payload.notes ?? null,
          restTimerEndsAt: payload.restTimerEndsAt ? new Date(payload.restTimerEndsAt) : null,
          restTimerDurationSec: payload.restTimerDurationSec ?? null,
          restTimerPausedRemSec: payload.restTimerPausedRemSec ?? null,
          sourceDevice,
          healthKitWorkoutUuid,
          activeCaloriesKcal,
          totalCaloriesKcal,
          avgHeartRateBpm,
          maxHeartRateBpm,
          minHeartRateBpm,
          ...(heartRateSamplesJson !== undefined ? { heartRateSamplesJson } : {}),
          version: nextVersion,
          lastWriterDeviceId,
          lastSyncedAt: new Date(),
        },
        create: {
          clientSessionId: payload.clientSessionId,
          userId,
          templateId: resolvedTemplateId,
          stretchingRoutineId: resolvedStretchingRoutineId,
          sessionType: payload.sessionType,
          workoutNameSnapshot: payload.workoutNameSnapshot,
          status: payload.status,
          startedAt: new Date(payload.startedAt),
          pausedAt: payload.pausedAt ? new Date(payload.pausedAt) : null,
          completedAt: payload.completedAt ? new Date(payload.completedAt) : null,
          activeDurationSeconds: payload.activeDurationSeconds,
          weightUnit: payload.weightUnit,
          totalVolumeKg: metrics.totalVolumeKg,
          totalSetsCompleted: metrics.totalSetsCompleted,
          totalRepsCompleted: metrics.totalRepsCompleted,
          totalStretchSeconds: metrics.totalStretchSeconds,
          notes: payload.notes ?? null,
          restTimerEndsAt: payload.restTimerEndsAt ? new Date(payload.restTimerEndsAt) : null,
          restTimerDurationSec: payload.restTimerDurationSec ?? null,
          restTimerPausedRemSec: payload.restTimerPausedRemSec ?? null,
          sourceDevice,
          healthKitWorkoutUuid,
          activeCaloriesKcal,
          totalCaloriesKcal,
          avgHeartRateBpm,
          maxHeartRateBpm,
          minHeartRateBpm,
          ...(heartRateSamplesJson !== undefined ? { heartRateSamplesJson } : {}),
          version: nextVersion,
          lastWriterDeviceId,
          lastSyncedAt: new Date(),
        },
      });

      const incomingClientExerciseIds = payload.exercises.map((e) => e.clientExerciseId);
      await tx.sessionExercise.deleteMany({
        where: {
          sessionId: session.id,
          clientExerciseId: { notIn: incomingClientExerciseIds },
        },
      });

      for (const [idx, ex] of payload.exercises.entries()) {
        const resolvedExerciseId =
          ex.exerciseId && (!validExerciseIds || validExerciseIds.has(ex.exerciseId))
            ? ex.exerciseId
            : null;

        const upsertedEx = await tx.sessionExercise.upsert({
          where: { clientExerciseId: ex.clientExerciseId },
          update: {
            exerciseId: resolvedExerciseId,
            replacedExerciseId: ex.replacedExerciseId ?? null,
            replacedExerciseName: ex.replacedExerciseName ?? null,
            exerciseNameSnapshot: ex.exerciseNameSnapshot,
            primaryMuscleSnapshot: ex.primaryMuscleSnapshot,
            exerciseTypeSnapshot: ex.exerciseTypeSnapshot,
            origin: ex.origin,
            status: ex.status,
            orderIndex: ex.orderIndex ?? idx,
            plannedSets: ex.plannedSets,
            plannedWarmupSets: ex.plannedWarmupSets ?? 0,
            targetRepsMin: ex.targetRepsMin ?? null,
            targetRepsMax: ex.targetRepsMax ?? null,
            targetWeight: ex.targetWeight ?? null,
            targetDurationSeconds: ex.targetDurationSeconds ?? null,
            restSeconds: ex.restSeconds,
            alternativeExerciseIds: ex.alternativeExerciseIds ?? [],
            notes: ex.notes ?? null,
          },
          create: {
            clientExerciseId: ex.clientExerciseId,
            sessionId: session.id,
            exerciseId: resolvedExerciseId,
            replacedExerciseId: ex.replacedExerciseId ?? null,
            replacedExerciseName: ex.replacedExerciseName ?? null,
            exerciseNameSnapshot: ex.exerciseNameSnapshot,
            primaryMuscleSnapshot: ex.primaryMuscleSnapshot,
            exerciseTypeSnapshot: ex.exerciseTypeSnapshot,
            origin: ex.origin,
            status: ex.status,
            orderIndex: ex.orderIndex ?? idx,
            plannedSets: ex.plannedSets,
            plannedWarmupSets: ex.plannedWarmupSets ?? 0,
            targetRepsMin: ex.targetRepsMin ?? null,
            targetRepsMax: ex.targetRepsMax ?? null,
            targetWeight: ex.targetWeight ?? null,
            targetDurationSeconds: ex.targetDurationSeconds ?? null,
            restSeconds: ex.restSeconds,
            alternativeExerciseIds: ex.alternativeExerciseIds ?? [],
            notes: ex.notes ?? null,
          },
        });

        const incomingClientSetIds = ex.sets.map((s) => s.clientSetId);
        await tx.sessionSet.deleteMany({
          where: {
            sessionExerciseId: upsertedEx.id,
            clientSetId: { notIn: incomingClientSetIds },
          },
        });

        for (const [sIdx, s] of ex.sets.entries()) {
          await tx.sessionSet.upsert({
            where: { clientSetId: s.clientSetId },
            update: {
              setNumber: s.setNumber ?? sIdx + 1,
              setType: s.setType,
              weight: s.weight ?? null,
              weightUnit: s.weightUnit,
              reps: s.reps ?? null,
              durationSeconds: s.durationSeconds ?? null,
              distanceMeters: s.distanceMeters ?? null,
              rpe: s.rpe ?? null,
              completed: s.completed,
              completedAt: s.completedAt ? new Date(s.completedAt) : null,
              isPersonalRecord: s.isPersonalRecord ?? false,
              notes: s.notes ?? null,
              avgHeartRateBpm: s.avgHeartRateBpm ?? null,
              peakHeartRateBpm: s.peakHeartRateBpm ?? null,
              restEndHeartRateBpm: s.restEndHeartRateBpm ?? null,
            },
            create: {
              clientSetId: s.clientSetId,
              sessionExerciseId: upsertedEx.id,
              setNumber: s.setNumber ?? sIdx + 1,
              setType: s.setType,
              weight: s.weight ?? null,
              weightUnit: s.weightUnit,
              reps: s.reps ?? null,
              durationSeconds: s.durationSeconds ?? null,
              distanceMeters: s.distanceMeters ?? null,
              rpe: s.rpe ?? null,
              completed: s.completed,
              completedAt: s.completedAt ? new Date(s.completedAt) : null,
              isPersonalRecord: s.isPersonalRecord ?? false,
              notes: s.notes ?? null,
              avgHeartRateBpm: s.avgHeartRateBpm ?? null,
              peakHeartRateBpm: s.peakHeartRateBpm ?? null,
              restEndHeartRateBpm: s.restEndHeartRateBpm ?? null,
            },
          });
        }
      }

      return tx.workoutSession.findUniqueOrThrow({
        where: { id: session.id },
        include: {
          exercises: {
            orderBy: { orderIndex: 'asc' },
            include: { sets: { orderBy: { setNumber: 'asc' } } },
          },
        },
      });
    });

    const syncedDto = this.mapSessionDto(synced);
    const justCompleted =
      syncedDto.status === SessionStatus.COMPLETED && existing?.status !== SessionStatus.COMPLETED;
    if (justCompleted && this.workoutService) {
      await this.workoutService.applyCompletedSessionToTemplate(userId, syncedDto, locale);
    }

    return {
      session: syncedDto,
      conflictDetected: false,
      serverVersion: synced.version,
    };
  }

  async getActiveSession(userId: string): Promise<WorkoutSessionDto | null> {
    const active = await this.prisma.workoutSession.findFirst({
      where: {
        userId,
        status: { in: [SessionStatus.IN_PROGRESS, SessionStatus.PAUSED] },
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        exercises: {
          orderBy: { orderIndex: 'asc' },
          include: { sets: { orderBy: { setNumber: 'asc' } } },
        },
      },
    });
    return active ? this.mapSessionDto(active) : null;
  }

  async listSessions(
    userId: string,
    filters?: { from?: string; to?: string; status?: SessionStatus },
  ): Promise<WorkoutSessionDto[]> {
    const sessions = await this.prisma.workoutSession.findMany({
      where: {
        userId,
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.from || filters?.to
          ? {
              startedAt: {
                ...(filters.from ? { gte: new Date(filters.from) } : {}),
                ...(filters.to ? { lte: new Date(filters.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { startedAt: 'desc' },
      include: {
        exercises: {
          orderBy: { orderIndex: 'asc' },
          include: { sets: { orderBy: { setNumber: 'asc' } } },
        },
      },
    });

    return sessions.map((s) => this.mapSessionDto(s));
  }

  async getSessionById(userId: string, sessionId: string): Promise<WorkoutSessionDto> {
    const session = await this.prisma.workoutSession.findFirst({
      where: {
        OR: [{ id: sessionId }, { clientSessionId: sessionId }],
      },
      include: {
        exercises: {
          orderBy: { orderIndex: 'asc' },
          include: { sets: { orderBy: { setNumber: 'asc' } } },
        },
      },
    });
    if (!session) {
      throw new NotFoundException('Workout session not found');
    }
    if (session.userId !== userId) {
      throw new ForbiddenException('Access denied to this workout session');
    }
    return this.mapSessionDto(session);
  }

  async deleteSession(userId: string, sessionId: string): Promise<{ success: boolean }> {
    const session = await this.prisma.workoutSession.findFirst({
      where: {
        OR: [{ id: sessionId }, { clientSessionId: sessionId }],
      },
    });
    if (!session) {
      return { success: true };
    }
    if (session.userId !== userId) {
      throw new ForbiddenException('Access denied to this workout session');
    }
    await this.prisma.workoutSession.delete({ where: { id: session.id } });
    if (
      (session.status === SessionStatus.IN_PROGRESS || session.status === SessionStatus.PAUSED) &&
      this.prisma.workoutSession.deleteMany
    ) {
      await this.prisma.workoutSession.deleteMany({
        where: {
          userId,
          status: { in: [SessionStatus.IN_PROGRESS, SessionStatus.PAUSED] },
        },
      });
    }
    return { success: true };
  }

  private mapSessionDto(session: any): WorkoutSessionDto {
    return {
      id: session.id,
      clientSessionId: session.clientSessionId,
      userId: session.userId,
      templateId: session.templateId,
      stretchingRoutineId: session.stretchingRoutineId,
      sessionType: session.sessionType,
      workoutNameSnapshot: session.workoutNameSnapshot,
      status: session.status,
      startedAt:
        session.startedAt instanceof Date ? session.startedAt.toISOString() : session.startedAt,
      pausedAt:
        session.pausedAt instanceof Date ? session.pausedAt.toISOString() : session.pausedAt,
      completedAt:
        session.completedAt instanceof Date
          ? session.completedAt.toISOString()
          : session.completedAt,
      activeDurationSeconds: session.activeDurationSeconds,
      weightUnit: session.weightUnit,
      totalVolumeKg: session.totalVolumeKg,
      totalSetsCompleted: session.totalSetsCompleted,
      totalRepsCompleted: session.totalRepsCompleted,
      totalStretchSeconds: session.totalStretchSeconds,
      notes: session.notes,
      restTimerEndsAt:
        session.restTimerEndsAt instanceof Date
          ? session.restTimerEndsAt.toISOString()
          : session.restTimerEndsAt,
      restTimerDurationSec: session.restTimerDurationSec,
      restTimerPausedRemSec: session.restTimerPausedRemSec,
      sourceDevice: session.sourceDevice ?? SessionSourceDevice.WEB,
      healthKitWorkoutUuid: session.healthKitWorkoutUuid ?? null,
      activeCaloriesKcal: session.activeCaloriesKcal ?? null,
      totalCaloriesKcal: session.totalCaloriesKcal ?? null,
      avgHeartRateBpm: session.avgHeartRateBpm ?? null,
      maxHeartRateBpm: session.maxHeartRateBpm ?? null,
      minHeartRateBpm: session.minHeartRateBpm ?? null,
      heartRateSamples: Array.isArray(session.heartRateSamplesJson)
        ? (session.heartRateSamplesJson as HeartRateSampleDto[])
        : null,
      version: session.version,
      lastSyncedAt:
        session.lastSyncedAt instanceof Date
          ? session.lastSyncedAt.toISOString()
          : session.lastSyncedAt,
      exercises: (session.exercises ?? []).map((ex: any) => ({
        id: ex.id,
        clientExerciseId: ex.clientExerciseId,
        sessionId: ex.sessionId,
        exerciseId: ex.exerciseId,
        replacedExerciseId: ex.replacedExerciseId,
        replacedExerciseName: ex.replacedExerciseName,
        exerciseNameSnapshot: ex.exerciseNameSnapshot,
        primaryMuscleSnapshot: ex.primaryMuscleSnapshot,
        exerciseTypeSnapshot: ex.exerciseTypeSnapshot,
        origin: ex.origin,
        status: ex.status,
        orderIndex: ex.orderIndex,
        plannedSets: ex.plannedSets,
        plannedWarmupSets: ex.plannedWarmupSets,
        targetRepsMin: ex.targetRepsMin,
        targetRepsMax: ex.targetRepsMax,
        targetWeight: ex.targetWeight,
        targetDurationSeconds: ex.targetDurationSeconds,
        restSeconds: ex.restSeconds,
        alternativeExerciseIds: ex.alternativeExerciseIds ?? [],
        notes: ex.notes,
        sets: (ex.sets ?? []).map((s: any) => ({
          id: s.id,
          clientSetId: s.clientSetId,
          sessionExerciseId: s.sessionExerciseId,
          setNumber: s.setNumber,
          setType: s.setType,
          weight: s.weight,
          weightUnit: s.weightUnit,
          reps: s.reps,
          durationSeconds: s.durationSeconds,
          distanceMeters: s.distanceMeters,
          rpe: s.rpe,
          completed: s.completed,
          completedAt: s.completedAt instanceof Date ? s.completedAt.toISOString() : s.completedAt,
          isPersonalRecord: s.isPersonalRecord,
          notes: s.notes,
          avgHeartRateBpm: s.avgHeartRateBpm ?? null,
          peakHeartRateBpm: s.peakHeartRateBpm ?? null,
          restEndHeartRateBpm: s.restEndHeartRateBpm ?? null,
        })),
      })),
    };
  }
}
