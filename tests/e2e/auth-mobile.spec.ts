import { expect, test, type Page } from '@playwright/test';
import { OPERATOR_PATH } from '../../packages/contracts/src/navigation';

const operatorUserId = '22222222-2222-4222-8222-222222222222';
const operatorSessionId = '33333333-3333-4333-8333-333333333333';
const playerUserId = '11111111-1111-4111-8111-111111111111';
const playerSessionId = '55555555-5555-4555-8555-555555555555';

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function operatorSession() {
  const user = {
    id: operatorUserId,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'operator@example.test',
    email_confirmed_at: '2026-09-13T12:00:00.000Z',
    phone: '',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    factors: [],
    created_at: '2026-09-13T12:00:00.000Z',
    updated_at: '2026-09-13T12:00:00.000Z',
  };
  const accessToken = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    sub: operatorUserId,
    exp: 2_000_000_000,
    aal: 'aal1',
    session_id: operatorSessionId,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    amr: [{ method: 'password', timestamp: 1_789_318_800 }],
  })}.fixture`;
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 2_000_000_000,
    refresh_token: 'fixture-mobile-refresh',
    user,
  };
}

function playerSession() {
  const user = {
    id: playerUserId,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'player@example.test',
    email_confirmed_at: '2026-09-13T12:00:00.000Z',
    phone: '',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    factors: [],
    created_at: '2026-09-13T12:00:00.000Z',
    updated_at: '2026-09-13T12:00:00.000Z',
  };
  const accessToken = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    sub: playerUserId,
    exp: 2_000_000_000,
    aal: 'aal1',
    session_id: playerSessionId,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    amr: [{ method: 'password', timestamp: 1_789_318_800 }],
  })}.fixture`;
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 2_000_000_000,
    refresh_token: 'fixture-player-mobile-refresh',
    user,
  };
}

async function installSession(page: Page, session: ReturnType<typeof operatorSession>) {
  await page.addInitScript((value) => {
    localStorage.setItem('sb-127-auth-token', JSON.stringify(value));
  }, session);
  await page.route('**/v1/auth/config', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        supabaseUrl: 'http://127.0.0.1:5173',
        supabasePublishableKey: 'sb_publishable_mobile_fixture',
      }),
    }),
  );
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session.user),
    }),
  );
}

async function openAssignedOperator(page: Page) {
  const session = operatorSession();
  await installSession(page, session);
  await page.route('**/v1/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authUserId: operatorUserId,
        email: session.user.email,
        emailVerified: true,
        sessionId: operatorSessionId,
        aal: 'aal1',
        applicationRole: 'operator',
      }),
    }),
  );
  await page.goto(OPERATOR_PATH);
  await expect(page.getByRole('heading', { name: 'Add an authenticator.' })).toBeVisible();
}

test('operator account validation uses a compact held loading state at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const session = operatorSession();
  await installSession(page, session);
  let releaseValidation: () => void = () => undefined;
  const heldValidation = new Promise<void>((resolve) => {
    releaseValidation = resolve;
  });
  await page.route('**/v1/auth/session', async (route) => {
    await heldValidation;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authUserId: operatorUserId,
        email: session.user.email,
        emailVerified: true,
        sessionId: operatorSessionId,
        aal: 'aal1',
        applicationRole: 'operator',
      }),
    });
  });
  await page.goto(OPERATOR_PATH);
  await expect(page.getByRole('heading', { name: 'Checking your account…' })).toBeVisible();
  const panel = await page
    .getByRole('heading', { name: 'Checking your account…' })
    .evaluate((heading) => {
      const bounds = heading.parentElement?.getBoundingClientRect();
      return bounds ? { width: bounds.width, height: bounds.height, left: bounds.left } : null;
    });
  expect(panel?.width).toBeLessThanOrEqual(288);
  expect(panel?.height).toBeLessThan(360);
  expect(panel?.left).toBeGreaterThanOrEqual(16);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/account-checking-320.png' });
  releaseValidation();
  await expect(page.getByRole('heading', { name: 'Add an authenticator.' })).toBeVisible();
});

test('player account validation error keeps recovery actions reachable in a short viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 420 });
  await installSession(page, playerSession());
  await page.route('**/v1/auth/session', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Account verification unavailable.' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry verification' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/account-error-short-390.png' });

  await page.setViewportSize({ width: 1440, height: 1000 });
  const errorPanel = await page
    .getByRole('heading', { name: 'Account verification unavailable.' })
    .evaluate((heading) => heading.parentElement?.getBoundingClientRect().width);
  expect(errorPanel).toBe(408);
  await page.screenshot({ path: 'test-results/account-error-desktop.png' });
});

test('operator auth shell fills phones and stays in a portrait canvas on desktop', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openAssignedOperator(page);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const phoneShell = await page.locator('header').evaluate((header) => {
    const shell = header.parentElement;
    const main = shell?.querySelector('main');
    return {
      width: shell?.getBoundingClientRect().width,
      height: shell?.getBoundingClientRect().height,
      internalScroll: main ? main.scrollHeight > main.clientHeight : false,
    };
  });
  expect(phoneShell).toEqual({ width: 320, height: 568, internalScroll: true });
  await page.screenshot({ path: 'test-results/operator-mobile-320.png' });

  await page.setViewportSize({ width: 1440, height: 1000 });
  const desktopShell = await page.locator('header').evaluate((header) => {
    const bounds = header.parentElement?.getBoundingClientRect();
    return bounds ? { width: bounds.width, height: bounds.height, left: bounds.left } : null;
  });
  expect(desktopShell?.width).toBe(440);
  expect(desktopShell?.height).toBeLessThanOrEqual(900);
  expect(desktopShell?.left).toBe(500);
  await page.screenshot({ path: 'test-results/operator-desktop-portrait.png' });
});

test('operator enrollment QR remains contained at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/auth/v1/factors', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '44444444-4444-4444-8444-444444444444',
        type: 'totp',
        friendly_name: 'Hunter World Operator',
        status: 'unverified',
        created_at: '2026-09-13T12:00:00.000Z',
        updated_at: '2026-09-13T12:00:00.000Z',
        totp: {
          qr_code:
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="white"/><path d="M2 2h5v5H2zm7 0h5v5H9zM2 9h5v5H2z" fill="black"/></svg>',
          secret: 'JBSWY3DPEHPK3PXP',
          uri: 'otpauth://totp/Hunter%20World:operator%40example.test?secret=JBSWY3DPEHPK3PXP',
        },
      }),
    }),
  );
  await openAssignedOperator(page);
  await page.getByRole('button', { name: 'Set up authenticator' }).click();
  await expect(page.getByRole('img', { name: /QR/i })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/operator-enrollment-390.png' });
});
