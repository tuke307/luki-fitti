import { test, expect } from '@playwright/test';
import { gotoProfileTab, resetOfflineStore } from './helpers/offline-store.js';
import { expectSyncBadge, navigateToTab } from './helpers/shell.js';

test.describe('PWA Shell, Navigation & Preferences', () => {
  test.beforeEach(async ({ page }) => {
    await resetOfflineStore(page);
  });

  test('boots with starter catalog, KPI telemetry strip, and navigates across all tabs', async ({
    page,
  }) => {
    await expectSyncBadge(page, /Guest/i);
    await expect(page.getByText('7-Day Frequency')).toBeVisible();
    await expect(page.getByText('30-Day Volume')).toBeVisible();
    await expect(page.getByText('Total Workouts')).toBeVisible();
    await expect(page.getByText('Avg. Session Load')).toBeVisible();

    // Navigate to Workouts
    await navigateToTab(page, 'workouts');
    await expect(page.getByRole('heading', { name: 'Workout Templates & Splits' })).toBeVisible();

    // Navigate to Diary
    await navigateToTab(page, 'diary');
    await expect(
      page.getByRole('heading', { name: 'Training Diary & Progress Analytics' }),
    ).toBeVisible();

    // Navigate to Exercises
    await navigateToTab(page, 'exercises');
    await expect(
      page.getByRole('heading', { name: 'Exercise & Mobility Library' }),
    ).toBeVisible();

    // Navigate to Profile
    await navigateToTab(page, 'profile');
    await expect(page.getByRole('heading', { name: 'Profile & Preferences' })).toBeVisible();

    // Brand logo returns to Home
    await page.getByRole('button', { name: 'LukiFitti Home' }).click();
    await expect(page.getByText('Weekly Volume & Session Trend')).toBeVisible();
  });

  test('can switch language between English and German across views', async ({ page }) => {
    await gotoProfileTab(page);

    await page.getByRole('tab', { name: 'Deutsch' }).click();
    await expect(
      page.getByRole('heading', { name: /Profil & Einstellungen/i }),
    ).toBeVisible();

    // Navigate to Workouts and confirm German headings render
    await navigateToTab(page, 'workouts');
    await expect(page.getByRole('heading', { name: 'Workout-Vorlagen & Splits' })).toBeVisible();

    // Switch back to English
    await navigateToTab(page, 'profile');
    await page.getByRole('tab', { name: 'English' }).click();
    await expect(page.getByRole('heading', { name: 'Profile & Preferences' })).toBeVisible();
  });

  test('can switch weight unit (KG <-> LBS) and theme in Profile', async ({ page }) => {
    await gotoProfileTab(page);

    await page.getByRole('tab', { name: 'LBS' }).click();
    await expect(page.getByRole('tab', { name: 'LBS' })).toHaveAttribute('data-state', 'active');

    await page.getByRole('tab', { name: 'Light' }).click();
    await expect(page.getByRole('tab', { name: 'Light' })).toHaveAttribute('data-state', 'active');

    // Restore KG & Dark
    await page.getByRole('tab', { name: 'KG' }).click();
    await page.getByRole('tab', { name: 'Dark' }).click();
  });
});
