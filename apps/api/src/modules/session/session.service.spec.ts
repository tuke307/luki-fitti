import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SessionService } from './session.service';
import {
  ExerciseType,
  MuscleGroup,
  SessionExerciseOrigin,
  SessionExerciseStatus,
  SessionSourceDevice,
  SessionStatus,
  SessionType,
  SetType,
  WeightUnit,
} from '@luki-fitti/common/enums';

function createMockSessionPrisma() {
  const sessions = new Map<string, any>();
  const exercises = new Map<string, any>();
  const sets = new Map<string, any>();

  const buildFullSession = (s: any) => {
    if (!s) return null;
    const exList = Array.from(exercises.values())
      .filter((e) => e.sessionId === s.id)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((e) => ({
        ...e,
        sets: Array.from(sets.values())
          .filter((st) => st.sessionExerciseId === e.id)
          .sort((a, b) => a.setNumber - b.setNumber),
      }));
    return { ...s, exercises: exList };
  };

  const prisma: any = {
    workoutSession: {
      findUnique: async ({ where }: any) => {
        if (where.clientSessionId) {
          const found = Array.from(sessions.values()).find(
            (s) => s.clientSessionId === where.clientSessionId,
          );
          return buildFullSession(found);
        }
        if (where.id) return buildFullSession(sessions.get(where.id));
        return null;
      },
      findUniqueOrThrow: async ({ where }: any) => {
        const s = sessions.get(where.id);
        if (!s) throw new Error('Not found');
        return buildFullSession(s);
      },
      upsert: async ({ where, update, create }: any) => {
        const existing = Array.from(sessions.values()).find(
          (s) => s.clientSessionId === where.clientSessionId,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const id = `db-sess-${sessions.size + 1}`;
        const created = { id, ...create };
        sessions.set(id, created);
        return created;
      },
    },
    sessionExercise: {
      deleteMany: async ({ where }: any) => {
        for (const [k, v] of exercises.entries()) {
          if (
            v.sessionId === where.sessionId &&
            !where.clientExerciseId.notIn.includes(v.clientExerciseId)
          ) {
            exercises.delete(k);
          }
        }
      },
      upsert: async ({ where, update, create }: any) => {
        const existing = Array.from(exercises.values()).find(
          (e) => e.clientExerciseId === where.clientExerciseId,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const id = `db-ex-${exercises.size + 1}`;
        const created = { id, ...create };
        exercises.set(id, created);
        return created;
      },
    },
    sessionSet: {
      deleteMany: async ({ where }: any) => {
        for (const [k, v] of sets.entries()) {
          if (
            v.sessionExerciseId === where.sessionExerciseId &&
            !where.clientSetId.notIn.includes(v.clientSetId)
          ) {
            sets.delete(k);
          }
        }
      },
      upsert: async ({ where, update, create }: any) => {
        const existing = Array.from(sets.values()).find(
          (st) => st.clientSetId === where.clientSetId,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const id = `db-set-${sets.size + 1}`;
        const created = { id, ...create };
        sets.set(id, created);
        return created;
      },
    },
    $transaction: async (fn: any) => fn(prisma),
    _sessions: sessions,
    _sets: sets,
  };

  return prisma;
}

describe('SessionService — Offline Sync Idempotency, Conflict Detection & Volume Math', () => {
  it('calculates working strength volume separately from warm-ups and stretching duration', () => {
    const prisma = createMockSessionPrisma();
    const service = new SessionService(prisma);

    const metrics = service.computeSessionMetrics([
      {
        clientExerciseId: 'ex-1',
        exerciseNameSnapshot: 'Barbell Bench Press',
        primaryMuscleSnapshot: MuscleGroup.CHEST,
        exerciseTypeSnapshot: ExerciseType.STRENGTH,
        origin: SessionExerciseOrigin.PLANNED,
        status: SessionExerciseStatus.COMPLETED,
        orderIndex: 0,
        plannedSets: 2,
        plannedWarmupSets: 1,
        restSeconds: 90,
        alternativeExerciseIds: [],
        sets: [
          {
            clientSetId: 's-warmup',
            setNumber: 1,
            setType: SetType.WARMUP,
            weight: 50,
            weightUnit: WeightUnit.KG,
            reps: 10,
            completed: true,
          },
          {
            clientSetId: 's-work-1',
            setNumber: 2,
            setType: SetType.WORKING,
            weight: 80,
            weightUnit: WeightUnit.KG,
            reps: 8,
            completed: true,
          },
        ],
      },
      {
        clientExerciseId: 'ex-2',
        exerciseNameSnapshot: 'Couch Stretch',
        primaryMuscleSnapshot: MuscleGroup.HIP_FLEXORS,
        exerciseTypeSnapshot: ExerciseType.STRETCHING,
        origin: SessionExerciseOrigin.ADDED,
        status: SessionExerciseStatus.COMPLETED,
        orderIndex: 1,
        plannedSets: 1,
        plannedWarmupSets: 0,
        restSeconds: 15,
        alternativeExerciseIds: [],
        sets: [
          {
            clientSetId: 's-stretch-1',
            setNumber: 1,
            setType: SetType.STRETCH,
            weight: null,
            weightUnit: WeightUnit.KG,
            reps: null,
            durationSeconds: 60,
            completed: true,
          },
        ],
      },
    ]);

    // Working set only: 80kg * 8 = 640kg (warmup 50*10 is excluded from volume)
    assert.equal(metrics.totalVolumeKg, 640);
    assert.equal(metrics.totalSetsCompleted, 3);
    assert.equal(metrics.totalStretchSeconds, 60);
  });

  it('handles repeated offline sync requests idempotently without duplicating sessions or sets, and detects version conflicts', async () => {
    const prisma = createMockSessionPrisma();
    const service = new SessionService(prisma);

    const basePayload = {
      clientSessionId: 'client-uuid-100',
      sessionType: SessionType.STRENGTH,
      workoutNameSnapshot: 'Day 1 — Chest & Triceps',
      status: SessionStatus.IN_PROGRESS,
      startedAt: new Date().toISOString(),
      activeDurationSeconds: 1200,
      weightUnit: WeightUnit.KG,
      version: 1,
      exercises: [
        {
          clientExerciseId: 'cex-1',
          exerciseNameSnapshot: 'Barbell Bench Press',
          primaryMuscleSnapshot: MuscleGroup.CHEST,
          exerciseTypeSnapshot: ExerciseType.STRENGTH,
          origin: SessionExerciseOrigin.PLANNED,
          status: SessionExerciseStatus.IN_PROGRESS,
          orderIndex: 0,
          plannedSets: 3,
          plannedWarmupSets: 0,
          restSeconds: 90,
          alternativeExerciseIds: [],
          sets: [
            {
              clientSetId: 'cset-1',
              setNumber: 1,
              setType: SetType.WORKING,
              weight: 85,
              weightUnit: WeightUnit.KG,
              reps: 8,
              completed: true,
            },
          ],
        },
      ],
    };

    const sync1 = await service.syncSession('user-1', basePayload);
    assert.equal(sync1.conflictDetected, false);
    assert.equal(prisma._sessions.size, 1);
    assert.equal(prisma._sets.size, 1);

    // Repeating the exact same request with higher/matching version updates in place without duplicating
    const sync2 = await service.syncSession('user-1', { ...basePayload, version: 2 });
    assert.equal(sync2.conflictDetected, false);
    assert.equal(prisma._sessions.size, 1);
    assert.equal(prisma._sets.size, 1);

    // Sending a stale version (version 1 when server is at version 3) flags a conflict instead of silently overwriting
    const staleSync = await service.syncSession('user-1', { ...basePayload, version: 1 });
    assert.equal(staleSync.conflictDetected, true);

    // Another user cannot sync into user-1's session
    await assert.rejects(() => service.syncSession('user-2', basePayload), /another user/i);
  });

  it('treats a retried sync from the same device as idempotent, even when the first response was lost', async () => {
    const prisma = createMockSessionPrisma();
    const service = new SessionService(prisma);
    const payload = {
      clientSessionId: 'client-uuid-lost-response',
      sessionType: SessionType.STRENGTH,
      workoutNameSnapshot: 'Day 4 - Schultern',
      status: SessionStatus.IN_PROGRESS,
      startedAt: new Date().toISOString(),
      activeDurationSeconds: 600,
      weightUnit: WeightUnit.KG,
      deviceId: 'device-iphone',
      version: 5,
      exercises: [],
    };

    const first = await service.syncSession('user-1', payload);
    assert.equal(first.conflictDetected, false);

    // The phone was locked before the response arrived, so the same payload is sent again.
    const retry = await service.syncSession('user-1', payload);
    assert.equal(retry.conflictDetected, false);

    // Further local edits keep syncing without conflicts.
    const next = await service.syncSession('user-1', { ...payload, version: 6 });
    assert.equal(next.conflictDetected, false);
  });

  it('accepts a same-device sync against a legacy server row that bumped the version by one', async () => {
    const prisma = createMockSessionPrisma();
    const service = new SessionService(prisma);
    const legacy = {
      clientSessionId: 'client-uuid-legacy',
      sessionType: SessionType.STRENGTH,
      workoutNameSnapshot: 'Legacy',
      status: SessionStatus.IN_PROGRESS,
      startedAt: new Date().toISOString(),
      activeDurationSeconds: 0,
      weightUnit: WeightUnit.KG,
      version: 1,
      exercises: [],
    };
    await service.syncSession('user-1', legacy);
    await service.syncSession('user-1', { ...legacy, version: 2 }); // server row is now v3

    const res = await service.syncSession('user-1', {
      ...legacy,
      deviceId: 'device-iphone',
      version: 2,
    });
    assert.equal(res.conflictDetected, false);
  });

  it('still detects a real conflict when another device wrote a newer version', async () => {
    const prisma = createMockSessionPrisma();
    const service = new SessionService(prisma);
    const base = {
      clientSessionId: 'client-uuid-two-devices',
      sessionType: SessionType.STRENGTH,
      workoutNameSnapshot: 'Day 1',
      status: SessionStatus.IN_PROGRESS,
      startedAt: new Date().toISOString(),
      activeDurationSeconds: 0,
      weightUnit: WeightUnit.KG,
      version: 3,
      exercises: [],
    };

    const created = await service.syncSession('user-1', { ...base, deviceId: 'device-mac' });
    assert.equal(created.serverVersion, 3);

    // The iPhone picked up server v3 and edits it.
    const iphone = await service.syncSession('user-1', {
      ...base,
      deviceId: 'device-iphone',
      version: 4,
      baseVersion: 3,
    });
    assert.equal(iphone.conflictDetected, false);
    assert.ok(iphone.serverVersion > 4);

    // The Mac edits its own copy without having seen the iPhone write.
    const mac = await service.syncSession('user-1', {
      ...base,
      deviceId: 'device-mac',
      version: 4,
      baseVersion: 3,
    });
    assert.equal(mac.conflictDetected, true);

    const forced = await service.syncSession('user-1', {
      ...base,
      deviceId: 'device-mac',
      version: 4,
      baseVersion: 3,
      forceOverwrite: true,
    });
    assert.equal(forced.conflictDetected, false);
    assert.ok(forced.serverVersion > iphone.serverVersion);
  });

  it('updates the template once, when a session is first synced as completed', async () => {
    const prisma = createMockSessionPrisma();
    const calls: Array<{ userId: string; templateId: string | null }> = [];
    const workoutService = {
      applyCompletedSessionToTemplate: async (
        userId: string,
        session: { templateId: string | null },
      ) => {
        calls.push({ userId, templateId: session.templateId });
      },
    };
    const service = new SessionService(prisma, workoutService as never);
    const base = {
      clientSessionId: 'client-uuid-writeback',
      templateId: 'tpl-1',
      sessionType: SessionType.STRENGTH,
      workoutNameSnapshot: 'Day 4',
      status: SessionStatus.IN_PROGRESS,
      startedAt: new Date().toISOString(),
      activeDurationSeconds: 0,
      weightUnit: WeightUnit.KG,
      deviceId: 'device-iphone',
      version: 1,
      exercises: [],
    };

    await service.syncSession('user-1', base);
    assert.equal(calls.length, 0);
    await service.syncSession('user-1', { ...base, status: SessionStatus.COMPLETED, version: 2 });
    assert.equal(calls.length, 1);
    // Later corrections of a finished session do not rewrite the template again.
    await service.syncSession('user-1', { ...base, status: SessionStatus.COMPLETED, version: 3 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.userId, 'user-1');
  });

  it('persists Apple Watch HealthKit telemetry, heartRateSamples, and per-set HR metrics and computes fallback HR stats', async () => {
    const prisma = createMockSessionPrisma();
    const service = new SessionService(prisma);

    const watchPayload = {
      clientSessionId: 'watch-session-uuid-1',
      sessionType: SessionType.STRENGTH,
      workoutNameSnapshot: 'Day 1 — Chest & Triceps',
      status: SessionStatus.COMPLETED,
      startedAt: new Date(Date.now() - 3600_000).toISOString(),
      completedAt: new Date().toISOString(),
      activeDurationSeconds: 3420,
      weightUnit: WeightUnit.KG,
      sourceDevice: SessionSourceDevice.APPLE_WATCH,
      healthKitWorkoutUuid: '550e8400-e29b-41d4-a716-446655440000',
      activeCaloriesKcal: 412.5,
      totalCaloriesKcal: 538.0,
      heartRateSamples: [
        { offsetSec: 0, bpm: 110 },
        { offsetSec: 5, bpm: 140 },
        { offsetSec: 10, bpm: 170 },
      ],
      version: 1,
      exercises: [
        {
          clientExerciseId: 'watch-ex-1',
          exerciseNameSnapshot: 'Barbell Bench Press',
          primaryMuscleSnapshot: MuscleGroup.CHEST,
          exerciseTypeSnapshot: ExerciseType.STRENGTH,
          origin: SessionExerciseOrigin.PLANNED,
          status: SessionExerciseStatus.COMPLETED,
          orderIndex: 0,
          plannedSets: 1,
          plannedWarmupSets: 0,
          restSeconds: 90,
          alternativeExerciseIds: [],
          sets: [
            {
              clientSetId: 'watch-set-1',
              setNumber: 1,
              setType: SetType.WORKING,
              weight: 90,
              weightUnit: WeightUnit.KG,
              reps: 8,
              completed: true,
              avgHeartRateBpm: 142,
              peakHeartRateBpm: 168,
              restEndHeartRateBpm: 118,
            },
          ],
        },
      ],
    };

    const synced = await service.syncSession('user-1', watchPayload);
    assert.equal(synced.session.sourceDevice, SessionSourceDevice.APPLE_WATCH);
    assert.equal(synced.session.healthKitWorkoutUuid, '550e8400-e29b-41d4-a716-446655440000');
    assert.equal(synced.session.activeCaloriesKcal, 412.5);
    assert.equal(synced.session.totalCaloriesKcal, 538.0);
    // Computed fallback from [110, 140, 170]: avg = 140, max = 170, min = 110
    assert.equal(synced.session.avgHeartRateBpm, 140);
    assert.equal(synced.session.maxHeartRateBpm, 170);
    assert.equal(synced.session.minHeartRateBpm, 110);
    assert.equal(synced.session.heartRateSamples?.length, 3);
    const setDto = synced.session.exercises[0]?.sets[0];
    assert.equal(setDto?.avgHeartRateBpm, 142);
    assert.equal(setDto?.peakHeartRateBpm, 168);
    assert.equal(setDto?.restEndHeartRateBpm, 118);
  });
});
