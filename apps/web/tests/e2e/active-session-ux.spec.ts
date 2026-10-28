import { test, expect } from '@playwright/test';
import { resetOfflineStore } from './helpers/offline-store.js';
import { chooseFromSetMenu, finishActiveWorkout, toggleCompleteSetRow } from './helpers/session.js';
import { navigateToTab } from './helpers/shell.js';
import { createWorkoutTemplate, gotoWorkoutsTab, startWorkoutByName } from './helpers/workouts.js';

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
    await chooseFromSetMenu(page, row, 1, 'Warm-up');
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

  test('skips an exercise from the actions menu on every device', async ({ page }) => {
    await startWorkoutByName(page, PUSH);

    const header = page.getByTestId('exercise-header-1');
    await header.getByRole('button', { name: /More actions/i }).click();
    await page.getByRole('menuitem', { name: 'Skip' }).click();
    await expect(page.getByTestId('active-exercise-card-1')).toContainText('Skipped');
  });

  test('deletes a set from the set menu without swiping', async ({ page }) => {
    await startWorkoutByName(page, PUSH);
    const card = page.getByTestId('active-exercise-card-1');
    const rows = card.locator('[data-testid^="session-set-row-"]');
    await expect(rows.first()).toBeVisible();
    const before = await rows.count();

    await chooseFromSetMenu(page, card, 1, 'Delete Set');
    await expect(rows).toHaveCount(before - 1);
  });

  test('writes changes made during the workout back into the template', async ({ page }) => {
    await startWorkoutByName(page, PUSH);
    const card = page.getByTestId('active-exercise-card-1');
    const rows = card.locator('[data-testid^="session-set-row-"]');
    await expect(rows.first()).toBeVisible();
    const before = await rows.count();

    await card.getByRole('button', { name: /^Add Set$/ }).click();
    await expect(rows).toHaveCount(before + 1);
    await chooseFromSetMenu(page, card, before + 1, 'Warm-up');
    // Warm-ups move to the top of the exercise.
    await expect(rows.first()).toHaveAttribute('data-set-type', 'WARMUP');
    const weight = rows.first().getByLabel('Set 1 weight');
    await weight.fill('33');
    await weight.blur();
    await rows.first().getByRole('button', { name: 'Complete set' }).click();

    await finishActiveWorkout(page);
    await gotoWorkoutsTab(page);
    await startWorkoutByName(page, PUSH);

    const nextRows = page
      .getByTestId('active-exercise-card-1')
      .locator('[data-testid^="session-set-row-"]');
    await expect(nextRows).toHaveCount(before + 1);
    await expect(nextRows.first()).toHaveAttribute('data-set-type', 'WARMUP');
    await expect(nextRows.first().getByLabel('Set 1 weight')).toHaveValue('33');
  });

  test('keeps a dismissed suggestion gone after switching tabs', async ({ page }) => {
    await createWorkoutTemplate(page, { name: 'E2E Suggestion Workout' });
    await startWorkoutByName(page, 'E2E Suggestion Workout');

    const card = page.getByTestId('session-rainbow-suggestion');
    await expect(card).toBeVisible();
    const firstText = await card.innerText();
    await card.getByRole('button', { name: /dismiss/i }).click();
    await expect(card).not.toHaveText(firstText);

    await navigateToTab(page, 'exercises');
    await navigateToTab(page, 'session');
    await expect(page.getByTestId('vertical-exercise-stack')).toBeVisible();
    if (await card.isVisible()) {
      await expect(card).not.toHaveText(firstText);
    }
  });
});
