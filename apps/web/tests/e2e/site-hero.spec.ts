import { test, expect } from '@playwright/test';

/**
 * Landing hero device switcher (marketing site at /site/*).
 * WAI-ARIA tabs: default iPhone, roving tabindex, arrow/Home/End selection,
 * no layout shift between the stacked panels.
 */
test.describe('Landing hero device switcher', () => {
  test('shows iPhone/iPad/Apple Watch tabs and switches without layout shift', async ({ page }) => {
    await page.goto('/site/en');

    const switcher = page.getByTestId('hero-device-switcher');
    const tablist = switcher.getByRole('tablist', { name: 'Device' });
    await expect(tablist).toBeVisible({ timeout: 15_000 });

    const iphone = page.getByTestId('hero-device-tab-iphone');
    const ipad = page.getByTestId('hero-device-tab-ipad');
    const watch = page.getByTestId('hero-device-tab-watch');
    await expect(iphone).toHaveAttribute('aria-selected', 'true');
    await expect(ipad).toHaveAttribute('aria-selected', 'false');
    await expect(watch).toHaveAttribute('aria-selected', 'false');

    const heightBefore = (await switcher.boundingBox())!.height;

    // Click selects the panel; the visible image carries the device alt text.
    await ipad.click();
    await expect(ipad).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByTestId('hero-device-panel-ipad').getByRole('img', {
        name: 'Active workout on iPad',
      }),
    ).toBeVisible();

    // ArrowRight/End/Home move focus and select immediately.
    await ipad.press('ArrowRight');
    await expect(watch).toHaveAttribute('aria-selected', 'true');
    await expect(watch).toBeFocused();
    await watch.press('End');
    await expect(watch).toBeFocused();
    await watch.press('Home');
    await expect(iphone).toHaveAttribute('aria-selected', 'true');
    await expect(iphone).toBeFocused();

    // One pass through every tab must not move the container height.
    for (const tab of [ipad, watch, iphone]) {
      await tab.click();
    }
    const heightAfter = (await switcher.boundingBox())!.height;
    expect(heightAfter).toBe(heightBefore);
  });

  test('shows the German Gerät label', async ({ page }) => {
    await page.goto('/site/de');
    await expect(
      page.getByTestId('hero-device-switcher').getByRole('tablist', { name: 'Gerät' }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
