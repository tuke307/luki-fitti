import { test, expect } from '@playwright/test';
import { clickDialogButton } from './helpers/dialogs.js';
import {
  gotoProfileTab,
  mockAuthenticatedSession,
  resetOfflineStore,
} from './helpers/offline-store.js';
import { finishActiveWorkout, toggleCompleteSetRow } from './helpers/session.js';
import { createWorkoutTemplate, gotoWorkoutsTab, startWorkoutByName } from './helpers/workouts.js';

test.describe('Training Diary Analytics & Backup Exports', () => {
  test('inspects, edits, and deletes a completed workout in Training Diary', async ({ page }) => {
    await resetOfflineStore(page);
    const WORKOUT_NAME = 'E2E Diary Strength Session';

    await gotoWorkoutsTab(page);
    await createWorkoutTemplate(page, { name: WORKOUT_NAME });
    await startWorkoutByName(page, WORKOUT_NAME);
    await toggleCompleteSetRow(page, 1);
    await toggleCompleteSetRow(page, 2);
    await finishActiveWorkout(page);

    await page.getByRole('button', { name: /View in History/i }).click();
    const sessionCard = page.getByTestId(`diary-session-card-${WORKOUT_NAME}`);
    await expect(sessionCard).toBeVisible();

    // Switch period filters (Week / Month / Year / All)
    await page.getByRole('tab', { name: 'This week' }).click();
    await expect(sessionCard).toBeVisible();
    await page.getByRole('tab', { name: 'All Time' }).click();
    await expect(sessionCard).toBeVisible();

    // Inspect & edit historical session
    await sessionCard.getByTestId('diary-session-inspect').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: WORKOUT_NAME })).toBeVisible();
    await clickDialogButton(page, /^(Save|Speichern)$/);

    // Delete historical session
    await sessionCard.getByTestId('diary-session-delete').click();
    await expect(sessionCard).not.toBeVisible();
  });

  test('exports JSON backup and CSV workout log from Profile', async ({ page }) => {
    await resetOfflineStore(page);

    // Log 1 completed session first in offline/guest store so the CSV has workout rows
    await gotoWorkoutsTab(page);
    await createWorkoutTemplate(page, { name: 'E2E Export Session' });
    await startWorkoutByName(page, 'E2E Export Session');
    await toggleCompleteSetRow(page, 2);
    await finishActiveWorkout(page);

    // Enable authenticated mode and open Profile tab to trigger JSON & CSV exports
    await mockAuthenticatedSession(page);
    await gotoProfileTab(page);

    // Export JSON Backup
    const jsonDownloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-json-btn').click();
    const jsonDownload = await jsonDownloadPromise;
    expect(jsonDownload.suggestedFilename()).toMatch(/^luki-fitti-backup-.*\.json$/);

    // Export CSV Backup
    const csvDownloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-csv-btn').click();
    const csvDownload = await csvDownloadPromise;
    expect(csvDownload.suggestedFilename()).toMatch(/^luki-fitti-workouts-.*\.csv$/);
  });
});
