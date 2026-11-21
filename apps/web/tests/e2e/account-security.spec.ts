import { test, expect, type Page } from '@playwright/test';
import { generateSync } from 'otplib';
import {
  clearMailboxForRecipient,
  extractAuthLinkFromEmail,
  waitForMailpitEmail,
} from './helpers/mailpit.js';
import { resetOfflineStore } from './helpers/offline-store.js';
import { expectSyncBadge } from './helpers/shell.js';

const PASSWORD = 'E2eSecurePass123!';

function uniqueEmail(tag: string) {
  return `e2e.sec.${tag}.${Date.now()}-${Math.floor(Math.random() * 10_000)}@lukifitti.test`;
}

/** Register a fresh user through the UI and confirm the account via the Mailpit link. */
async function registerAndVerify(page: Page, email: string): Promise<void> {
  await clearMailboxForRecipient(email);
  await page.goto('/login');
  await page.getByRole('tab', { name: /Create Account|Konto erstellen/i }).click();
  await page.locator('#name').fill('E2E Security Athlete');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /Register & Send Confirmation Link/i }).click();
  await expect(page.getByText(/check your email/i)).toBeVisible({ timeout: 10_000 });

  const mail = await waitForMailpitEmail(email, /Confirm your account/i);
  await page.goto(extractAuthLinkFromEmail(mail, 'verify-email'));
  await expect(page.getByRole('heading', { name: 'Email Confirmed!' })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: /Open LukiFitti Dashboard/i }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** Dropping the session cookies signs the user out for the browser. */
async function signOut(page: Page): Promise<void> {
  await page.context().clearCookies();
  await resetOfflineStore(page);
}

const totpNow = (secret: string) => generateSync({ secret, epoch: Math.floor(Date.now() / 1000) });

/** The API rejects a TOTP replayed inside its own 30s step — wait for a fresh window. */
async function waitForNextTotpStep(): Promise<void> {
  const waitMs = 30_000 - (Date.now() % 30_000) + 500;
  await new Promise((r) => setTimeout(r, waitMs));
}

test.describe('Account security', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test('passkey: register on /security, then sign in passwordlessly on /login', async ({
    page,
  }) => {
    const email = uniqueEmail('passkey');
    await registerAndVerify(page, email);

    // Virtual platform authenticator via CDP (auto-approves ceremonies).
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });

    await page.goto('/security');
    await expect(
      page.getByRole('heading', { name: /Sign-in & security|Anmeldung & Sicherheit/i }),
    ).toBeVisible({ timeout: 15_000 });

    await page.locator(`input[placeholder*="Passkey"]`).fill('E2E Laptop');
    await page.getByRole('button', { name: /Add passkey|Passkey hinzufügen/i }).click();
    await expect(page.getByText('E2E Laptop')).toBeVisible({ timeout: 20_000 });

    await signOut(page);

    await page.goto('/login');
    await page
      .getByRole('button', { name: /Sign in with a passkey|Mit Passkey anmelden/i })
      .click();
    await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
    await expectSyncBadge(page, /Synced|Saved Locally/i);
  });

  test('2FA: enable, sign in with TOTP, then with a recovery code', async ({ page }) => {
    const email = uniqueEmail('2fa');
    await registerAndVerify(page, email);

    await page.goto('/security');
    await page.getByRole('button', { name: /^Turn on$|^Aktivieren$/i }).click();
    const secret = (await page.getByTestId('totp-secret').textContent())?.trim();
    expect(secret).toBeTruthy();

    await page.locator('#totp-setup-code').fill(totpNow(secret!));
    await page
      .getByRole('button', { name: /^Enable$|^Aktivieren$/i })
      .last()
      .click();
    const recoveryItems = page.getByTestId('recovery-codes').locator('li');
    await expect(recoveryItems).toHaveCount(10, { timeout: 15_000 });
    const recoveryCode = (await recoveryItems.first().textContent())?.trim();
    expect(recoveryCode).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
    await page.getByRole('button', { name: /I saved them|gespeichert/i }).click();

    await signOut(page);

    // ── Password login → MFA challenge ──
    // The TOTP used during enable is burned for its 30s step — wait for the next one.
    await waitForNextTotpStep();
    await page.goto('/login');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: /^Sign In$|^Anmelden$/i }).click();
    await expect(page.locator('#mfa-code')).toBeVisible({ timeout: 10_000 });

    await page.locator('#mfa-code').fill('000000');
    await page.getByRole('button', { name: /Verify|Überprüfen/i }).click();
    await expect(page.getByText(/Invalid code|Ungültig/i)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);

    await page.locator('#mfa-code').fill(totpNow(secret!));
    await page.getByRole('button', { name: /Verify|Überprüfen/i }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await expectSyncBadge(page, /Synced|Saved Locally/i);

    // ── Second login with the recovery code (works once, any casing/format) ──
    await signOut(page);
    await page.goto('/login');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: /^Sign In$|^Anmelden$/i }).click();
    await expect(page.locator('#mfa-code')).toBeVisible({ timeout: 10_000 });

    await page.locator('#mfa-code').fill(recoveryCode!);
    await page.getByRole('button', { name: /Verify|Überprüfen/i }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await expectSyncBadge(page, /Synced|Saved Locally/i);
  });
});
