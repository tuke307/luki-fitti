/**
 * Documentation screenshot capture script.
 *
 * Run once to regenerate all screenshots:
 *   yarn workspace @luki-fitti/web run docs:screenshots
 *
 * Screenshots land in: apps/web/tests/e2e/doc-screenshots/
 */
import { test } from '@playwright/test';
import { shot } from './helpers/doc-screenshots.js';
import { resetOfflineStore } from './helpers/offline-store.js';
import { navigateToTab } from './helpers/shell.js';
import { createWorkoutTemplate, gotoWorkoutsTab, startWorkoutByName } from './helpers/workouts.js';

test.describe('doc: luki-fitti pwa views', () => {
  test.describe.configure({ mode: 'serial' });

  test('01 - home dashboard', async ({ page }) => {
    await resetOfflineStore(page);
    await shot(page, '01-home-dashboard');
  });

  test('02 - workouts and folders', async ({ page }) => {
    await resetOfflineStore(page);
    await gotoWorkoutsTab(page);
    await shot(page, '02-workouts-overview');
  });

  test('03 - active workout session', async ({ page }) => {
    await resetOfflineStore(page);
    await gotoWorkoutsTab(page);
    await createWorkoutTemplate(page, { name: 'Push A — Chest & Triceps' });
    await startWorkoutByName(page, 'Push A — Chest & Triceps');
    await shot(page, '03-active-session');
  });

  test('04 - exercises catalog', async ({ page }) => {
    await resetOfflineStore(page);
    await navigateToTab(page, 'exercises');
    await shot(page, '04-exercises-catalog');
  });

  test('05 - training diary and analytics', async ({ page }) => {
    await resetOfflineStore(page);
    await navigateToTab(page, 'diary');
    await shot(page, '05-training-diary');
  });

  test('06 - profile and preferences', async ({ page }) => {
    await resetOfflineStore(page);
    await navigateToTab(page, 'profile');
    await shot(page, '06-profile-preferences');
  });
});
