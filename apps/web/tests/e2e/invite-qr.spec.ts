import { test, expect } from '@playwright/test';
import jsQR from 'jsqr';
import {
  clearMailboxForRecipient,
  extractAuthLinkFromEmail,
  waitForMailpitEmail,
} from './helpers/mailpit.js';
import { submitLoginPageForm } from './helpers/auth.js';
import { resetOfflineStore } from './helpers/offline-store.js';
import { navigateToTab } from './helpers/shell.js';
import { enableSocialForE2e, seedInviteForE2e, seedSocialUser } from './helpers/social.js';

const INVITE_URL = /^https?:\/\/[^/]+\/invite\/[A-Za-z0-9_-]{43}$/;

test.describe('Invite QR code and new-user invite flow', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await enableSocialForE2e();
  });

  test('the QR code encodes the same invite link and the page offers the app', async ({ page }) => {
    const unique = Date.now().toString(36);
    const inviter = await seedSocialUser('qr', undefined, `qr_${unique}`);
    await resetOfflineStore(page);
    await submitLoginPageForm(page, inviter.email, inviter.password);
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await navigateToTab(page, 'social');
    await page.getByTestId('social-friends-btn').click();
    await page.getByTestId('invite-qr-btn').click();

    const qr = page.getByTestId('invite-qr');
    await expect(qr).toBeVisible({ timeout: 10_000 });
    const linkText = (await page.getByTestId('invite-url').textContent())?.trim() ?? '';
    expect(linkText).toMatch(INVITE_URL);

    const { data, width, height } = await qr.evaluate(async (node) => {
      const img = node as HTMLImageElement;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return { data: Array.from(pixels.data), width: pixels.width, height: pixels.height };
    });
    const decoded = jsQR(Uint8ClampedArray.from(data), width, height);
    expect(decoded?.data).toBe(linkText);

    // Signed-out visitor scanning the code lands on a page that offers the native app.
    await page.context().clearCookies();
    await resetOfflineStore(page);
    await page.goto(new URL(decoded!.data).pathname);
    await expect(page.getByTestId('invite-open-in-app')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('invite-open-app-link')).toHaveAttribute(
      'href',
      /^lukifitti:\/\/invite\/[A-Za-z0-9_-]{43}$/,
    );
  });

  test('a new user keeps the invite through sign-up, email verification and username', async ({
    page,
  }) => {
    const unique = Date.now().toString(36);
    const inviterUsername = `inviter_${unique}`;
    const inviter = await seedSocialUser('inviter', undefined, inviterUsername);
    const invitePath = await seedInviteForE2e(inviter.id);

    const email = `e2e.invite.${unique}.${Math.floor(Math.random() * 10_000)}@lukifitti.test`;
    await clearMailboxForRecipient(email);
    await resetOfflineStore(page);

    // Scanned while signed out → "Create account" opens the register tab.
    await page.goto(invitePath);
    await page.getByTestId('invite-sign-up').click();
    await expect(page).toHaveURL(/\/login\?mode=register/);
    await page.locator('#name').fill('E2E Invitee');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill('InviteePass123!');
    await page.getByRole('button', { name: /Register & Send Confirmation Link/i }).click();
    await expect(page.getByText(/check your email/i)).toBeVisible({ timeout: 10_000 });

    // The verification link opens in a fresh tab: the invite must still be remembered.
    const verifyPath = extractAuthLinkFromEmail(
      await waitForMailpitEmail(email, /Confirm your account/i),
      'verify-email',
    );
    const freshTab = await page.context().newPage();
    await freshTab.goto(verifyPath);
    await expect(freshTab.getByRole('heading', { name: 'Email Confirmed!' })).toBeVisible({
      timeout: 15_000,
    });
    await freshTab.getByTestId('verify-email-continue').click();
    await expect(freshTab).toHaveURL(new RegExp(`${invitePath}$`), { timeout: 10_000 });

    // A brand-new account has no username yet: it is asked for one, then the invite is accepted.
    await expect(freshTab.getByTestId('social-onboarding-sheet')).toBeVisible({
      timeout: 10_000,
    });
    await freshTab.getByTestId('username-input').fill(`invitee_${unique}`);
    await expect(freshTab.getByTestId('username-hint')).toContainText(/Available|Verfügbar/i, {
      timeout: 10_000,
    });
    await freshTab
      .getByTestId('social-onboarding-sheet')
      .getByRole('button', { name: /^Done$|^Fertig$/i })
      .click();
    await expect(freshTab.getByTestId('social-view')).toBeVisible({ timeout: 15_000 });
    await freshTab.getByTestId('social-friends-btn').click();
    await expect(freshTab.getByTestId(`friend-row-${inviter.id}`)).toBeVisible();
  });
});
