import { test, expect } from '@playwright/test';
import { clickDialogButton } from './helpers/dialogs.js';
import { resetOfflineStore } from './helpers/offline-store.js';
import {
  chooseTemplateAction,
  createFolder,
  createWorkoutTemplate,
  deleteFolderByName,
  deleteTemplateByName,
  enterEditMode,
  expandAllFolders,
  gotoWorkoutsTab,
  templateCardByName,
} from './helpers/workouts.js';

test.describe('Workout Folders & Template Builder CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await resetOfflineStore(page);
    await gotoWorkoutsTab(page);
  });

  test('can expand and collapse starter folders and renders Gymlife superset cards', async ({
    page,
  }) => {
    // Folders start collapsed: only folder names are shown until opened.
    await expect(page.getByTestId('template-details-toggle')).toHaveCount(0);

    await expandAllFolders(page);
    await expect(page.getByTestId('template-details-toggle').first()).toBeVisible();

    // Exercise details (incl. superset cards) only appear once a workout is opened.
    await expect(page.getByTestId('superset-block-card')).toHaveCount(0);
    const toggles = page.getByTestId('template-details-toggle');
    const count = await toggles.count();
    for (let i = 0; i < count; i++) {
      await toggles.nth(i).click();
    }
    await expect(page.getByTestId('superset-block-card').first()).toBeVisible();
    await expect(page.getByTestId('superset-step-badge').first()).toBeVisible();

    const expanded = page.locator('button[aria-expanded="true"][aria-label^="Collapse folder "]');
    while ((await expanded.count()) > 0) {
      await expanded.first().click();
    }
    await expect(page.getByTestId('template-details-toggle')).toHaveCount(0);
  });

  test('create, rename, and delete a workout folder', async ({ page }) => {
    const FOLDER_NAME = 'E2E Split Folder';
    const FOLDER_RENAMED = 'E2E Split Folder (Edited)';

    // Create
    await createFolder(page, FOLDER_NAME);

    // Rename (edit mode reveals reorder / rename / delete controls)
    await enterEditMode(page);
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
    await chooseTemplateAction(page, TPL_NAME, 'template-action-edit');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('#tpl-name').fill(TPL_EDITED);
    await clickDialogButton(page, /^(Save|Speichern)$/);

    const editedCard = templateCardByName(page, TPL_EDITED);
    await expect(editedCard).toBeVisible();

    // Duplicate
    await chooseTemplateAction(page, TPL_EDITED, 'template-action-duplicate');
    await expect(templateCardByName(page, TPL_COPY)).toBeVisible({ timeout: 10_000 });

    // Move duplicated template to Unfiled
    await templateCardByName(page, TPL_COPY).getByTestId('template-action-menu').click();
    await page.getByRole('menu').getByTestId('template-action-move').click();
    await page.getByRole('menuitemradio', { name: /^(Unfiled|Ohne Ordner)$/ }).click();
    await expect(page.getByRole('heading', { name: 'Unfiled Workouts' })).toBeVisible();

    // Delete both templates
    await deleteTemplateByName(page, TPL_COPY);
    await deleteTemplateByName(page, TPL_EDITED);
  });
});
