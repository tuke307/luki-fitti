import { test, expect, type Page } from '@playwright/test';
import { mockAuthenticatedSession, resetOfflineStore } from './helpers/offline-store.js';

interface MockEntry {
  id: string;
  clientEntryId: string;
  measuredAt: string;
  weightKg: number;
  source: 'MANUAL' | 'HEALTHKIT';
  healthKitUuid: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/** In-memory stand-in for `/api/body-weight/entries` (GET / PUT upsert / DELETE :id). */
async function mockBodyWeightApi(page: Page) {
  const store = new Map<string, MockEntry>();
  const deleted: string[] = [];
  const ok = (data: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data }),
  });

  await page.route(/\/api\/body-weight\/entries(\/[^/?]+)?(\?.*)?$/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const idMatch = /\/entries\/([^/?]+)/.exec(url.pathname);
    if (req.method() === 'GET') {
      const list = [...store.values()].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
      return route.fulfill(ok(list));
    }
    if (req.method() === 'PUT') {
      const body = req.postDataJSON() as Pick<
        MockEntry,
        'clientEntryId' | 'measuredAt' | 'weightKg' | 'note'
      >;
      const existing = [...store.values()].find((e) => e.clientEntryId === body.clientEntryId);
      const now = new Date().toISOString();
      const saved: MockEntry = {
        id: existing?.id ?? `bw-${store.size + 1}`,
        clientEntryId: body.clientEntryId,
        measuredAt: body.measuredAt,
        weightKg: body.weightKg,
        note: body.note ?? null,
        source: 'MANUAL',
        healthKitUuid: null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      store.set(saved.id, saved);
      return route.fulfill(ok(saved));
    }
    if (req.method() === 'DELETE' && idMatch?.[1]) {
      const id = decodeURIComponent(idMatch[1]);
      store.delete(id);
      deleted.push(id);
      return route.fulfill(ok({ success: true }));
    }
    return route.fallback();
  });

  return { store, deleted };
}

test.describe('Body weight tracking', () => {
  test.beforeEach(async ({ page }) => {
    await resetOfflineStore(page);
  });

  test('logs a weigh-in from home, shows it in the history and chart, then deletes it', async ({
    page,
  }) => {
    const api = await mockBodyWeightApi(page);
    await mockAuthenticatedSession(page);

    const homeCard = page.getByTestId('home-weight-card');
    await expect(homeCard).toBeVisible({ timeout: 10_000 });
    await homeCard.getByRole('button', { name: /Log weight|Gewicht eintragen/ }).click();

    const section = page.getByRole('region', { name: /^(Body weight|Körpergewicht)$/ });
    await expect(section).toBeVisible();
    await expect(section.getByText(/No weigh-ins yet|Noch keine Einträge/)).toBeVisible();
    const input = section.getByLabel(/Weight \(kg\)|Gewicht \(kg\)/);
    await expect(input).toBeFocused();

    // Out-of-range values are rejected with an accessible error.
    await input.fill('12');
    await section.getByRole('button', { name: /^(Log weight|Gewicht eintragen)$/ }).click();
    await expect(section.getByRole('alert')).toContainText(/25|400/);
    await expect(input).toHaveAttribute('aria-invalid', 'true');

    await input.fill('80.4');
    await section.getByLabel(/Note|Notiz/).fill('Morning');
    await section.getByRole('button', { name: /^(Log weight|Gewicht eintragen)$/ }).click();

    const rows = section.getByTestId('weight-history-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('80.4');
    await expect(rows.first()).toContainText('Morning');
    await expect(section.getByTestId('weight-current')).toContainText('80.4 kg');
    await expect(section.getByTestId('weight-chart-summary')).toContainText(/80\.4/);
    await expect(page.getByTestId('body-current-weight')).toContainText('80.4 kg');
    expect([...api.store.values()].map((e) => e.weightKg)).toEqual([80.4]);

    await rows
      .first()
      .getByRole('button', { name: /Delete weigh-in|löschen/ })
      .click();
    const dialog = page.getByTestId('weight-delete-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /^(Delete|Löschen)$/ }).click();

    await expect(rows).toHaveCount(0);
    await expect(section.getByText(/No weigh-ins yet|Noch keine Einträge/)).toBeVisible();
    expect(api.deleted).toEqual(['bw-1']);
  });
});
