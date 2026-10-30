import { test, expect } from '@playwright/test';
import { resetOfflineStore } from './helpers/offline-store.js';
import { navigateToTab } from './helpers/shell.js';

test.describe('Food tab — manual meal logging', () => {
  test.beforeEach(async ({ page }) => {
    await resetOfflineStore(page);
  });

  test('logs a meal, rescales nutrients by amount and shows the day total', async ({ page }) => {
    await navigateToTab(page, 'nutrition');
    await expect(page.getByRole('heading', { level: 1, name: /Food|Essen/ })).toBeVisible();
    await expect(page.getByText(/Nothing logged yet|Noch nichts eingetragen/)).toBeVisible();

    await page.getByRole('button', { name: /Add meal|Mahlzeit hinzufügen/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: /Breakfast|Frühstück/ }).click();
    await dialog.locator('input[id$="-name"]').fill('Greek yogurt');
    await dialog.locator('input[id$="-grams"]').fill('200');
    await dialog.locator('input[id$="-kcal"]').fill('190');
    await dialog.locator('input[id$="-proteinG"]').fill('20');
    // Changing only the amount rescales the nutrients from the entered portion.
    await dialog.locator('input[id$="-grams"]').fill('100');
    await expect(dialog.locator('input[id$="-kcal"]')).toHaveValue('95');
    await expect(dialog.locator('input[id$="-proteinG"]')).toHaveValue('10');
    await dialog.getByRole('button', { name: /Save meal|Mahlzeit speichern/ }).click();

    const breakfast = page.getByRole('region', { name: /Breakfast|Frühstück/ });
    await expect(breakfast).toContainText('Greek yogurt');
    await expect(breakfast).toContainText('95');
  });

  test('navigates days with the week strip, keyboard and today button', async ({ page }) => {
    await navigateToTab(page, 'nutrition');
    const strip = page.getByRole('group', { name: /Days of the week|Tage der Woche/ });
    const today = strip.locator('button[aria-current="date"]');
    await expect(today).toHaveAttribute('aria-pressed', 'true');

    await today.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByText(/^(Yesterday|Gestern)$/)).toBeVisible();

    const main = page.getByRole('main');
    await main.getByRole('button', { name: /^(Today|Heute)$/ }).click();
    await expect(today).toHaveAttribute('aria-pressed', 'true');
    await expect(main.getByRole('button', { name: /^(Today|Heute)$/ })).toHaveCount(0);

    await page.getByRole('button', { name: /Previous week|Vorherige Woche/ }).click();
    await expect(strip.locator('button[aria-current="date"]')).toHaveCount(0);
    await page.getByRole('button', { name: /Next week|Nächste Woche/ }).click();
    await expect(today).toBeVisible();
    await expect(page.getByRole('button', { name: /Next week|Nächste Woche/ })).toBeDisabled();
  });

  test('requires a name for foods with values', async ({ page }) => {
    await navigateToTab(page, 'nutrition');
    await page.getByRole('button', { name: /Add meal|Mahlzeit hinzufügen/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[id$="-kcal"]').fill('120');
    await dialog.getByRole('button', { name: /Save meal|Mahlzeit speichern/ }).click();
    await expect(dialog.getByRole('alert')).toContainText(/name|Namen/);
  });
});

test.describe('Admin portal gate', () => {
  test('sends visitors without a session to the login page', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fadmin%2Fusers/);
  });
});
