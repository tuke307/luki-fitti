import { test, expect } from '@playwright/test';
import { type Page } from '@playwright/test';
import { gotoProfileTab, resetOfflineStore } from './helpers/offline-store.js';
import { expectSyncBadge, navigateToTab } from './helpers/shell.js';

/** Picks an option from an iOS-style menu row (Radix Select) in the settings. */
async function chooseMenuOption(page: Page, testId: string, option: string): Promise<void> {
  await page.getByTestId(testId).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(page.getByTestId(testId)).toContainText(option);
}

test.describe('PWA Shell, Navigation & Preferences', () => {
  test.beforeEach(async ({ page }) => {
    await resetOfflineStore(page);
  });

  test('boots with starter catalog, KPI telemetry strip, and navigates across all tabs', async ({
    page,
  }) => {
    await expectSyncBadge(page, /Guest/i);
    await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Weekly volume' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Overview' })).toHaveCount(0);

    // Navigate to Workouts
    await navigateToTab(page, 'workouts');
    await expect(page.getByRole('heading', { name: 'Workouts', exact: true })).toBeVisible();

    // Navigate to Diary
    await navigateToTab(page, 'diary');
    await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();

    // Navigate to Exercises
    await navigateToTab(page, 'exercises');
    await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();

    // Navigate to Profile
    await navigateToTab(page, 'profile');
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();

    // Brand logo returns to Home on wide screens; phones close the Profile sheet with Done.
    const brand = page.getByRole('button', { name: 'LukiFitti Home' });
    if (await brand.isVisible()) await brand.click();
    else await navigateToTab(page, 'home');
    await expect(page.getByRole('heading', { name: 'Weekly volume' })).toBeVisible();
  });

  test('can switch language between English and German across views', async ({ page }) => {
    await gotoProfileTab(page);

    await page.getByTestId('settings-row-language').click();
    await chooseMenuOption(page, 'profile-language-select', 'Deutsch');
    await expect(page.getByRole('heading', { name: 'Sprache & Einheiten' })).toBeVisible();
    await page.getByTestId('settings-back-btn').click();
    await expect(page.getByRole('heading', { name: 'Profil', exact: true })).toBeVisible();

    // Navigate to Workouts and confirm German headings render
    await navigateToTab(page, 'workouts');
    await expect(page.getByText('Deine Pläne, nach Split sortiert.')).toBeVisible();

    // Switch back to English
    await navigateToTab(page, 'profile');
    await page.getByTestId('settings-row-language').click();
    await chooseMenuOption(page, 'profile-language-select', 'English');
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
  });

  test('can switch weight unit (kg <-> lbs) and theme in Profile', async ({ page }) => {
    await gotoProfileTab(page);

    await page.getByTestId('settings-row-language').click();
    await chooseMenuOption(page, 'profile-weight-unit-select', 'lbs');
    await chooseMenuOption(page, 'profile-theme-select', 'Light');

    // Restore kg & Dark
    await chooseMenuOption(page, 'profile-weight-unit-select', 'kg');
    await chooseMenuOption(page, 'profile-theme-select', 'Dark');
    await page.getByTestId('settings-back-btn').click();
    await expect(page.getByTestId('settings-row-language')).toContainText('kg');

    await page.getByTestId('settings-row-training').click();
    // Verify Smart Exercise Suggestions switch (default On), the weekly goal stepper and the
    // Test Notification button
    const suggestions = page.getByTestId('exercise-suggestions-switch');
    await expect(suggestions).toHaveAttribute('aria-checked', 'true');
    await suggestions.click();
    await expect(suggestions).toHaveAttribute('aria-checked', 'false');
    await suggestions.click();
    await expect(suggestions).toHaveAttribute('aria-checked', 'true');
    const goal = page.getByTestId('profile-weekly-goal-stepper');
    await goal.getByRole('button', { name: /Increment/ }).click();
    await expect(goal).toContainText('5 workouts');
    await page.getByTestId('settings-back-btn').click();
    await expect(page.getByTestId('settings-row-training')).toContainText('5 workouts');

    await page.getByTestId('settings-row-notifications').click();
    await page.getByTestId('profile-test-notification-btn').click();
    await expect(page.getByText(/Rest Done — LukiFitti Test/i)).toBeVisible();
  });

  test('keeps guest preferences on this device across reloads', async ({ page }) => {
    await gotoProfileTab(page);
    await page.getByTestId('settings-row-notifications').click();
    const sound = page.getByTestId('rest-sound-switch');
    await expect(sound).toHaveAttribute('aria-checked', 'true');
    await sound.click();
    await expect(sound).toHaveAttribute('aria-checked', 'false');

    await page.reload();
    await gotoProfileTab(page);
    await page.getByTestId('settings-row-notifications').click();
    await expect(page.getByTestId('rest-sound-switch')).toHaveAttribute('aria-checked', 'false');
  });

  test('shows the guest account block without a fake identity', async ({ page }) => {
    await gotoProfileTab(page);
    const account = page.getByTestId('guest-account-block');
    await expect(account.getByRole('tab', { name: 'Register Account' })).toBeVisible();
    await expect(account.getByRole('textbox', { name: 'Email address' })).toBeVisible();
    await expect(account.getByRole('link', { name: 'Forgot password?' })).toBeVisible();
    await expect(page.getByText(/GymBuddy|guest@gymbuddy\.local/)).toHaveCount(0);
    for (const row of ['nutrition', 'health', 'export']) {
      await expect(page.getByTestId(`settings-row-${row}`)).toBeVisible();
    }
  });
});
