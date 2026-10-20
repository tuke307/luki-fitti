/**
 * Shared helpers for Workout Folders and Workout Templates CRUD flows.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { clickDialogButton, confirmAlertDialog } from './dialogs.js';
import { navigateToTab } from './shell.js';

/** Locate a workout template card by its exact name. */
export function templateCardByName(page: Page, name: string): Locator {
  return page.getByTestId(`template-card-${name}`);
}

/** Navigate to the Workouts tab and wait for the heading to render. */
export async function gotoWorkoutsTab(page: Page): Promise<void> {
  await navigateToTab(page, 'workouts');
  await expect(
    page.getByRole('heading', { name: /Workout Templates & Splits|Trainingspläne & Splits/i }),
  ).toBeVisible({ timeout: 10_000 });
}

/** Create a new workout folder via the Folder modal. */
export async function createFolder(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /New Folder|Neuer Ordner/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('#folder-name').fill(name);
  await clickDialogButton(page, /Save Folder|Ordner speichern/i);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible({ timeout: 10_000 });
}

/** Delete a workout folder by name and confirm the destructive alert dialog. */
export async function deleteFolderByName(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: `Delete folder ${name}` }).click();
  await confirmAlertDialog(page, /Confirm Delete|Löschen bestätigen/i);
  await expect(page.getByRole('heading', { name, exact: true })).not.toBeVisible({
    timeout: 10_000,
  });
}

/** Create a new workout template using the Template Builder modal. */
export async function createWorkoutTemplate(
  page: Page,
  options: { name: string; description?: string },
): Promise<void> {
  await page.getByRole('button', { name: /New Workout|Neues Workout/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('#tpl-name').fill(options.name);
  if (options.description) {
    await dialog.locator('#tpl-desc').fill(options.description);
  }
  await clickDialogButton(page, /Create Workout Template|Vorlage erstellen/i);
  await expect(templateCardByName(page, options.name)).toBeVisible({ timeout: 10_000 });
}

/** Delete a workout template by name and confirm the destructive alert dialog. */
export async function deleteTemplateByName(page: Page, name: string): Promise<void> {
  const card = templateCardByName(page, name);
  await card.getByTestId('template-action-delete').click();
  await confirmAlertDialog(page, /Confirm Delete|Löschen bestätigen/i);
  await expect(card).not.toBeVisible({ timeout: 10_000 });
}

/** Start a workout session from a template card by name. */
export async function startWorkoutByName(page: Page, name: string): Promise<void> {
  const card = templateCardByName(page, name);
  await expect(card).toBeVisible({ timeout: 10_000 });
  await card.getByTestId('template-action-start').click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible({ timeout: 10_000 });
}
