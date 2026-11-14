import { test, expect, type Page } from '@playwright/test';
import { addBerlinDays, berlinDayKey } from '@luki-fitti/common/utils';
import { submitLoginPageForm } from './helpers/auth.js';
import { gotoProfileTab, resetOfflineStore } from './helpers/offline-store.js';
import { navigateToTab } from './helpers/shell.js';
import {
  completeDuelForE2e,
  enableRaidsForE2e,
  enableSocialForE2e,
  seedCommunityRaidForE2e,
  seedFriendshipForE2e,
  seedGlobalCohortForE2e,
  seedPointsWeekForE2e,
  seedSocialUser,
  setLeagueStageModeForE2e,
} from './helpers/social.js';

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

test.describe('Social: leagues and effort points', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await enableSocialForE2e();
    await setLeagueStageModeForE2e('GLOBAL');
  });

  test.afterAll(async () => {
    await setLeagueStageModeForE2e('AUTO');
  });

  test('two users in a GLOBAL cohort see the league list with their EP', async ({ page }) => {
    const unique = Date.now().toString(36);
    const [userA, userB] = await Promise.all([
      seedSocialUser('liga', undefined, `liga_${unique}`),
      seedSocialUser('mara', undefined, `mara_${unique}`),
    ]);
    await seedPointsWeekForE2e(userA.id, 120);
    await seedPointsWeekForE2e(userB.id, 340);
    await seedGlobalCohortForE2e([userA.id, userB.id]);

    await resetOfflineStore(page);
    await submitLoginPageForm(page, userA.email, userA.password);
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await navigateToTab(page, 'social');
    await dismissOnboardingIfShown(page);

    // This-week card shows the seeded EP.
    await expect(page.getByTestId('this-week-card')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('this-week-card')).toContainText('120');

    // The GLOBAL cohort lists both users, ranked by weekly EP.
    await expect(page.getByTestId('league-cohort')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId(`league-row-${userB.id}`)).toBeVisible();
    await expect(page.getByTestId(`league-row-${userA.id}`)).toBeVisible();
    await expect(page.getByTestId(`league-row-${userB.id}`)).toContainText('340');
    const rows = page.getByTestId('league-cohort').locator('li');
    await expect(rows.first()).toContainText(`@mara_${unique}`);

    // The Friends segment still lists both users.
    await page.getByTestId('league-tab-friends').click();
    await expect(page.getByTestId('league-friends-board')).toBeVisible();
    await expect(
      page.getByTestId('league-friends-board').getByText(`@liga_${unique}`),
    ).toBeVisible();
  });
});

test.describe('Social: duels', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await enableSocialForE2e();
  });

  test('a challenge becomes an active duel and ends in the result celebration', async ({
    page,
  }) => {
    const unique = Date.now().toString(36);
    const [userA, userB] = await Promise.all([
      seedSocialUser('duel.ana', undefined, `duelana_${unique}`),
      seedSocialUser('duel.bob', undefined, `duelbob_${unique}`),
    ]);
    await seedFriendshipForE2e(userA.id, userB.id);

    await resetOfflineStore(page);

    // ── A challenges B from the friend row menu ──
    await submitLoginPageForm(page, userA.email, userA.password);
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await navigateToTab(page, 'social');
    await dismissOnboardingIfShown(page);
    await expect(page.getByTestId(`friend-row-${userB.id}`)).toBeVisible({ timeout: 10_000 });
    await page.getByTestId(`friend-menu-${userB.id}`).click();
    await page.getByTestId(`friend-challenge-${userB.id}`).click();
    await expect(page.getByTestId('duels-outgoing')).toContainText(`@duelbob_${unique}`, {
      timeout: 10_000,
    });
    await signOut(page);

    // ── B accepts the incoming challenge; the duel goes active ──
    await submitLoginPageForm(page, userB.email, userB.password);
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await navigateToTab(page, 'social');
    await dismissOnboardingIfShown(page);
    const acceptBtn = page.getByTestId(/^duel-accept-/);
    await expect(acceptBtn).toBeVisible({ timeout: 10_000 });
    await acceptBtn.click();
    await expect(page.getByTestId(/^duel-row-/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('duels-card')).toContainText(/left|noch|tomorrow|morgen/i);
    await signOut(page);

    // ── A sees the active duel too ──
    await submitLoginPageForm(page, userA.email, userA.password);
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await navigateToTab(page, 'social');
    await dismissOnboardingIfShown(page);
    const duelRow = page.getByTestId(/^duel-row-/);
    await expect(duelRow).toBeVisible({ timeout: 10_000 });
    await expect(duelRow).toContainText(`@duelbob_${unique}`);

    // ── The duel ends (tick equivalent) — the WON celebration shows once ──
    // Duels start on the next Berlin day; seed EP inside the window so A wins.
    const duelDay = addBerlinDays(berlinDayKey(new Date()), 1);
    await seedPointsWeekForE2e(userA.id, 400, duelDay);
    await seedPointsWeekForE2e(userB.id, 100, duelDay);
    await completeDuelForE2e(userA.id, userB.id);
    await page.reload();
    await navigateToTab(page, 'social');
    await dismissOnboardingIfShown(page);
    const celebration = page.getByTestId('duel-celebration');
    await expect(celebration).toBeVisible({ timeout: 10_000 });
    await expect(celebration).toContainText(`@duelbob_${unique}`);
    await expect(celebration).toContainText('400');
    await page.getByTestId('duel-celebration-dismiss').click();
    await expect(celebration).toHaveCount(0);
  });
});

test.describe('Social: raids', () => {
  test.beforeAll(async () => {
    await enableSocialForE2e();
    await enableRaidsForE2e();
  });

  test('a finished workout shows as damage on the raid card and page', async ({ page }) => {
    const unique = Date.now().toString(36);
    const user = await seedSocialUser('raider', undefined, `raider_${unique}`);
    await seedCommunityRaidForE2e(user.id, 120);

    await resetOfflineStore(page);
    await submitLoginPageForm(page, user.email, user.password);
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await navigateToTab(page, 'social');
    await dismissOnboardingIfShown(page);

    // The raid card shows the user's damage against the weekly boss.
    const card = page.getByTestId('raid-card');
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toContainText('120');

    // Opening the card shows the raid page with the boss render present
    // (WebGL canvas or the 2D fallback, not pixels).
    await card.click();
    const raidPage = page.getByTestId('raid-page');
    await expect(raidPage).toBeVisible({ timeout: 10_000 });
    await expect(raidPage.locator('canvas, [role="img"]').first()).toBeVisible({ timeout: 15_000 });
  });
});
