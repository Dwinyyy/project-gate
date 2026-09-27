import { expect, test } from '@playwright/test';

test('registration requires matching passwords before sending a signup and clears both after success', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route('**/v1/auth/config', (route) =>
    route.fulfill({
      json: {
        supabaseUrl: 'http://127.0.0.1:5173',
        supabasePublishableKey: 'sb_publishable_browser_fixture',
      },
    }),
  );
  let signupRequests = 0;
  await page.route('**/auth/v1/signup**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204 });
      return;
    }
    signupRequests += 1;
    const body = route.request().postDataJSON() as Record<string, unknown>;
    expect(body.password).toBe('matching-fixture-password');
    expect(body).not.toHaveProperty('confirmation');
    await route.fulfill({
      json: {
        id: '11111111-1111-4111-8111-111111111111',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'player@example.test',
        phone: '',
        confirmation_sent_at: '2026-09-24T12:00:00Z',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        identities: [],
        created_at: '2026-09-24T12:00:00Z',
        updated_at: '2026-09-24T12:00:00Z',
      },
    });
  });
  await page.goto('/account/register');
  await page.getByLabel('Email address').fill('player@example.test');
  await page.getByLabel('Password', { exact: true }).fill('matching-fixture-password');
  const confirmation = page.getByLabel('Confirm password', { exact: true });
  await expect(confirmation).toHaveAttribute('type', 'password');
  await expect(confirmation).toHaveAttribute('autocomplete', 'new-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('The password confirmation does not match.')).toBeVisible();
  expect(signupRequests).toBe(0);
  await confirmation.fill('different-fixture-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('The password confirmation does not match.')).toBeVisible();
  expect(signupRequests).toBe(0);
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue(
    'matching-fixture-password',
  );
  await confirmation.fill('matching-fixture-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Check your email to verify this account.')).toBeVisible();
  expect(signupRequests).toBe(1);
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(confirmation).toHaveValue('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Already registered? Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to your account.' })).toBeVisible();
  await expect(confirmation).toHaveCount(0);
});
