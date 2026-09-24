import { expect, test } from '@playwright/test';

test('desktop preview keeps the player in a centered portrait app with bottom navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  const header = page.getByRole('banner');
  const main = page.getByRole('main');
  await expect(navigation).toBeVisible();
  const navBox = (await navigation.boundingBox())!;
  const headerBox = (await header.boundingBox())!;
  const mainBox = (await main.boundingBox())!;
  expect(navBox.width).toBeLessThanOrEqual(480);
  expect(navBox.width).toBeGreaterThanOrEqual(400);
  expect(Math.abs(navBox.x + navBox.width / 2 - 720)).toBeLessThan(2);
  expect(navBox.y).toBeGreaterThan(mainBox.y + mainBox.height - 1);
  expect(headerBox.height).toBeLessThan(85);
  expect(headerBox.y + headerBox.height).toBeLessThanOrEqual(mainBox.y);
  expect(await main.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-shell-desktop.png' });
});

test('small phones keep touch navigation in view while screens scroll and reset on navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  const main = page.getByRole('main');
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(navigation).toBeVisible();
  const navBefore = (await navigation.boundingBox())!;
  expect(navBefore.y + navBefore.height).toBeGreaterThanOrEqual(630);
  for (const control of await page.getByRole('banner').getByRole('link').all()) {
    const box = (await control.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  for (const tab of await navigation.getByRole('link').all()) {
    const box = (await tab.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await main.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
  expect(await navigation.boundingBox()).toEqual(navBefore);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await navigation.getByRole('link', { name: 'Map', exact: true }).click();
  await expect(navigation.getByRole('link', { name: 'Map', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByText(/Your location is not being requested or tracked/)).toBeVisible();
  await navigation.getByRole('link', { name: 'System', exact: true }).click();
  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.getByRole('heading', { name: 'Welcome to Hunter World.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-shell-phone.png' });
});

test('account fields and submit stay reachable in a short mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 420 });
  await page.goto('/account/sign-in');
  const main = page.getByRole('main');
  const password = page.getByLabel('Password', { exact: true });
  await page.getByLabel('Email address', { exact: true }).fill('player@example.test');
  await password.fill('a-local-layout-check');
  await expect(password).toBeFocused();
  const fieldBox = (await password.boundingBox())!;
  const mainBox = (await main.boundingBox())!;
  expect(fieldBox.y).toBeGreaterThanOrEqual(mainBox.y);
  expect(fieldBox.y + fieldBox.height).toBeLessThanOrEqual(mainBox.y + mainBox.height);
  expect(
    await password.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  const submit = page.getByRole('button', { name: 'Sign in', exact: true });
  await submit.scrollIntoViewIfNeeded();
  const submitBox = (await submit.boundingBox())!;
  expect(submitBox.y).toBeGreaterThanOrEqual(mainBox.y);
  expect(submitBox.y + submitBox.height).toBeLessThanOrEqual(mainBox.y + mainBox.height);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'test-results/mobile-shell-account-short.png' });
});
