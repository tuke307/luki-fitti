import { test, expect } from '@playwright/test';

const DOCS = 'http://docs.localhost:3000';

/**
 * The docs host (docs.luki-fitti.tony-luke.de) serves the internal /docs tree on its
 * own routes, with the app host redirecting there. Runs against `yarn dev` on :3000 —
 * no API or database needed.
 */
test.describe('docs site', () => {
  test('home page renders with hero and entry paths', async ({ page }) => {
    await page.goto(`${DOCS}/`);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(page.getByTestId('docs-search-trigger')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Bring your training history' })).toBeVisible();
  });

  test('a guide renders prose, code and a table', async ({ page }) => {
    await page.goto(`${DOCS}/import-format`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('pre').first()).toBeVisible();
    await expect(page.locator('table').first()).toBeVisible();
  });

  test('search finds "import"', async ({ page }) => {
    await page.goto(`${DOCS}/`);
    await page.getByTestId('docs-search-trigger').click();
    const input = page.getByPlaceholder(/search/i);
    await input.fill('import');
    await expect(page.getByRole('option', { name: /import/i }).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('an internal docs link navigates', async ({ page }) => {
    await page.goto(`${DOCS}/`);
    await page.getByRole('link', { name: 'Bring your training history' }).click();
    await expect(page).toHaveURL(/\/import-format$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('a mermaid diagram renders as svg', async ({ page }) => {
    await page.goto(`${DOCS}/release`);
    // The diagram renders client-side; on failure the source shows as a code block.
    await expect(page.locator('.docs-mermaid svg').first()).toBeVisible({ timeout: 15_000 });
  });

  test('the app host redirects the docs tree to the docs host', async ({ page }) => {
    await page.goto('http://localhost:3000/docs/import-format');
    await expect(page).toHaveURL(/docs\.localhost:3000\/import-format/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('every docs page renders without console errors', async ({ page }) => {
    const res = await page.request.get(`${DOCS}/sitemap.xml`);
    expect(res.ok()).toBeTruthy();
    const urls = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (m) => new URL(m[1]).pathname,
    );
    expect(urls.length).toBeGreaterThan(0);

    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`${page.url()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));

    for (const path of urls) {
      await page.goto(`${DOCS}${path}`, { waitUntil: 'load' });
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('the API reference renders an operation', async ({ page }) => {
    await page.goto(`${DOCS}/api-reference/v1/sessions/get`);
    await expect(page.locator('article')).toContainText('/api/v1/sessions');
    await expect(page.locator('article')).toContainText('Authorization');
    // The sidebar shows the API tab with the operation under its tag group (on mobile
    // the sidebar sits in the closed drawer, so assert presence, not visibility).
    await expect(
      page.locator('#nd-sidebar a[href="/api-reference/v1/sessions/get"]').first(),
    ).toBeAttached();
  });
});
