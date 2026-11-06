import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, type Page } from '@playwright/test';
import { submitLoginPageForm, TEST_USER_EMAIL, TEST_USER_PASSWORD } from './helpers/auth.js';
import { navigateToTab } from './helpers/shell.js';
import { expandAllFolders, gotoWorkoutsTab, templateCardByName } from './helpers/workouts.js';

const EXAMPLE_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/common/src/utils/__fixtures__/import-file-example.json',
);

async function openImport(page: Page): Promise<void> {
  await navigateToTab(page, 'profile');
  await page.getByTestId('settings-row-import').click();
  await expect(page.getByTestId('import-page')).toBeVisible();
}

async function uploadExample(page: Page): Promise<void> {
  await page.getByTestId('import-file-input').setInputFiles(EXAMPLE_FILE);
  await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe('Import file', () => {
  test('previews, imports, and treats a re-upload of the same file as a no-op', async ({
    page,
  }) => {
    await submitLoginPageForm(page, TEST_USER_EMAIL, TEST_USER_PASSWORD);
    await expect(page.getByTestId('nav-profile')).toBeVisible({ timeout: 15_000 });

    await openImport(page);
    await uploadExample(page);
    await expect(page.getByText('From Example')).toBeVisible();

    // A rerun against the same account finds everything already imported.
    const commit = page.getByTestId('import-commit-btn');
    if (await commit.isVisible()) {
      await commit.click();
      await expect(page.getByText('Import complete')).toBeVisible({ timeout: 20_000 });
    }

    await uploadExample(page);
    await expect(
      page.getByText('Everything in this file is already in your account.'),
    ).toBeVisible();
    await expect(commit).toHaveCount(0);

    await gotoWorkoutsTab(page);
    await expandAllFolders(page);
    await expect(templateCardByName(page, 'Push Day')).toBeVisible();
  });
});
