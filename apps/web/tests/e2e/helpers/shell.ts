/**
 * Shared navigation and PWA shell helpers for desktop (`chromium`) and mobile
 * (`mobile-safari`) viewports.
 */
import { expect, type Page } from '@playwright/test';

export type ShellTab =
  | 'home'
  | 'workouts'
  | 'session'
  | 'nutrition'
  | 'diary'
  /** The exercise library is a segment of the Workouts tab since the Social tab replaced it. */
  | 'exercises'
  | 'social'
  | 'profile';

/**
 * Navigate to a main PWA tab, automatically picking the desktop horizontal nav
 * button or the mobile bottom tab bar button depending on viewport visibility.
 */
export async function navigateToTab(page: Page, tab: ShellTab): Promise<void> {
  // The live workout is a full-screen cover and Profile a sheet on phones: leave them first.
  const minimize = page.getByTestId('session-minimize-btn');
  if (tab !== 'session' && (await minimize.isVisible())) {
    await minimize.click();
    await expect(page.getByTestId('session-overlay')).toHaveCount(0);
  }
  const profileDone = page.getByTestId('profile-sheet-done');
  if (tab !== 'profile' && (await profileDone.isVisible())) {
    await profileDone.click();
    await expect(page.getByTestId('profile-sheet')).toHaveCount(0);
  }
  if (tab === 'session' && (await page.getByTestId('session-overlay').isVisible())) return;

  // Profile lives in the header avatar (floating on phones) and the live workout in the
  // floating accessory on every viewport, so they use a single shared test id.
  if (tab === 'profile' || tab === 'session') {
    const sharedBtn = page.getByTestId(`nav-${tab}`);
    await expect(sharedBtn).toBeVisible({ timeout: 10_000 });
    await sharedBtn.click();
    return;
  }

  const navTab = tab === 'exercises' ? 'workouts' : tab;
  const desktopBtn = page.getByTestId(`desktop-nav-${navTab}`);
  const mobileBtn = page.getByTestId(`mobile-nav-${navTab}`);

  // Both nav variants render in the DOM (the other is CSS-hidden), so pick by
  // viewport: `md:` breakpoint at 768px. Tabs can appear a beat after /auth/me
  // resolves (gated features), hence the visibility wait.
  const isDesktop = (page.viewportSize()?.width ?? 0) >= 768;
  const btn = isDesktop ? desktopBtn : mobileBtn;
  await expect(btn).toBeVisible({ timeout: 10_000 });
  await btn.click();

  if (tab === 'exercises') {
    const librarySegment = page.getByTestId('workouts-segment-library');
    await expect(librarySegment).toBeVisible({ timeout: 10_000 });
    await librarySegment.click();
  }
}

/**
 * Assert the header sync/connection status contains the expected text. The status is always
 * announced to assistive tech, but only shown visually when the user can act on it.
 */
export async function expectSyncBadge(
  page: Page,
  expectedText: string | RegExp,
  timeout = 10_000,
): Promise<void> {
  const badge = page.getByTestId('header-sync-status');
  await expect(badge).toBeAttached({ timeout });
  await expect(badge).toContainText(expectedText, { timeout });
}
