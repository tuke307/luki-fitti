/**
 * Shared helpers for Active Session (`ActiveSessionView`) set logging, rest
 * timer interaction, and session completion.
 */
import { expect, type Page } from '@playwright/test';

/**
 * Toggle completion on the 1-indexed set row (`session-set-row-<setNumber>`),
 * automatically clicking the visible desktop or mobile complete button.
 */
export async function toggleCompleteSetRow(page: Page, setNumber: number): Promise<void> {
  const row = page.getByTestId(`session-set-row-${setNumber}`);
  await expect(row).toBeVisible({ timeout: 10_000 });

  const buttons = row.getByRole('button', {
    name: /Complete set|Mark set incomplete/i,
  });
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const candidate = buttons.nth(i);
    if (await candidate.isVisible()) {
      await candidate.click();
      return;
    }
  }
  throw new Error(`No visible complete button found for set row ${setNumber}`);
}

/**
 * Update the weight and reps inputs for a 1-indexed set row.
 */
export async function updateSetWeightAndReps(
  page: Page,
  setNumber: number,
  weight: string,
  reps: string,
): Promise<void> {
  const row = page.getByTestId(`session-set-row-${setNumber}`);
  await expect(row).toBeVisible({ timeout: 10_000 });

  const weightInput = row.getByLabel(`Set ${setNumber} weight`);
  await weightInput.fill(weight);
  await weightInput.blur();

  const repsInput = row.getByLabel(`Set ${setNumber} reps`);
  await repsInput.fill(reps);
  await repsInput.blur();
}

/**
 * Finish the active workout session and assert the Trophy summary view renders.
 */
export async function finishActiveWorkout(page: Page, notes?: string): Promise<void> {
  if (notes) {
    await page.locator('#session-notes').fill(notes);
  }
  await page.getByRole('button', { name: /Finish & Save Workout|Training beenden/i }).click();
  await expect(
    page.getByText(/Session Saved & Queued for Sync|Training gespeichert/i),
  ).toBeVisible({ timeout: 10_000 });
}
