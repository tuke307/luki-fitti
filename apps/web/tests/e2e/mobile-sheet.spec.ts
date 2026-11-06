import { test, expect, type Page } from '@playwright/test';
import { resetOfflineStore } from './helpers/offline-store.js';
import {
  chooseFromAddMenu,
  gotoWorkoutsTab,
  startWorkoutByName,
} from './helpers/workouts.js';

const PUSH = 'Push — Chest, Shoulders & Triceps';

async function openAddExerciseSheet(page: Page) {
  await page.getByRole('button', { name: /^Add Exercise$/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Measure positions only after the slide-in animation has settled.
  await dialog.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  return dialog;
}

test.describe('Mobile bottom sheet', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Bottom sheets only exist on phones');
    await resetOfflineStore(page);
    await gotoWorkoutsTab(page);
    await startWorkoutByName(page, PUSH);
  });

  test('shows a working handle instead of a close button', async ({ page }) => {
    const dialog = await openAddExerciseSheet(page);
    const grabber = dialog.locator('[data-slot="dialog-grabber"]');
    await expect(grabber).toBeVisible();
    await expect(dialog.locator('[data-slot="dialog-content"] > button:last-child')).toBeHidden();

    await grabber.click();
    await expect(dialog).not.toBeVisible();
  });

  test('closes when the handle is dragged down and springs back on a short drag', async ({
    page,
  }) => {
    const dialog = await openAddExerciseSheet(page);
    const box = (await dialog.locator('[data-slot="dialog-grabber"]').boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 30, { steps: 10 });
    await page.waitForTimeout(400);
    await page.mouse.up();
    await expect(dialog).toBeVisible();

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 400, { steps: 5 });
    await page.mouse.up();
    await expect(dialog).not.toBeVisible();
  });
});

test.describe('MobileSheet from menus', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Bottom sheets only exist on phones');
    await resetOfflineStore(page);
    await gotoWorkoutsTab(page);
  });

  test('a sheet opened from a dropdown menu closes on Escape and frees the page', async ({
    page,
  }) => {
    await chooseFromAddMenu(page, /New Workout|Neues Workout/i);
    const sheet = page.getByTestId('template-builder');
    await expect(sheet).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(sheet).not.toBeVisible();

    await expect
      .poll(() => page.evaluate(() => document.body.style.pointerEvents))
      .not.toBe('none');

    // The page must still react to taps after the sheet is gone.
    const editToggle = page.getByTestId('workouts-edit-toggle');
    await editToggle.click();
    await expect(editToggle).toHaveText(/Done|Fertig/i);
  });
});
