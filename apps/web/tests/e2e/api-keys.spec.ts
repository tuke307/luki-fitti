import { test, expect } from '@playwright/test';
import { seedSocialUser, setApiKeysEnabledForE2e, signInSeededUser } from './helpers/social.js';

/**
 * Full API-key lifecycle through the web UI plus one real `/api/v1` call:
 * enable the feature (in the DB — no admin credentials ship in the repo),
 * create a key in settings, call the public API with it, revoke it and confirm
 * the key stops working. Uses the seeded-session sign-in so the throttled
 * login form is never touched.
 */
test.describe('api keys', () => {
  test.beforeAll(async () => {
    await setApiKeysEnabledForE2e(true);
  });

  test.afterAll(async () => {
    await setApiKeysEnabledForE2e(false);
  });

  test('create, call /api/v1 and revoke', async ({ page }) => {
    const user = await seedSocialUser('apikeys');
    await signInSeededUser(page, user);

    // Email/settings deep link lands straight on the API keys settings page.
    await page.goto('/?open=%2Fprofile%2Fapi-keys');
    await expect(page.getByTestId('api-keys-page')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('api-key-create-open').click();
    const sheet = page.getByTestId('api-key-create-sheet');
    await expect(sheet).toBeVisible();
    await page.getByTestId('api-key-name-input').fill('E2E key');
    await page.getByTestId('api-key-password-input').fill(user.password);
    await page.getByTestId('api-key-create-submit').click();

    const secretField = page.getByTestId('api-key-secret-field');
    await expect(secretField).toBeVisible({ timeout: 15_000 });
    const key = await secretField.inputValue();
    expect(key).toMatch(/^lf_pat_[a-z2-7]{8}_[A-Za-z0-9_-]{43}$/);
    const keyId = key.split('_')[2];

    // Closing requires the "I copied the key" confirmation.
    await expect(page.getByTestId('api-key-created-done')).toBeDisabled();
    await page.getByTestId('api-key-copied-check').click();
    await page.getByTestId('api-key-created-done').click();

    await expect(page.getByTestId(`api-key-item-${keyId}`)).toBeVisible();

    const authed = { Authorization: `Bearer ${key}` };
    const ok = await page.request.get('/api/v1/sessions', { headers: authed });
    expect(ok.status()).toBe(200);
    const body = (await ok.json()) as { data: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);

    await page.getByTestId(`api-key-revoke-${keyId}`).click();
    const dialog = page.getByTestId('api-key-revoke-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /^Revoke$/i }).click();
    await expect(page.getByTestId(`api-key-item-${keyId}`)).toHaveCount(0);

    const revoked = await page.request.get('/api/v1/sessions', { headers: authed });
    expect(revoked.status()).toBe(401);
    expect(await revoked.json()).toMatchObject({ error: 'invalid_api_key' });
  });
});
