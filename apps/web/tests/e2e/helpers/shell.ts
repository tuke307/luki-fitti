/**
 * Shared navigation and PWA shell helpers for desktop (`chromium`) and mobile
 * (`mobile-safari`) viewports.
 */
import { expect, type Page } from '@playwright/test';

export type ShellTab = 'home' | 'workouts' | 'session' | 'diary' | 'exercises' | 'profile';

/**
 * Navigate to a main PWA tab, automatically picking the desktop horizontal nav
 * button or the mobile bottom tab bar button depending on viewport visibility.
 */
export async function navigateToTab(page: Page, tab: ShellTab): Promise<void> {
  const desktopBtn = page.getByTestId(`desktop-nav-${tab}`);
  const mobileBtn = page.getByTestId(`mobile-nav-${tab}`);

  if (await desktopBtn.isVisible()) {
    await desktopBtn.click();
  } else {
    await expect(mobileBtn).toBeVisible({ timeout: 10_000 });
    await mobileBtn.click();
  }
}

/**
 * Assert the top header sync/connection status badge contains the expected text.
 */
export async function expectSyncBadge(
  page: Page,
  expectedText: string | RegExp,
  timeout = 10_000,
): Promise<void> {
  const badge = page.getByTestId('header-sync-badge');
  await expect(badge).toBeVisible({ timeout });
  await expect(badge).toContainText(expectedText, { timeout });
}
