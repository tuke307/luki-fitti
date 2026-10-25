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
  await expect(page.getByRole('heading', { name: 'Workouts', exact: true })).toBeVisible({
    timeout: 10_000,
  });
}

/** Open the "+" menu in the Workouts header and pick an entry. */
export async function chooseFromAddMenu(page: Page, item: RegExp): Promise<void> {
  await page.getByTestId('workouts-add-menu').click();
  await page.getByRole('menuitem', { name: item }).click();
}

/** Toggle the Workouts list into edit mode (reorder / rename / delete controls). */
export async function enterEditMode(page: Page): Promise<void> {
  const toggle = page.getByTestId('workouts-edit-toggle');
  if ((await toggle.textContent())?.match(/Edit|Bearbeiten/)) {
    await toggle.click();
  }
}

/** Expand every folder so template rows are visible. */
export async function expandAllFolders(page: Page): Promise<void> {
  const expandAll = page.getByRole('button', { name: /^(Expand All|Alle aufklappen)$/i });
  if (await expandAll.isVisible()) {
    await expandAll.click();
  }
}

/** Open the "···" actions menu on a template row and pick an entry by test id. */
export async function chooseTemplateAction(
  page: Page,
  templateName: string,
  actionTestId: 'template-action-edit' | 'template-action-duplicate' | 'template-action-delete',
): Promise<void> {
  await templateCardByName(page, templateName).getByTestId('template-action-menu').click();
  await page.getByRole('menu').getByTestId(actionTestId).click();
}

/** Create a new workout folder via the Folder modal. */
export async function createFolder(page: Page, name: string): Promise<void> {
  await chooseFromAddMenu(page, /New Folder|Neuer Ordner/i);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('#folder-name').fill(name);
  await clickDialogButton(page, /^(Save|Speichern)$/);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible({ timeout: 10_000 });
}

/** Delete a workout folder by name and confirm the destructive alert dialog. */
export async function deleteFolderByName(page: Page, name: string): Promise<void> {
  await enterEditMode(page);
  await page.getByRole('button', { name: `Delete folder ${name}` }).click();
  await confirmAlertDialog(page, /^(Delete|Löschen)$/);
  await expect(page.getByRole('heading', { name, exact: true })).not.toBeVisible({
    timeout: 10_000,
  });
}

/** Create a new workout template using the Template Builder modal. */
export async function createWorkoutTemplate(
  page: Page,
  options: { name: string; description?: string },
): Promise<void> {
  await chooseFromAddMenu(page, /New Workout|Neues Workout/i);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('#tpl-name').fill(options.name);
  if (options.description) {
    await dialog.locator('#tpl-desc').fill(options.description);
  }
  await clickDialogButton(page, /^(Create Workout|Workout erstellen)$/);
  await expect(templateCardByName(page, options.name)).toBeVisible({ timeout: 10_000 });
}

/** Delete a workout template by name and confirm the destructive alert dialog. */
export async function deleteTemplateByName(page: Page, name: string): Promise<void> {
  const card = templateCardByName(page, name);
  await chooseTemplateAction(page, name, 'template-action-delete');
  await confirmAlertDialog(page, /^(Delete|Löschen)$/);
  await expect(card).not.toBeVisible({ timeout: 10_000 });
}

/** Start a workout session from a template card by name. */
export async function startWorkoutByName(page: Page, name: string): Promise<void> {
  const card = templateCardByName(page, name);
  if (!(await card.isVisible())) {
    await expandAllFolders(page);
  }
  await expect(card).toBeVisible({ timeout: 10_000 });
  await card.getByTestId('template-action-start').click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible({ timeout: 10_000 });
}
