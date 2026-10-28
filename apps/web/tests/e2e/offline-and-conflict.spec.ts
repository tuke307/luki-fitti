import { test, expect } from '@playwright/test';
import { mockAuthenticatedSession, resetOfflineStore } from './helpers/offline-store.js';
import { toggleCompleteSetRow } from './helpers/session.js';
import { expectSyncBadge } from './helpers/shell.js';
import { createWorkoutTemplate, gotoWorkoutsTab, startWorkoutByName } from './helpers/workouts.js';

test.describe('Offline Durability & Sync Conflict Resolution', () => {
  test('workout sets logged offline survive page reload via IndexedDB', async ({
    page,
    context,
  }) => {
    await resetOfflineStore(page);
    const WORKOUT_NAME = 'E2E Offline Basement Workout';

    await gotoWorkoutsTab(page);
    await createWorkoutTemplate(page, { name: WORKOUT_NAME });
    await startWorkoutByName(page, WORKOUT_NAME);

    // Go offline mid-workout
    await context.setOffline(true);
    await expectSyncBadge(page, /Offline/i);

    // Complete Set 1 and Set 2 while offline
    await toggleCompleteSetRow(page, 1);
    await toggleCompleteSetRow(page, 2);

    // Bring network back to allow Next.js dev server reload, then verify IndexedDB state persisted
    await context.setOffline(false);
    await page.reload();

    // Navigate back to Home -> active session banner must show 2 sets logged
    await expect(page.getByText('Session In Progress')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/^2 sets ·/i)).toBeVisible();
  });

  test('detects server version conflict on sync and resolves via Conflict Dialog', async ({
    page,
  }) => {
    await resetOfflineStore(page);
    await mockAuthenticatedSession(page);

    let syncCallCount = 0;
    await page.route('**/api/sessions/sync', async (route) => {
      syncCallCount += 1;
      const reqBody = route.request().postDataJSON() ?? {};

      // First sync returns conflictDetected: true; subsequent sync with forceOverwrite succeeds
      if (syncCallCount === 1 && !reqBody.forceOverwrite) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              conflictDetected: true,
              session: {
                id: 'server-sess-1',
                clientSessionId: reqBody.clientSessionId ?? 'client-sess-1',
                userId: 'user-e2e-1',
                templateId: null,
                sessionType: 'STRENGTH',
                workoutNameSnapshot: reqBody.workoutNameSnapshot ?? 'Conflict Push Workout',
                status: 'IN_PROGRESS',
                startedAt: new Date().toISOString(),
                completedAt: null,
                pausedAt: null,
                activeDurationSeconds: 600,
                totalVolumeKg: 2400,
                totalSetsCompleted: 5,
                totalStretchSeconds: 0,
                weightUnit: 'KG',
                restTimerEndsAt: null,
                restTimerPausedRemSec: null,
                restTimerDurationSec: null,
                notes: null,
                version: 9,
                exercises: [],
              },
            },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            conflictDetected: false,
            session: {
              ...reqBody,
              id: 'server-sess-1',
              userId: 'user-e2e-1',
              totalVolumeKg: 1000,
              totalSetsCompleted: 1,
              totalStretchSeconds: 0,
              version: 10,
            },
          },
        }),
      });
    });

    await gotoWorkoutsTab(page);
    await createWorkoutTemplate(page, { name: 'Conflict Push Workout' });
    await startWorkoutByName(page, 'Conflict Push Workout');

    // Conflict resolution modal should appear automatically when sync queue flushes
    await expect(
      page.getByRole('heading', { name: 'Workout changed on another device' }),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Keep this device' }).click();
    await expect(
      page.getByRole('heading', { name: 'Workout changed on another device' }),
    ).not.toBeVisible();
  });
});
