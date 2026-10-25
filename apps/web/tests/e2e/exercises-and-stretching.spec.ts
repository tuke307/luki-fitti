import { test, expect } from '@playwright/test';
import { clickDialogButton } from './helpers/dialogs.js';
import { resetOfflineStore } from './helpers/offline-store.js';
import { finishActiveWorkout, toggleCompleteSetRow } from './helpers/session.js';
import { navigateToTab } from './helpers/shell.js';

test.describe('Exercise Catalog & Stretching Studio', () => {
  test.beforeEach(async ({ page }) => {
    await resetOfflineStore(page);
    await navigateToTab(page, 'exercises');
    await expect(
      page.getByRole('heading', { name: 'Library', exact: true }),
    ).toBeVisible();
  });

  test('searches catalog, filters by muscle & equipment, and opens exercise detail modal', async ({
    page,
  }) => {
    const searchInput = page.getByPlaceholder(/Search exercise/i);
    await searchInput.fill('Barbell Bench Press');

    const benchCard = page.getByRole('heading', { name: 'Barbell Bench Press' }).first();
    await expect(benchCard).toBeVisible();
    await benchCard.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: 'Barbell Bench Press', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('creates a custom exercise and finds it in the catalog', async ({ page }) => {
    const CUSTOM_EX = 'E2E Viking Press';
    await page.getByRole('button', { name: /Custom Exercise/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('#new-ex-name').fill(CUSTOM_EX);
    await dialog.locator('#new-ex-desc').fill('Explosive overhead shoulder press variation');
    await clickDialogButton(page, /^(Save|Speichern)$/);

    const searchInput = page.getByPlaceholder(/Search exercise/i);
    await searchInput.fill(CUSTOM_EX);
    await expect(page.getByRole('heading', { name: CUSTOM_EX })).toBeVisible();
  });

  test('creates a stretching routine and completes a stretching session', async ({ page }) => {
    const ROUTINE_NAME = 'E2E Post-Lift Mobility';

    await page.getByRole('tab', { name: /^Stretching$/i }).click();
    await page.getByRole('button', { name: /New Routine/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('#routine-name').fill(ROUTINE_NAME);
    await dialog.locator('#routine-area').fill('Hips & Thoracic Spine');
    await clickDialogButton(page, /^(Save|Speichern)$/);

    const routineHeading = page.getByRole('heading', { name: ROUTINE_NAME });
    await expect(routineHeading).toBeVisible();

    // Start the newly created stretching routine
    await page.getByTestId(`start-routine-${ROUTINE_NAME}`).click();

    await expect(page.getByRole('heading', { name: ROUTINE_NAME, exact: true })).toBeVisible();
    await toggleCompleteSetRow(page, 1);
    await finishActiveWorkout(page);
  });
});
