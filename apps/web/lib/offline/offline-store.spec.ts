import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearAllLocalData,
  computeRemainingRestSeconds,
  createOfflineSessionFromStretchingRoutine,
  createOfflineSessionFromTemplate,
  enqueueSessionSync,
  getCachedCatalog,
  getCachedStretchingRoutines,
  getCachedWorkouts,
  getLocalActiveSession,
  getLocalHistorySessions,
  getSyncQueue,
  recalculateSessionTotals,
  removeFromSyncQueue,
  removeLocalHistorySession,
  saveLocalActiveSession,
  saveLocalHistorySession,
  setCachedCatalog,
  setCachedWorkouts,
  substituteExerciseInSession,
  toSyncPayload,
} from './offline-store';
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
import {
  computeExerciseProgression,
  computeWorkoutExerciseSuggestion,
  formatCompactDelta,
  formatRestDurationMinSec,
  groupExercisesIntoBlocks,
} from '@luki-fitti/common/utils/client';
import {
  getEquipmentLabel,
  getMuscleGroupLabel,
  interpolate,
  matchBrowserTagToLocale,
  resolveLocale,
} from '../i18n';
import { filterExercisesByQuery } from '../../components/gym/exercise-picker';
import { buildStarterWorkouts } from '@luki-fitti/common/catalog';
import type { WorkoutSessionDto } from '@luki-fitti/common/schemas';

