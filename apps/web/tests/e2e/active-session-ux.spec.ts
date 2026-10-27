import { test, expect } from '@playwright/test';
import { resetOfflineStore } from './helpers/offline-store.js';
import { toggleCompleteSetRow } from './helpers/session.js';
import { gotoWorkoutsTab, startWorkoutByName } from './helpers/workouts.js';

const PUSH = 'Push — Chest, Shoulders & Triceps';
const ARMS = 'Day 5 — Arm Blaster (Biceps & Triceps)';

test.describe('Active Session — set types, supersets & exercise actions', () => {
  test.beforeEach(async ({ page }) => {
    await resetOfflineStore(page);
    await gotoWorkoutsTab(page);
  });

  test('keeps the set type visible after logging and offers only "Add Set"', async ({ page }) => {
    await startWorkoutByName(page, PUSH);

    const row = page.getByTestId('session-set-row-1').first();
    await row.getByLabel('Set 1 type').selectOption('WARMUP');
    await toggleCompleteSetRow(page, 1);

    await expect(row).toHaveAttribute('data-set-logged', 'true');
    await expect(row).toHaveAttribute('data-set-type', 'WARMUP');
    await expect(row.getByTestId('logged-set-summary-pill')).toContainText('Warm-up');

    const card = page.getByTestId('active-exercise-card-1');
    await expect(card.getByRole('button', { name: /^Add Set$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Add Warm-up/i })).toHaveCount(0);
  });

  test('logs supersets round by round with A1 and B1 next to each other', async ({ page }) => {
    await startWorkoutByName(page, ARMS);

    const block = page.getByTestId('active-superset-block').first();
    const round1 = block.getByTestId('superset-round-1');
    await expect(round1.getByTestId('superset-set-row-A1')).toBeVisible();
    await expect(round1.getByTestId('superset-set-row-B1')).toBeVisible();

    for (const id of ['superset-set-row-A1', 'superset-set-row-B1']) {
      await round1.getByTestId(id).getByRole('button', { name: 'Complete set' }).click();
      await expect(round1.getByTestId(id)).toHaveAttribute('data-set-logged', 'true');
    }

    const roundsBefore = await block.locator('[data-testid^="superset-round-"]').count();
    await block.getByRole('button', { name: 'Add Round' }).click();
    await expect(block.locator('[data-testid^="superset-round-"]')).toHaveCount(roundsBefore + 1);
  });

  test('skips an exercise from the actions menu on pointer devices', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Touch devices use swipe actions instead');
    await startWorkoutByName(page, PUSH);

    const header = page.getByTestId('exercise-header-1');
    await header.getByRole('button', { name: /More actions/i }).click();
    await page.getByRole('menuitem', { name: 'Skip' }).click();
    await expect(page.getByTestId('active-exercise-card-1')).toContainText('Skipped');
  });
});
