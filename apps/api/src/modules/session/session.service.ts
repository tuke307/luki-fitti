import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import crypto from 'crypto';
import { PrismaService } from '../database/prisma.service';
import {
  ExerciseType,
  SessionExerciseOrigin,
  SessionExerciseStatus,
  SessionStatus,
  SessionType,
  SetType,
  WeightUnit,
} from '@luki-fitti/common/enums';
import type {
  StartSessionDto,
  SyncSessionPayloadDto,
  SyncSessionResponseDto,
  WorkoutSessionDto,
} from '@luki-fitti/common/schemas';

const LBS_TO_KG = 0.45359237;

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Computes volume and duration metrics consistently:
   * - Strength volume (KG) = sum of weight(kg) * reps for completed WORKING/DROPSET/FAILURE sets on STRENGTH exercises.
   * - Stretching duration (sec) = sum of durationSeconds for completed sets on STRETCHING/MOBILITY exercises or STRETCH setType.
   * Incomparable measurements are never combined.
   */
  public computeSessionMetrics(exercises: SyncSessionPayloadDto['exercises']) {
    let totalVolumeKg = 0;
    let totalSetsCompleted = 0;
    let totalRepsCompleted = 0;
    let totalStretchSeconds = 0;

    for (const ex of exercises) {
      const isStretchType =
        ex.exerciseTypeSnapshot === ExerciseType.STRETCHING ||
        ex.exerciseTypeSnapshot === ExerciseType.MOBILITY;

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

  async startSession(userId: string, dto: StartSessionDto): Promise<WorkoutSessionDto> {
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
      workoutName = tpl.name;
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

        exercisesToCreate.push({
          clientExerciseId: crypto.randomUUID(),
          exerciseId: te.exerciseId,
          exerciseNameSnapshot: te.exercise.name,
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
          notes: te.notes,
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
      workoutName = routine.name;
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
          exerciseNameSnapshot: re.exercise.name,
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
          notes: re.notes,
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
   * Idempotent synchronization of an offline-first session.
   * Uses clientSessionId, clientExerciseId, and clientSetId so repeated sync
   * attempts never create duplicate sessions or duplicate set entries.
   */
  async syncSession(
    userId: string,
    payload: SyncSessionPayloadDto,
  ): Promise<SyncSessionResponseDto> {
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

    if (existing && existing.version > payload.version && !payload.forceOverwrite) {
      return {
        session: this.mapSessionDto(existing),
        conflictDetected: true,
        serverVersion: existing.version,
      };
    }

    const metrics = this.computeSessionMetrics(payload.exercises);
    const nextVersion = existing ? Math.max(existing.version, payload.version) + 1 : 1;

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
      new Set(
        payload.exercises
          .map((e) => e.exerciseId)
          .filter((id): id is string => Boolean(id)),
      ),
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
          version: nextVersion,
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
          version: 1,
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

    return {
      session: this.mapSessionDto(synced),
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
      pausedAt: session.pausedAt instanceof Date ? session.pausedAt.toISOString() : session.pausedAt,
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
          completedAt:
            s.completedAt instanceof Date ? s.completedAt.toISOString() : s.completedAt,
          isPersonalRecord: s.isPersonalRecord,
          notes: s.notes,
        })),
      })),
    };
  }
}