describe('Offline Workout Engine — Recovery, Rest Timers & Exercise Substitution', () => {
  it('persists and recovers an active session across reloads and queues sync items', async () => {
    const catalog = await getCachedCatalog();
    const { folders } = buildStarterWorkouts({ userId: 'user-1' });
    const template = folders[0]!.templates[0]!;

    const session = createOfflineSessionFromTemplate(template, catalog, 'user-1', WeightUnit.KG);
    assert.equal(session.workoutNameSnapshot, template.name);
    assert.equal(session.exercises.length, template.exercises.length);

    // Complete first working set and persist locally
    const firstEx = session.exercises[0]!;
    const workingSet = firstEx.sets.find((s) => s.setType === 'WORKING')!;
    workingSet.completed = true;
    workingSet.weight = 90;
    workingSet.reps = 8;

    const updated = recalculateSessionTotals(session);
    assert.equal(updated.totalSetsCompleted, 1);
    assert.equal(updated.totalVolumeKg, 720);

    await saveLocalActiveSession(updated);
    await enqueueSessionSync(updated);

    const recovered = await getLocalActiveSession();
    assert.ok(recovered);
    assert.equal(recovered.clientSessionId, session.clientSessionId);
    assert.equal(recovered.totalVolumeKg, 720);

    const queue = await getSyncQueue();
    assert.equal(queue.length >= 1, true);
  });

  it('substitutes an exercise with an alternative during a session without modifying the original template', async () => {
    const catalog = await getCachedCatalog();
    const { folders } = buildStarterWorkouts({ userId: 'user-1' });
    const template = folders[0]!.templates[0]!;
    const originalFirstExerciseId = template.exercises[0]!.exerciseId;

    const session = createOfflineSessionFromTemplate(template, catalog, 'user-1', WeightUnit.KG);
    const targetClientExId = session.exercises[0]!.clientExerciseId;
    const backupExercise = catalog.find((c) => c.id === 'ex-machine-chest-press')!;

    const afterSub = substituteExerciseInSession(session, targetClientExId, backupExercise);

    assert.equal(afterSub.exercises[0]!.origin, SessionExerciseOrigin.SUBSTITUTED);
    assert.equal(afterSub.exercises[0]!.exerciseId, 'ex-machine-chest-press');
    assert.equal(afterSub.exercises[0]!.replacedExerciseId, originalFirstExerciseId);
    // Original template remains completely unchanged
    assert.equal(template.exercises[0]!.exerciseId, originalFirstExerciseId);
  });

  it('computes rest timer countdown from persisted timestamps so iOS suspension never drifts', () => {
    const startMs = 1_700_000_000_000;
    const endsAt = new Date(startMs + 90_000).toISOString();

    const after35s = computeRemainingRestSeconds(
      {
        restTimerEndsAt: endsAt,
        restTimerDurationSec: 90,
        restTimerPausedRemSec: null,
      },
      startMs + 35_000,
    );
    assert.equal(after35s.isRunning, true);
    assert.equal(after35s.remainingSeconds, 55);

    const paused = computeRemainingRestSeconds(
      {
        restTimerEndsAt: null,
        restTimerDurationSec: 90,
        restTimerPausedRemSec: 42,
      },
      startMs + 500_000,
    );
    assert.equal(paused.isPaused, true);
    assert.equal(paused.remainingSeconds, 42);
  });

  it('creates standalone stretching sessions with timed holds and transition intervals', async () => {
    const catalog = await getCachedCatalog();
    const stretchRoutine = {
      id: 'sr-test',
      userId: 'user-1',
      name: 'Hip Mobility Flow',
      description: null,
      targetArea: 'Hips',
      estimatedDurationSeconds: 300,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      exercises: [
        {
          id: 'sre-1',
          routineId: 'sr-test',
          exerciseId: 'ex-couch-hip-flexor-stretch',
          orderIndex: 0,
          sets: 2,
          durationSeconds: 60,
          reps: null,
          transitionSeconds: 15,
          notes: null,
        },
      ],
    };

    const session = createOfflineSessionFromStretchingRoutine(stretchRoutine, catalog, 'user-1');
    assert.equal(session.sessionType, 'STRETCHING');
    assert.equal(session.exercises[0]!.sets.length, 2);
    assert.equal(session.exercises[0]!.sets[0]!.durationSeconds, 60);
  });

  it('tracks single-source-of-truth exercise history across different workouts and suggests progressive overload deltas', async () => {
    const catalog = await getCachedCatalog();
    const { folders } = buildStarterWorkouts({ userId: 'user-1' });
    const templateA = folders[0]!.templates[0]!; // Contains Barbell Bench Press (ex-barbell-bench-press)

    // Simulate a completed historical session in a completely different workout ("Full Body Friday")
    const pastSession: WorkoutSessionDto = {
      id: 'hist-1',
      clientSessionId: 'hist-1',
      userId: 'user-1',
      templateId: 'other-template-id',
      stretchingRoutineId: null,
      sessionType: SessionType.STRENGTH,
      workoutNameSnapshot: 'Full Body Friday',
      status: SessionStatus.COMPLETED,
      startedAt: '2026-10-10T17:00:00.000Z',
      pausedAt: null,
      completedAt: '2026-10-10T18:00:00.000Z',
      activeDurationSeconds: 3600,
      weightUnit: WeightUnit.KG,
      totalVolumeKg: 2880,
      totalSetsCompleted: 3,
      totalRepsCompleted: 30,
      totalStretchSeconds: 0,
      notes: null,
      restTimerEndsAt: null,
      restTimerDurationSec: null,
      restTimerPausedRemSec: null,
      version: 1,
      lastSyncedAt: '2026-10-10T18:00:00.000Z',
      exercises: [
        {
          id: 'sex-hist-1',
          clientExerciseId: 'sex-hist-1',
          sessionId: 'hist-1',
          exerciseId: 'ex-barbell-bench-press',
          replacedExerciseId: null,
          replacedExerciseName: null,
          exerciseNameSnapshot: 'Barbell Bench Press',
          primaryMuscleSnapshot: MuscleGroup.CHEST,
          exerciseTypeSnapshot: ExerciseType.STRENGTH,
          origin: SessionExerciseOrigin.PLANNED,
          status: SessionExerciseStatus.COMPLETED,
          orderIndex: 0,
          plannedSets: 3,
          plannedWarmupSets: 0,
          targetRepsMin: 6,
          targetRepsMax: 10,
          targetWeight: 80,
          targetDurationSeconds: null,
          restSeconds: 120,
          alternativeExerciseIds: [],
          notes: null,
          sets: [
            {
              id: 's1',
              clientSetId: 's1',
              sessionExerciseId: 'sex-hist-1',
              setNumber: 1,
              setType: SetType.WORKING,
              weight: 85,
              weightUnit: WeightUnit.KG,
              reps: 10,
              durationSeconds: null,
              distanceMeters: null,
              rpe: 8,
              completed: true,
              completedAt: '2026-10-10T17:15:00.000Z',
              isPersonalRecord: false,
              notes: null,
            },
            {
              id: 's2',
              clientSetId: 's2',
              sessionExerciseId: 'sex-hist-1',
              setNumber: 2,
              setType: SetType.WORKING,
              weight: 85,
              weightUnit: WeightUnit.KG,
              reps: 10,
              durationSeconds: null,
              distanceMeters: null,
              rpe: 8.5,
              completed: true,
              completedAt: '2026-10-10T17:18:00.000Z',
              isPersonalRecord: false,
              notes: null,
            },
            {
              id: 's3',
              clientSetId: 's3',
              sessionExerciseId: 'sex-hist-1',
              setNumber: 3,
              setType: SetType.WORKING,
              weight: 85,
              weightUnit: WeightUnit.KG,
              reps: 10,
              durationSeconds: null,
              distanceMeters: null,
              rpe: 8.5,
              completed: true,
              completedAt: '2026-10-10T17:21:00.000Z',
              isPersonalRecord: false,
              notes: null,
            },
          ],
        },
      ],
    };

    // Start templateA ("Day 1 — Chest & Triceps") with historySessions
    const newSession = createOfflineSessionFromTemplate(
      templateA,
      catalog,
      'user-1',
      WeightUnit.KG,
      [pastSession],
    );

    const benchInNewSession = newSession.exercises.find(
      (e) => e.exerciseId === 'ex-barbell-bench-press',
    )!;
    const workingSets = benchInNewSession.sets.filter((s) => s.setType === SetType.WORKING);

    // Pre-populated from global history (85kg x 10 instead of template default 80kg x 6)
    assert.equal(workingSets[0]!.weight, 85);
    assert.equal(workingSets[0]!.reps, 10);

    // Since all 3 sets hit the top of the 6-10 rep band at manageable RPE, engine recommends +2.5kg
    const insight = computeExerciseProgression({
      exerciseId: 'ex-barbell-bench-press',
      exerciseName: 'Barbell Bench Press',
      historySessions: [pastSession],
      catalogExercise: catalog.find((c) => c.id === 'ex-barbell-bench-press'),
      plannedSets: 3,
      targetRepsMin: 6,
      targetRepsMax: 10,
      targetWeight: 80,
      weightUnit: WeightUnit.KG,
      currentSets: benchInNewSession.sets,
    });

    assert.equal(insight.phase, 'INCREASE_WEIGHT');
    assert.equal(insight.setSuggestions[0]!.suggestedWeight, 87.5);
    assert.equal(insight.setSuggestions[0]!.weightDelta, 2.5);
    assert.equal(formatCompactDelta(insight.setSuggestions[0]!.weightDelta), '+2.5');
  });

  it('ignores non-completed sessions in history and permanently removes abandoned or deleted sessions', async () => {
    const catalog = await getCachedCatalog();
    const { folders } = buildStarterWorkouts({ userId: 'user-1' });
    const template = folders[0]!.templates[0]!;

    const inProgress = createOfflineSessionFromTemplate(template, catalog, 'user-1');
    await saveLocalHistorySession(inProgress);
    await enqueueSessionSync(inProgress);

    // Non-completed session must not pollute local history
    const afterInProgress = await getLocalHistorySessions();
    assert.equal(
      afterInProgress.some((s) => s.clientSessionId === inProgress.clientSessionId),
      false,
    );

    // Abandoning removes it from active session and sync queue
    await saveLocalActiveSession(null);
    await removeFromSyncQueue(inProgress.clientSessionId);
    const queueAfterAbandon = await getSyncQueue();
    assert.equal(
      queueAfterAbandon.some((q) => q.clientSessionId === inProgress.clientSessionId),
      false,
    );

    // Completing a session saves to history, and deleting removes it permanently
    const completed: WorkoutSessionDto = {
      ...inProgress,
      status: SessionStatus.COMPLETED,
      completedAt: new Date().toISOString(),
    };
    await saveLocalHistorySession(completed);
    assert.equal(
      (await getLocalHistorySessions()).some(
        (s) => s.clientSessionId === completed.clientSessionId,
      ),
      true,
    );

    await removeLocalHistorySession(completed.clientSessionId);
    assert.equal(
      (await getLocalHistorySessions()).some(
        (s) => s.clientSessionId === completed.clientSessionId,
      ),
      false,
    );
  });

  it('preserves 0s rest for superset exercises and populates exercise media and expanded stretching routines', async () => {
    const catalog = await getCachedCatalog();
    const routines = await getCachedStretchingRoutines();
    assert.equal(routines.length >= 6, true);
    // Every exercise links a video guide; exercises without a faithful photo fall back to the
    // anatomy visual, so at least 95% must also carry start/finish images.
    assert.equal(
      catalog.every((ex) => ex.media?.some((m) => m.mediaType === 'VIDEO_LINK')),
      true,
    );
    const withImages = catalog.filter(
      (ex) => (ex.media ?? []).filter((m) => m.mediaType === 'IMAGE').length >= 2,
    );
    assert.equal(withImages.length / catalog.length >= 0.95, true);

    const { folders } = buildStarterWorkouts({ userId: 'user-1' });
    const baseTemplate = folders[0]!.templates[0]!;
    const supersetTemplate = {
      ...baseTemplate,
      exercises: baseTemplate.exercises.map((ex, idx) =>
        idx === 0 ? { ...ex, restSeconds: 0 } : ex,
      ),
    };

    const session = createOfflineSessionFromTemplate(supersetTemplate, catalog, 'user-1');
    assert.equal(session.exercises[0]!.restSeconds, 0);
  });

  it('wipes cached workouts, custom exercises, active session, and history on logout via clearAllLocalData', async () => {
    const catalog = await getCachedCatalog();
    await setCachedCatalog([
      ...catalog,
      {
        id: 'custom-user-ex',
        slug: 'custom-user-ex',
        userId: 'user-1',
        name: 'Secret Custom Exercise',
        description: 'Custom exercise',
        instructions: [],
        category: catalog[0]!.category,
        exerciseType: ExerciseType.STRENGTH,
        primaryMuscleGroup: MuscleGroup.CHEST,
        secondaryMuscleGroups: [],
        equipment: catalog[0]!.equipment,
        recommendedDurationSeconds: null,
        tags: [],
        isSystem: false,
        alternativeExerciseIds: [],
      },
    ]);

    await setCachedWorkouts({
      folders: [
        {
          id: 'custom-folder',
          userId: 'user-1',
          name: 'User Private Split',
          color: '#CCFF00',
          sortOrder: 0,
          templates: [],
        },
      ],
      unfiledTemplates: [],
    });

    const { folders } = buildStarterWorkouts({ userId: 'user-1' });
    const active = createOfflineSessionFromTemplate(folders[0]!.templates[0]!, catalog, 'user-1');
    await saveLocalActiveSession(active);
    await enqueueSessionSync(active);
    await saveLocalHistorySession({
      ...active,
      status: SessionStatus.COMPLETED,
      completedAt: new Date().toISOString(),
    });

    await clearAllLocalData();

    assert.equal(await getLocalActiveSession(), null);
    assert.equal((await getLocalHistorySessions()).length, 0);
    assert.equal((await getSyncQueue()).length, 0);
    const resetCatalog = await getCachedCatalog();
    assert.equal(
      resetCatalog.some((e) => e.id === 'custom-user-ex'),
      false,
    );
    const resetWorkouts = await getCachedWorkouts();
    assert.equal(
      resetWorkouts.folders.some((f) => f.id === 'custom-folder'),
      false,
    );
  });

  it('supports bilingual (EN/DE) exercise search and i18n locale resolution', async () => {
    const catalog = await getCachedCatalog();
    assert.equal(catalog.length > 50, true);

    // Search by German alias / muscle / equipment
    const benchMatches = filterExercisesByQuery(catalog, 'bankdrücken');
    assert.equal(
      benchMatches.some((e) => e.id === 'ex-barbell-bench-press'),
      true,
    );

    const chestDeMatches = filterExercisesByQuery(catalog, 'Brust');
    assert.equal(
      chestDeMatches.some((e) => e.primaryMuscleGroup === MuscleGroup.CHEST),
      true,
    );

    const cableDeMatches = filterExercisesByQuery(catalog, 'Kabelzug');
    assert.equal(cableDeMatches.length > 0, true);

    // Locale detection and translation helpers
    assert.equal(matchBrowserTagToLocale('de-DE'), 'de');
    assert.equal(matchBrowserTagToLocale('de-CH'), 'de');
    assert.equal(matchBrowserTagToLocale('en-US'), 'en');
    assert.equal(matchBrowserTagToLocale('fr-FR'), null);
    assert.equal(resolveLocale('de'), 'de');
    assert.equal(resolveLocale('en'), 'en');
    assert.equal(getMuscleGroupLabel(MuscleGroup.CHEST, 'de'), 'Brust');
    assert.equal(getMuscleGroupLabel(MuscleGroup.CHEST, 'en'), 'Chest');
    assert.equal(getEquipmentLabel(catalog[0]!.equipment, 'de'), 'Langhantel');
    assert.equal(
      interpolate('Duplicated "{name}"', { name: 'Push A (Copy)' }),
      'Duplicated "Push A (Copy)"',
    );
  });

  it('preserves Apple Watch HealthKit telemetry, heartRateSamples, and per-set HR fields in toSyncPayload', async () => {
    const catalog = await getCachedCatalog();
    const { folders } = buildStarterWorkouts({ userId: 'user-1' });
    const session = createOfflineSessionFromTemplate(folders[0]!.templates[0]!, catalog, 'user-1');
    session.sourceDevice = SessionSourceDevice.APPLE_WATCH;
    session.healthKitWorkoutUuid = '550e8400-e29b-41d4-a716-446655440000';
    session.activeCaloriesKcal = 415;
    session.totalCaloriesKcal = 530;
    session.avgHeartRateBpm = 142;
    session.maxHeartRateBpm = 176;
    session.minHeartRateBpm = 94;
    session.heartRateSamples = [
      { offsetSec: 0, bpm: 105 },
      { offsetSec: 5, bpm: 142 },
    ];
    const firstSet = session.exercises[0]!.sets[0]!;
    firstSet.avgHeartRateBpm = 138;
    firstSet.peakHeartRateBpm = 165;
    firstSet.restEndHeartRateBpm = 115;

    const payload = toSyncPayload(session);
    assert.equal(payload.sourceDevice, SessionSourceDevice.APPLE_WATCH);
    assert.equal(payload.healthKitWorkoutUuid, '550e8400-e29b-41d4-a716-446655440000');
    assert.equal(payload.activeCaloriesKcal, 415);
    assert.equal(payload.avgHeartRateBpm, 142);
    assert.equal(payload.heartRateSamples?.length, 2);
    assert.equal(payload.exercises[0]?.sets[0]?.peakHeartRateBpm, 165);
    assert.equal(payload.exercises[0]?.sets[0]?.restEndHeartRateBpm, 115);
  });

  it('groups Gymlife superset blocks and proposes max 1 smart exercise suggestion per workout', async () => {
    const catalog = await getCachedCatalog();
    const { folders } = buildStarterWorkouts({ userId: 'user-1' });

    // PPL Push template has Lateral Raise (0s rest) paired with Tricep Pushdown (75s rest)
    const pplPushTemplate = folders[1]!.templates[0]!;
    const blocks = groupExercisesIntoBlocks(pplPushTemplate.exercises);
    const supersetBlocks = blocks.filter((b) => b.type === 'superset');
    assert.equal(supersetBlocks.length, 1);
    assert.equal(supersetBlocks[0]!.rounds, 4);
    assert.equal(supersetBlocks[0]!.roundRestSeconds, 75);
    assert.equal(supersetBlocks[0]!.items.length, 2);
    assert.equal(supersetBlocks[0]!.items[0]!.stepNumber, 1);
    assert.equal(supersetBlocks[0]!.items[1]!.stepNumber, 2);
    assert.equal(formatRestDurationMinSec(60), '1:00');
    assert.equal(formatRestDurationMinSec(75), '1:15');

    // Simulate a Push workout where Shoulder Press needs max effort (RPE 9.5) without gains
    const grindingSession = (dayOffset: number) => {
      const session = createOfflineSessionFromTemplate(pplPushTemplate, catalog, 'user-1');
      session.status = SessionStatus.COMPLETED;
      session.startedAt = new Date(Date.UTC(2026, 9, 1 + dayOffset, 17)).toISOString();
      session.completedAt = session.startedAt;
      const shoulderEx = session.exercises.find(
        (e) => e.primaryMuscleSnapshot === MuscleGroup.SHOULDERS,
      )!;
      for (const s of shoulderEx.sets) {
        s.completed = true;
        s.weight = 28;
        s.reps = 6;
        s.rpe = 9.5;
      }
      return session;
    };

    const suggestFrom = (historySessions: WorkoutSessionDto[]) =>
      computeWorkoutExerciseSuggestion({
        workoutName: pplPushTemplate.name,
        folderName: 'Push / Pull / Legs (PPL)',
        exercises: pplPushTemplate.exercises.map((ex) => ({
          exerciseId: ex.exerciseId,
          plannedSets: ex.plannedSets,
          targetRepsMin: ex.targetRepsMin,
          targetRepsMax: ex.targetRepsMax,
          targetWeight: ex.targetWeight,
        })),
        catalog,
        historySessions,
        weightUnit: WeightUnit.KG,
      });

    // A single max-effort session is normal training, not a reason to suggest anything
    assert.notEqual(suggestFrom([grindingSession(0)])?.reasonType, 'GRINDING');

    const suggestion = suggestFrom([grindingSession(0), grindingSession(7), grindingSession(14)]);

    assert.notEqual(suggestion, null);
    assert.equal(suggestion!.targetMuscle, MuscleGroup.SHOULDERS);
    assert.equal(suggestion!.reasonType, 'GRINDING');
    assert.equal(suggestion!.evidence.hardSessionsRecent, 3);
    assert.equal(
      pplPushTemplate.exercises.some((e) => e.exerciseId === suggestion!.suggestedExercise.id),
      false,
    );
  });
});
