import { test, expect } from '@playwright/test';
import { confirmAlertDialog } from './helpers/dialogs.js';
import { resetOfflineStore } from './helpers/offline-store.js';
import {
  finishActiveWorkout,
  toggleCompleteSetRow,
  updateSetWeightAndReps,
} from './helpers/session.js';
import { navigateToTab } from './helpers/shell.js';
import { createWorkoutTemplate, gotoWorkoutsTab, startWorkoutByName } from './helpers/workouts.js';

test.describe('Active Session Execution & Rest Timer', () => {
  test.beforeEach(async ({ page }) => {
    await resetOfflineStore(page);
  });

  test('starts workout, logs sets, controls rest timer, adds exercise, and finishes to Trophy & Diary', async ({
    page,
  }) => {
    const WORKOUT_NAME = 'E2E Live Push Session';
    await gotoWorkoutsTab(page);
    await createWorkoutTemplate(page, { name: WORKOUT_NAME });
    await startWorkoutByName(page, WORKOUT_NAME);

    // Navigate to Home and verify the "Session In Progress" callout banner appears
    await navigateToTab(page, 'home');
    await expect(page.getByText('Session In Progress')).toBeVisible();
    await page.getByRole('button', { name: /Resume Active Session/i }).click();
    await expect(page.getByRole('heading', { name: WORKOUT_NAME, exact: true })).toBeVisible();

    // Update Set 1 weight and reps, then mark complete
    await updateSetWeightAndReps(page, 1, '82.5', '10');
    await toggleCompleteSetRow(page, 1);

    // Completing Set 2 (Working set with >0s rest) or starting timer manually triggers header rest timer pill
    await page.getByRole('button', { name: '90s', exact: true }).click();
    const headerTimerPill = page.getByTestId('header-rest-timer-pill');
    await expect(headerTimerPill).toBeVisible();

    // Adjust (+15s / -15s), pause/resume, and skip rest timer
    await page.getByRole('button', { name: '+15s' }).click();
    await page.getByRole('button', { name: '-15s' }).click();
    await page.getByRole('button', { name: 'Skip Rest' }).click();
    await expect(headerTimerPill).not.toBeVisible();

    // Add an unplanned exercise to the session
    await page.getByRole('button', { name: /Add Exercise/i }).click();
    const addDialog = page.getByRole('dialog');
    await expect(addDialog).toBeVisible();
    await addDialog.getByRole('button', { name: /Add/i }).first().click();
    await expect(addDialog).not.toBeVisible();

    // Pause and resume session
    await page.getByRole('button', { name: 'Pause', exact: true }).first().click();
    await expect(page.getByText(/^Paused$/i)).toBeVisible();
    await page.getByRole('button', { name: /Resume/i }).first().click();
    await expect(page.getByText(/^Live Session$/i)).toBeVisible();

    // Finish workout and verify Trophy summary card
    await finishActiveWorkout(page, 'Great E2E pump!');
    await expect(page.getByRole('heading', { name: new RegExp(WORKOUT_NAME) })).toBeVisible();

    // Navigate to Training Diary from Trophy card
    await page.getByRole('button', { name: /View in Training Diary/i }).click();
    await expect(
      page.getByRole('heading', { name: 'Training Diary & Progress Analytics' }),
    ).toBeVisible();
    await expect(page.getByTestId(`diary-session-card-${WORKOUT_NAME}`)).toBeVisible();
  });

  test('can abandon an active session without saving it to the diary', async ({ page }) => {
    const WORKOUT_NAME = 'E2E Abandoned Session';
    await gotoWorkoutsTab(page);
    await createWorkoutTemplate(page, { name: WORKOUT_NAME });
    await startWorkoutByName(page, WORKOUT_NAME);

    await page.getByRole('button', { name: /Abandon Session/i }).click();
    await confirmAlertDialog(page, /Discard Session/i);

    await expect(page.getByRole('heading', { name: 'Workout Templates & Splits' })).toBeVisible();
    await navigateToTab(page, 'diary');
    await expect(page.getByTestId(`diary-session-card-${WORKOUT_NAME}`)).not.toBeVisible();
  });
});
