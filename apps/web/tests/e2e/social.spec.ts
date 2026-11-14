import { test, expect, type Page } from '@playwright/test';
import { submitLoginPageForm } from './helpers/auth.js';
import { gotoProfileTab, resetOfflineStore } from './helpers/offline-store.js';
import { navigateToTab } from './helpers/shell.js';
import { enableSocialForE2e, seedSocialUser } from './helpers/social.js';

/**
 * Covers the PR 1 social flows end to end: admin enables social (via the DB —
 * no admin credentials ship in the repo), a user picks a handle in onboarding,
 * a second user finds them via handle search, and a third user joins friends
 * through an invite link.
 */

async function signOut(page: Page): Promise<void> {
  await gotoProfileTab(page);
  await page.getByTestId('settings-row-account').click();
  await page.getByRole('button', { name: /^Sign Out$/i }).click();
  await expect(page.getByTestId('header-sync-status')).toContainText(/Guest/i);
}

/** Fills the onboarding sheet's handle field and confirms — waits for availability. */
async function completeOnboardingWithHandle(page: Page, handle: string): Promise<void> {
  const sheet = page.getByTestId('social-onboarding-sheet');
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('handle-input').fill(handle);
  await expect(page.getByTestId('handle-hint')).toContainText(/Available|Verfügbar/i, {
    timeout: 10_000,
  });
  await sheet.getByRole('button', { name: /^Done$|^Fertig$/i }).click();
  await expect(sheet).toHaveCount(0);
}

async function dismissOnboardingIfShown(page: Page): Promise<void> {
  const sheet = page.getByTestId('social-onboarding-sheet');
  if (await sheet.isVisible()) {
    await sheet.getByRole('button', { name: /Not now|Nicht jetzt/i }).click();
    await expect(sheet).toHaveCount(0);
  }
}

test.describe('Social: friends, requests and invites', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await enableSocialForE2e();
  });

  test('users become friends via handle search and via invite link', async ({ page }) => {
    const unique = Date.now().toString(36);
    const [userA, userB, userC] = await Promise.all([
      seedSocialUser('anna'),
      seedSocialUser('bert', undefined, `bert_${unique}`),
      seedSocialUser('cleo', undefined, `cleo_${unique}`),
    ]);
    const handleA = `anna_${unique}`;

    await resetOfflineStore(page);

    // ── User A signs in and picks a handle in the onboarding sheet ──
    await submitLoginPageForm(page, userA.email, userA.password);
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await navigateToTab(page, 'social');
    await completeOnboardingWithHandle(page, handleA);
    await expect(page.getByText(`@${handleA}`)).toBeVisible({ timeout: 10_000 });
    await signOut(page);

    // ── User B finds A via handle search and sends a request ──
    await submitLoginPageForm(page, userB.email, userB.password);
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await navigateToTab(page, 'social');
    await dismissOnboardingIfShown(page);
    await page.getByTestId('social-search-input').fill(handleA);
    const addBtn = page.getByTestId(`search-add-${userA.id}`);
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();
    await signOut(page);

    // ── User A accepts the incoming request ──
    await submitLoginPageForm(page, userA.email, userA.password);
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await navigateToTab(page, 'social');
    const acceptBtn = page.getByTestId(`friend-accept-${userB.id}`);
    await expect(acceptBtn).toBeVisible({ timeout: 10_000 });
    await acceptBtn.click();
    // B now sits in the friends list (accept button disappears).
    await expect(acceptBtn).toHaveCount(0);
    await expect(page.getByTestId(`friend-row-${userB.id}`)).toBeVisible();

    // ── User A creates an invite link ──
    await page.getByTestId('invite-copy-btn').click();
    const inviteText = await page.getByTestId('invite-url').textContent({ timeout: 10_000 });
    expect(inviteText).toMatch(/\/invite\/[A-Za-z0-9_-]{43}/);
    const invitePath = new URL(inviteText!.trim()).pathname;
    await signOut(page);

    // ── User C accepts the invite while signed in ──
    await submitLoginPageForm(page, userC.email, userC.password);
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await navigateToTab(page, 'social');
    await dismissOnboardingIfShown(page);

    await page.goto(invitePath);
    await expect(page.getByTestId('invite-preview-text')).toContainText(`@${handleA}`, {
      timeout: 10_000,
    });
    await page.getByTestId('invite-accept-btn').click();
    // Accept redirects to `/?open=/social`, which the shell consumes into the
    // social tab and then strips from the URL.
    await expect(page).toHaveURL(/\/(\?open=%2Fsocial)?$/, { timeout: 10_000 });
    await expect(page.getByTestId('social-view')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId(`friend-row-${userA.id}`)).toBeVisible();
  });
});
