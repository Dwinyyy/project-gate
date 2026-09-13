import { expect, test } from '@playwright/test';

test('player navigation, real API response and responsive layout', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  for (const path of ['map', 'activity', 'community', 'inventory', 'body', 'identity']) {
    await page.goto(`/${path}`);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/foundation-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/foundation-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('operator screen and endpoint remain locked', async ({ page, request }) => {
  await page.goto('http://127.0.0.1:5174');
  await expect(page.getByText('Operator access locked')).toBeVisible();
  const response = await request.post('http://127.0.0.1:3001/v1/operator/feature-controls', {
    data: { commerce: true },
  });
  expect(response.status()).toBe(401);
});

test('failed status request is visibly unavailable', async ({ page }) => {
  await page.route('**/v1/system/status', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/');
  await expect(page.getByText('Connection unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('Connected', { exact: true })).toHaveCount(0);
});
