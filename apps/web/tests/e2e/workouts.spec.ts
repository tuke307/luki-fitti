import { test, expect } from '@playwright/test';
import { clickDialogButton } from './helpers/dialogs.js';
import { resetOfflineStore } from './helpers/offline-store.js';
import {
  createFolder,
  createWorkoutTemplate,
  deleteFolderByName,
  deleteTemplateByName,
  gotoWorkoutsTab,
  templateCardByName,
} from './helpers/workouts.js';

test.describe('Workout Folders & Template Builder CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await resetOfflineStore(page);
    await gotoWorkoutsTab(page);
  });

  test('can collapse and expand all starter folders and renders Gymlife superset cards', async ({
    page,
  }) => {
    await expect(page.getByTestId('superset-block-card').first()).toBeVisible();
    await expect(page.getByTestId('superset-step-badge').first()).toBeVisible();

    await expect(page.getByRole('button', { name: /Collapse All/i })).toBeVisible();
    await page.getByRole('button', { name: /Collapse All/i }).click();

    await expect(page.getByRole('button', { name: /Expand All/i })).toBeVisible();
    await page.getByRole('button', { name: /Expand All/i }).click();
    await expect(page.getByRole('button', { name: /Collapse All/i })).toBeVisible();
  });

  test('create, rename, and delete a workout folder', async ({ page }) => {
    const FOLDER_NAME = 'E2E Split Folder';
    const FOLDER_RENAMED = 'E2E Split Folder (Edited)';

    // Create
    await createFolder(page, FOLDER_NAME);

    // Rename
    await page.getByTestId(`folder-rename-${FOLDER_NAME}`).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('#folder-name').fill(FOLDER_RENAMED);
    await clickDialogButton(page, /^(Save|Speichern)$/);

    await expect(page.getByRole('heading', { name: FOLDER_RENAMED, exact: true })).toBeVisible();

    // Delete
    await deleteFolderByName(page, FOLDER_RENAMED);
  });

  test('create, edit, duplicate, move, and delete a workout template', async ({ page }) => {
    const TPL_NAME = 'E2E Upper Hypertrophy';
    const TPL_EDITED = 'E2E Upper Hypertrophy v2';
    const TPL_COPY = 'E2E Upper Hypertrophy v2 (Copy)';

    // Create
    await createWorkoutTemplate(page, {
      name: TPL_NAME,
      description: 'Compound chest and back focus',
    });

    // Edit
    const card = templateCardByName(page, TPL_NAME);
    await card.getByTestId('template-action-edit').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('#tpl-name').fill(TPL_EDITED);
    await clickDialogButton(page, /^(Save|Speichern)$/);

    const editedCard = templateCardByName(page, TPL_EDITED);
    await expect(editedCard).toBeVisible();

    // Duplicate
    await editedCard.getByTestId('template-action-duplicate').click();
    await expect(templateCardByName(page, TPL_COPY)).toBeVisible({ timeout: 10_000 });

    // Move duplicated template to Unfiled
    await templateCardByName(page, TPL_COPY).getByTestId('template-action-move').selectOption('');
    await expect(page.getByRole('heading', { name: 'Unfiled Workouts' })).toBeVisible();

    // Delete both templates
    await deleteTemplateByName(page, TPL_COPY);
    await deleteTemplateByName(page, TPL_EDITED);
  });
});
