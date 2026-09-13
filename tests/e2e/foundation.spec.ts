import { expect, test, type Page } from '@playwright/test';

async function useControlledAuth(page: Page) {
  await page.route('**/v1/auth/config', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        supabaseUrl: 'http://127.0.0.1:5173',
        supabasePublishableKey: 'sb_publishable_browser_fixture',
      }),
    }),
  );
}

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

test('player account access is responsive and validates secrets locally', async ({ page }) => {
  await useControlledAuth(page);
  await page.goto('/account/register');
  await expect(page.getByRole('heading', { name: 'Create your account.' })).toBeVisible();
  await page.getByLabel('Email address').fill('player@example.test');
  await page.getByLabel('Password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Use at least 12 characters for your password.')).toBeVisible();
  expect(page.url()).not.toContain('short');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('player account registration reaches the provider and requests verification', async ({
  page,
}) => {
  await useControlledAuth(page);
  await page.route('**/auth/v1/signup**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '11111111-1111-4111-8111-111111111111',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'player@example.test',
        phone: '',
        confirmation_sent_at: '2026-09-13T12:00:00.000Z',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        identities: [],
        created_at: '2026-09-13T12:00:00.000Z',
        updated_at: '2026-09-13T12:00:00.000Z',
      }),
    });
  });
  await page.goto('/account/register');
  await page.getByLabel('Email address').fill('player@example.test');
  await page.getByLabel('Password').fill('long-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Check your email to verify this account.')).toBeVisible();
});

test('player sign-in and recovery errors stay actionable and redacted', async ({ page }) => {
  await useControlledAuth(page);
  await page.route('**/auth/v1/token**', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error_code: 'invalid_credentials',
        msg: 'internal provider detail for invalid credentials',
      }),
    }),
  );
  await page.goto('/account/sign-in');
  await page.getByLabel('Email address').fill('player@example.test');
  await page.getByLabel('Password').fill('long-enough-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('The email or password is incorrect.')).toBeVisible();
  await expect(page.getByText(/internal provider detail/)).toHaveCount(0);

  await page.route('**/auth/v1/recover**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/account/recovery');
  await page.getByLabel('Email address').fill('player@example.test');
  await page.getByRole('button', { name: 'Send recovery link' }).click();
  await expect(
    page.getByText('If the account exists, a recovery link is on its way.'),
  ).toBeVisible();
});

test('player verification callback fails safely without a confirmed session', async ({ page }) => {
  await useControlledAuth(page);
  await page.goto('/auth/callback');
  await expect(page.getByText('This account link could not be confirmed.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Return to sign in' })).toBeVisible();
});
