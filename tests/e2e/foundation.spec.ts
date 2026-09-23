import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';

const operatorUserId = '22222222-2222-4222-8222-222222222222';
const operatorSessionId = '33333333-3333-4333-8333-333333333333';
const operatorFactorId = '44444444-4444-4444-8444-444444444444';
const playerUserId = '11111111-1111-4111-8111-111111111111';
const playerSessionId = '55555555-5555-4555-8555-555555555555';

interface TestFactor {
  id: string;
  status: 'verified' | 'unverified';
  factor_type: 'totp';
  friendly_name: string;
  created_at: string;
  updated_at: string;
}

function accessToken(aal: 'aal1' | 'aal2', method = 'password'): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    sub: operatorUserId,
    exp: 2_000_000_000,
    aal,
    session_id: operatorSessionId,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'operator@example.test',
    amr: [{ method, timestamp: 1_789_318_800 }],
  })}.fixture`;
}

function operatorUser(factors: TestFactor[]) {
  return {
    id: operatorUserId,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'operator@example.test',
    email_confirmed_at: '2026-09-13T12:00:00.000Z',
    phone: '',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    factors,
    created_at: '2026-09-13T12:00:00.000Z',
    updated_at: '2026-09-13T12:00:00.000Z',
  };
}

function passwordSession(aal: 'aal1' | 'aal2', factors: TestFactor[]) {
  return {
    access_token: accessToken(aal),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 2_000_000_000,
    refresh_token: `fixture-refresh-${aal}`,
    user: operatorUser(factors),
  };
}

function operatorRecoverySession(method = 'recovery') {
  return {
    ...passwordSession('aal1', []),
    access_token: accessToken('aal1', method),
    refresh_token: 'fixture-operator-recovery-refresh',
  };
}

function playerUser(factors: TestFactor[] = []) {
  return {
    id: playerUserId,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'player@example.test',
    email_confirmed_at: '2026-09-13T12:00:00.000Z',
    phone: '',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    factors,
    created_at: '2026-09-13T12:00:00.000Z',
    updated_at: '2026-09-13T12:00:00.000Z',
  };
}

function playerSession(
  method: 'password' | 'recovery' | 'otp' | 'signup',
  options: {
    aal?: 'aal1' | 'aal2';
    factors?: TestFactor[];
    additionalMethods?: string[];
  } = {},
) {
  const factors = options.factors ?? [];
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const accessToken = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    sub: playerUserId,
    exp: 2_000_000_000,
    aal: options.aal ?? 'aal1',
    session_id: playerSessionId,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'player@example.test',
    amr: [method, ...(options.additionalMethods ?? [])].map((name, index) => ({
      method: name,
      timestamp: 1_789_318_800 + index,
    })),
  })}.fixture`;
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 2_000_000_000,
    refresh_token: 'fixture-recovery-refresh',
    user: playerUser(factors),
  };
}

async function useControlledAuth(page: Page, port = 5173) {
  await page.route('**/v1/auth/config', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        supabaseUrl: `http://127.0.0.1:${port}`,
        supabasePublishableKey: 'sb_publishable_browser_fixture',
      }),
    }),
  );
}

async function restorePlayerSession(
  page: Page,
  method: 'password' | 'recovery' | 'otp' | 'signup',
  options: Parameters<typeof playerSession>[1] = {},
) {
  await useControlledAuth(page);
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(playerUser(options.factors)),
    }),
  );
  await page.goto('/account/sign-in');
  await page.evaluate(
    ({ storageKey, session }) => localStorage.setItem(storageKey, JSON.stringify(session)),
    { storageKey: 'sb-127-auth-token', session: playerSession(method, options) },
  );
  await page.reload();
}

async function useOperatorPasswordSession(page: Page, factors: TestFactor[]) {
  await useControlledAuth(page, 5174);
  await page.route('**/v1/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authUserId: operatorUserId,
        email: 'operator@example.test',
        emailVerified: true,
        sessionId: operatorSessionId,
        aal: 'aal1',
        applicationRole: 'operator',
      }),
    }),
  );
  await page.route('**/auth/v1/token**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(passwordSession('aal1', factors)),
    }),
  );
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(operatorUser(factors)),
    }),
  );
}

test('assigned main-site sign-in opens same-origin operator MFA without another password', async ({ page }) => {
  await useControlledAuth(page);
  await page.route('**/auth/v1/token**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(passwordSession('aal1', [])) }),
  );
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(operatorUser([])) }),
  );
  await page.route('**/v1/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authUserId: operatorUserId,
        email: 'operator@example.test',
        emailVerified: true,
        sessionId: operatorSessionId,
        aal: 'aal1',
        applicationRole: 'operator',
      }),
    }),
  );
  await page.goto('/account/sign-in');
  await page.getByLabel('Email address').fill('operator@example.test');
  await page.getByLabel('Password').fill('long-enough-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:5173/operator/');
  await expect(page.getByRole('heading', { name: 'Add an authenticator.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Operator sign in.' })).toHaveCount(0);
});

test('ordinary main-site sign-in stays in the player application', async ({ page }) => {
  await useControlledAuth(page);
  await page.route('**/auth/v1/token**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(playerSession('password')) }),
  );
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(playerUser()) }),
  );
  await page.route('**/v1/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authUserId: playerUserId,
        email: 'player@example.test',
        emailVerified: true,
        sessionId: playerSessionId,
        aal: 'aal1',
        applicationRole: 'player',
      }),
    }),
  );
  await page.goto('/account/sign-in');
  await page.getByLabel('Email address').fill('player@example.test');
  await page.getByLabel('Password').fill('long-enough-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:5173/');
  await expect(page.getByRole('heading', { name: 'Welcome to Hunter World.' })).toBeVisible();
});

test('operator can retry temporary assignment verification failure without signing in again', async ({ page }) => {
  await useOperatorPasswordSession(page, []);
  let failLookup = true;
  let passwordRequests = 0;
  await page.route('**/auth/v1/token**', (route) => {
    passwordRequests += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(passwordSession('aal1', [])) });
  });
  await page.route('**/v1/auth/session', (route) => route.fulfill({
    status: failLookup ? 503 : 200,
    contentType: 'application/json',
    body: JSON.stringify(failLookup ? { error: { code: 'AUTH_UNAVAILABLE', requestId: 'fixture' } } : {
      authUserId: operatorUserId, email: 'operator@example.test', emailVerified: true,
      sessionId: operatorSessionId, aal: 'aal1', applicationRole: 'operator',
    }),
  }));
  await page.goto('http://127.0.0.1:5174/operator/');
  await page.getByLabel('Operator email').fill('operator@example.test');
  await page.getByLabel('Password').fill('long-enough-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Operator authentication unavailable.' })).toBeVisible();
  failLookup = false;
  await page.getByRole('button', { name: 'Retry verification' }).click({ timeout: 1_000 });
  await expect(page.getByRole('heading', { name: 'Add an authenticator.' })).toBeVisible();
  expect(passwordRequests).toBe(1);
});

for (const recovery of [false, true]) {
  test(`${recovery ? 'recovery' : 'operator'} MFA cannot replace a newer login in another tab`, async ({ page, context }) => {
    const factors: TestFactor[] = [{
      id: operatorFactorId, status: 'verified', factor_type: 'totp',
      friendly_name: 'Test authenticator', created_at: '2026-09-13T12:00:00.000Z',
      updated_at: '2026-09-13T12:00:00.000Z',
    }];
    const sessionA = {
      ...passwordSession('aal1', factors),
      access_token: accessToken('aal1', recovery ? 'recovery' : 'password'),
    };
    const sessionB = playerSession('password');
    await context.route('**/v1/auth/config', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({
        supabaseUrl: 'http://127.0.0.1:5173', supabasePublishableKey: 'sb_publishable_browser_fixture',
      }),
    }));
    await context.route('**/auth/v1/user', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(route.request().headers().authorization === `Bearer ${sessionB.access_token}`
        ? playerUser() : operatorUser(factors)),
    }));
    await context.route('**/auth/v1/token**', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(sessionB),
    }));
    await context.route('**/v1/auth/session', (route) => {
      const isB = route.request().headers().authorization === `Bearer ${sessionB.access_token}`;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        authUserId: isB ? playerUserId : operatorUserId,
        email: isB ? 'player@example.test' : 'operator@example.test', emailVerified: true,
        sessionId: isB ? playerSessionId : operatorSessionId, aal: 'aal1',
        applicationRole: isB ? 'player' : 'operator',
      }) });
    });
    await context.route(`**/auth/v1/factors/${operatorFactorId}/challenge`, (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: 'deferred-challenge', type: 'totp', expires_at: 2_000_000_000 }),
    }));
    let releaseVerification: () => void = () => undefined;
    const heldVerification = new Promise<void>((resolveHeld) => { releaseVerification = resolveHeld; });
    let verificationStarted: () => void = () => undefined;
    const started = new Promise<void>((resolveStarted) => { verificationStarted = resolveStarted; });
    let completedVerification: () => void = () => undefined;
    const completed = new Promise<void>((resolveCompleted) => { completedVerification = resolveCompleted; });
    await context.route(`**/auth/v1/factors/${operatorFactorId}/verify`, async (route) => {
      verificationStarted();
      await heldVerification;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        ...passwordSession('aal2', factors),
        access_token: accessToken('aal2', recovery ? 'recovery' : 'password'),
      }) });
      completedVerification();
    });
    await context.route('**/__auth-concurrency-test', (route) => route.fulfill({
      status: 200, contentType: 'text/html', body: '<!doctype html><body>Test login client</body>',
    }));
    // Seed from an inert same-origin page: a loaded player app would legitimately route the
    // operator session to /operator/ itself and race this navigation.
    await page.goto('/__auth-concurrency-test');
    await page.evaluate((session) => localStorage.setItem('sb-127-auth-token', JSON.stringify(session)), sessionA);
    await page.goto(recovery ? '/account/recovery' : '/operator/');
    await page.getByLabel(recovery ? 'Authenticator code' : 'Six-digit code').fill('123456');
    await page.getByRole('button', { name: 'Verify authenticator' }).click();
    await started;

    // The second page uses the real public client and SDK, without a second app's
    // automatic role redirect preventing the deliberately overlapping sign-in.
    const second = await context.newPage();
    await second.goto('/__auth-concurrency-test');
    const moduleUrl = `/@fs/${resolve('packages/client/src/auth.ts').replaceAll('\\', '/')}`;
    await second.evaluate(async (url) => {
      const client = await import(url) as typeof import('../../packages/client/src/auth');
      const controller = await client.createBrowserAuthController();
      await controller.ready();
      controller.subscribe(() => { document.body.textContent = controller.getSnapshot().user?.email ?? 'Signed out'; });
      await controller.signIn('player@example.test', 'long-enough-password');
    }, moduleUrl);
    await expect(second.locator('body')).toHaveText('player@example.test');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('sb-127-auth-token') ?? '{}').access_token)).toBe(sessionB.access_token);
    for (const tab of [page, second]) {
      await tab.evaluate(() => {
        const originalSetItem = Storage.prototype.setItem;
        const seen: string[] = [];
        (window as unknown as { authWrites: string[] }).authWrites = seen;
        Storage.prototype.setItem = function (key, value) {
          if (key === 'sb-127-auth-token') seen.push(value);
          originalSetItem.call(this, key, value);
        };
        window.addEventListener('storage', (event) => {
          if (event.key === 'sb-127-auth-token' && event.newValue) seen.push(event.newValue);
        });
      });
    }
    releaseVerification();
    await completed;
    await expect(page.getByRole('button', { name: 'Verifying…' })).toHaveCount(0);
    await expect(second.locator('body')).toHaveText('player@example.test');
    for (const tab of [page, second]) {
      const result = await tab.evaluate(() => ({
        current: JSON.parse(localStorage.getItem('sb-127-auth-token') ?? '{}').access_token,
        writes: (window as unknown as { authWrites: string[] }).authWrites.map((value) => JSON.parse(value).access_token as string),
      }));
      expect(result.current).toBe(sessionB.access_token);
      expect(result.writes.every((token) => token === sessionB.access_token)).toBe(true);
    }
    if (recovery) await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
    else await expect(page.getByRole('heading', { name: 'Operator access denied.' })).toBeVisible();
  });
}

test('unassigned direct operator visit is denied before authenticator enrollment', async ({ page }) => {
  await useOperatorPasswordSession(page, []);
  await page.route('**/v1/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authUserId: operatorUserId,
        email: 'operator@example.test',
        emailVerified: true,
        sessionId: operatorSessionId,
        aal: 'aal1',
        applicationRole: 'player',
      }),
    }),
  );
  let enrollmentRequests = 0;
  await page.route('**/auth/v1/factors', (route) => {
    enrollmentRequests += 1;
    return route.fulfill({ status: 500, body: '{}' });
  });
  await page.goto('http://127.0.0.1:5174/operator/');
  await page.getByLabel('Operator email').fill('operator@example.test');
  await page.getByLabel('Password').fill('long-enough-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Operator access denied.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add an authenticator.' })).toHaveCount(0);
  expect(enrollmentRequests).toBe(0);
});

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
  await useControlledAuth(page, 5174);
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

for (const method of ['otp', 'signup'] as const) {
  test(`${method} email verification requires password sign-in before application access`, async ({
    page,
  }) => {
    let ordinarySessionRequests = 0;
    await page.route('**/v1/auth/session', (route) => {
      ordinarySessionRequests += 1;
      return route.fulfill({ status: 403, body: '{}' });
    });
    await restorePlayerSession(page, method);
    await page.goto('/auth/callback');
    await expect(page.getByRole('heading', { name: 'Account link confirmed.' })).toBeVisible();
    await expect(
      page.getByText('Your email link is confirmed. Sign in with your password to continue.'),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Return to sign in' }).click();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(page.getByText('Recovery in progress')).toHaveCount(0);
    expect(ordinarySessionRequests).toBe(0);
  });
}

test('player recovery session stays locked to password replacement across navigation and reload', async ({
  page,
}) => {
  let ordinarySessionRequests = 0;
  await page.route('**/v1/auth/session', (route) => {
    ordinarySessionRequests += 1;
    return route.fulfill({
      status: 403,
      contentType: 'application/problem+json',
      body: JSON.stringify({ error: { code: 'PASSWORD_UPDATE_REQUIRED' } }),
    });
  });
  await restorePlayerSession(page, 'recovery');

  await expect(page).toHaveURL(/\/account\/recovery$/);
  await expect(page.getByRole('heading', { name: 'Choose a new password.' })).toBeVisible();
  await expect(page.getByText('Recovery in progress')).toBeVisible();
  expect(ordinarySessionRequests).toBe(0);

  await page.goto('/map');
  await expect(page).toHaveURL(/\/account\/recovery$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Choose a new password.' })).toBeVisible();
  expect(ordinarySessionRequests).toBe(0);
});

test('MFA-enrolled player verifies an authenticator before password replacement and stays recovery-only', async ({
  page,
}) => {
  const factors: TestFactor[] = [
    {
      id: operatorFactorId,
      status: 'verified',
      factor_type: 'totp',
      friendly_name: 'Player authenticator',
      created_at: '2026-09-13T12:00:00.000Z',
      updated_at: '2026-09-13T12:00:00.000Z',
    },
  ];
  let ordinarySessionRequests = 0;
  let verificationAttempts = 0;
  await page.route('**/v1/auth/session', (route) => {
    ordinarySessionRequests += 1;
    return route.fulfill({ status: 403, body: '{}' });
  });
  await restorePlayerSession(page, 'recovery', { factors });
  await page.route(`**/auth/v1/factors/${operatorFactorId}/challenge`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: `recovery-challenge-${verificationAttempts + 1}`,
        type: 'totp',
        expires_at: 2_000_000_000,
      }),
    }),
  );
  await page.route(`**/auth/v1/factors/${operatorFactorId}/verify`, (route) => {
    verificationAttempts += 1;
    if (verificationAttempts === 1) {
      return route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ error_code: 'invalid_totp', msg: 'private provider detail' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        playerSession('recovery', {
          aal: 'aal2',
          factors,
          additionalMethods: ['totp'],
        }),
      ),
    });
  });

  await expect(
    page.getByRole('heading', { name: 'Authenticator verification required.' }),
  ).toBeVisible();
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
  await page.getByLabel('Authenticator code').fill('111111');
  await page.getByRole('button', { name: 'Verify authenticator' }).click();
  await expect(page.getByText('The authenticator code was not accepted.')).toBeVisible();
  await expect(page.getByLabel('Authenticator code')).toHaveValue('');
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);

  await page.getByLabel('Authenticator code').fill('123456');
  await page.getByRole('button', { name: 'Verify authenticator' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a new password.' })).toBeVisible();
  await expect(page.getByText('Authenticator verified. Choose a new password.')).toBeVisible();
  expect(ordinarySessionRequests).toBe(0);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Choose a new password.' })).toBeVisible();
  await expect(page.getByText('Recovery in progress')).toBeVisible();
  expect(ordinarySessionRequests).toBe(0);

  await page.route('**/auth/v1/user', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(playerUser(factors)),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(playerUser(factors)),
    });
  });
  await page.route('**/auth/v1/logout**', (route) => route.fulfill({ status: 204, body: '' }));
  await page.getByLabel('New password', { exact: true }).fill('replacement-password');
  await page.getByLabel('Confirm new password').fill('replacement-password');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page).toHaveURL(/\/account\/sign-in$/);
  await expect(
    page.getByText('Your password has been updated. Sign in with your new password.'),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('sb-127-auth-token')))
    .toBeNull();
});

test('recovery security check can be retried without exposing password controls', async ({
  page,
}) => {
  const factors: TestFactor[] = [
    {
      id: operatorFactorId,
      status: 'verified',
      factor_type: 'totp',
      friendly_name: 'Player authenticator',
      created_at: '2026-09-13T12:00:00.000Z',
      updated_at: '2026-09-13T12:00:00.000Z',
    },
  ];
  let userAvailable = false;
  await useControlledAuth(page);
  await page.route('**/auth/v1/user', (route) => {
    return route.fulfill(
      userAvailable
        ? {
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(playerUser(factors)),
          }
        : { status: 503, contentType: 'application/json', body: '{"msg":"provider unavailable"}' },
    );
  });
  await page.goto('/account/sign-in');
  await page.evaluate(
    ({ storageKey, session }) => localStorage.setItem(storageKey, JSON.stringify(session)),
    { storageKey: 'sb-127-auth-token', session: playerSession('recovery', { factors }) },
  );
  await page.reload();

  await expect(
    page.getByRole('heading', { name: 'Recovery verification unavailable.' }),
  ).toBeVisible();
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
  userAvailable = true;
  await page.getByRole('button', { name: 'Try security check again' }).click();
  await expect(
    page.getByRole('heading', { name: 'Authenticator verification required.' }),
  ).toBeVisible();
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
});

test('player password replacement ends the recovery session and requires explicit sign-in', async ({
  page,
}) => {
  await restorePlayerSession(page, 'recovery');
  await page.route('**/auth/v1/user', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(playerUser()),
    });
  });
  await page.route('**/auth/v1/logout**', (route) => route.fulfill({ status: 204, body: '' }));

  await page.getByLabel('New password', { exact: true }).fill('replacement-password');
  await page.getByLabel('Confirm new password').fill('replacement-password');
  await page.getByRole('button', { name: 'Update password' }).click();

  await expect(page).toHaveURL(/\/account\/sign-in$/);
  await expect(page.getByRole('heading', { name: 'Sign in to your account.' })).toBeVisible();
  await expect(
    page.getByText('Your password has been updated. Sign in with your new password.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Recovery in progress')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('sb-127-auth-token')))
    .toBeNull();

  await page.goBack();
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
  await page.goto('/account/recovery');
  await expect(page.getByRole('heading', { name: 'Recover your account.' })).toBeVisible();
  await expect(
    page.getByText('Your password has been updated. Sign in with your new password.'),
  ).toHaveCount(0);
});

for (const failure of ['password update', 'global sign-out'] as const) {
  test(`failed ${failure} never grants application access or reports full success`, async ({
    page,
  }) => {
    await restorePlayerSession(page, 'recovery');
    await page.route('**/auth/v1/user', async (route) => {
      if (route.request().method() !== 'PUT') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: failure === 'password update' ? 500 : 200,
        contentType: 'application/json',
        body: JSON.stringify(
          failure === 'password update' ? { msg: 'Provider unavailable' } : playerUser(),
        ),
      });
    });
    await page.route('**/auth/v1/logout**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: '{"msg":"Provider unavailable"}',
      }),
    );

    await page.getByLabel('New password', { exact: true }).fill('replacement-password');
    await page.getByLabel('Confirm new password').fill('replacement-password');
    await page.getByRole('button', { name: 'Update password' }).click();

    await expect(page).toHaveURL(/\/account\/recovery$/);
    await expect(
      page.getByText('Your password has been updated. Sign in with your new password.'),
    ).toHaveCount(0);
    if (failure === 'password update') {
      await expect(page.getByRole('button', { name: 'Update password' })).toBeEnabled();
      await expect(page.getByRole('heading', { name: 'Choose a new password.' })).toBeVisible();
      await page.goto('/map');
      await expect(page).toHaveURL(/\/account\/recovery$/);
    } else {
      // The SDK removes local credentials even if global revocation fails.
      await expect(page.getByRole('heading', { name: 'Recover your account.' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Send recovery link' })).toBeEnabled();
      await expect
        .poll(() => page.evaluate(() => localStorage.getItem('sb-127-auth-token')))
        .toBeNull();
      await expect(
        page.getByText(
          'Your password was updated, but signing out all sessions could not be confirmed. Return to sign in with your new password, then retry signing out.',
        ),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Return to sign in' })).toBeVisible();
    }
  });
}

test('player can cancel recovery only by signing the recovery session out', async ({ page }) => {
  await restorePlayerSession(page, 'recovery');
  await page.route('**/auth/v1/logout**', (route) => route.fulfill({ status: 204, body: '' }));

  await page
    .getByRole('button', { name: 'Cancel recovery and sign out' })
    .click({ timeout: 1_000 });

  await expect(page).toHaveURL(/\/account\/sign-in$/);
  await expect(page.getByRole('heading', { name: 'Sign in to your account.' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('sb-127-auth-token')))
    .toBeNull();
});

test('ordinary signed-in sessions cannot use recovery as a password-change shortcut', async ({
  page,
}) => {
  await page.route('**/v1/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authUserId: playerUserId,
        email: 'player@example.test',
        emailVerified: true,
        sessionId: playerSessionId,
        aal: 'aal1',
        applicationRole: 'player',
      }),
    }),
  );
  await restorePlayerSession(page, 'password');
  await page.goto('/account/recovery');

  await expect(page.getByRole('heading', { name: 'Recover your account.' })).toBeVisible();
  await expect(page.getByLabel('New password')).toHaveCount(0);
});

test('operator MFA starts behind password authentication without registration', async ({
  page,
}) => {
  await useControlledAuth(page, 5174);
  await page.goto('http://127.0.0.1:5174');
  await expect(page.getByRole('heading', { name: 'Operator sign in.' })).toBeVisible();
  await expect(page.getByRole('link', { name: /create/i })).toHaveCount(0);
  await page.getByLabel('Operator email').fill('operator@example.test');
  await page.getByLabel('Password').fill('short');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Use at least 12 characters for your password.')).toBeVisible();
  await expect(page.getByText('Operator session authorized.')).toHaveCount(0);
});

for (const method of ['recovery', 'otp']) {
  test(`operator client rejects ${method} sessions before entering the MFA flow`, async ({
    page,
  }) => {
    await useControlledAuth(page, 5174);
    await page.route('**/auth/v1/user', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(operatorUser([])),
      }),
    );
    await page.goto('http://127.0.0.1:5174');
    await page.evaluate(
      ({ storageKey, session }) => localStorage.setItem(storageKey, JSON.stringify(session)),
      { storageKey: 'sb-127-auth-token', session: operatorRecoverySession(method) },
    );
    await page.reload();

    await expect(page.getByRole('heading', { name: 'Operator access denied.' })).toBeVisible();
    await expect(
      page.getByText(
        method === 'recovery'
          ? 'Password recovery sessions cannot access the operator workspace.'
          : 'Sign in with your password before accessing the operator workspace.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Add an authenticator.' })).toHaveCount(0);
  });
}

test('operator MFA enrollment keeps its QR secret inside the enrollment step', async ({ page }) => {
  await useOperatorPasswordSession(page, []);
  await page.route('**/auth/v1/factors', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: operatorFactorId,
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
  await page.goto('http://127.0.0.1:5174');
  await page.getByLabel('Operator email').fill('operator@example.test');
  await page.getByLabel('Password').fill('long-enough-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Add an authenticator.' })).toBeVisible();
  await expect(page.getByText('JBSWY3DPEHPK3PXP')).toHaveCount(0);
  await page.getByRole('button', { name: 'Set up authenticator' }).click();
  await expect(page.getByRole('img', { name: 'Authenticator enrollment QR code' })).toBeVisible();
  await expect(page.getByText('JBSWY3DPEHPK3PXP')).toBeVisible();
  await page.getByLabel('Six-digit code').fill('123');
  await page.getByRole('button', { name: 'Verify authenticator' }).click();
  await expect(page.getByText('Enter the six-digit authenticator code.')).toBeVisible();
  await expect(page.getByText('Operator session authorized.')).toHaveCount(0);
});

test('operator MFA keeps an unprovisioned AAL2 identity denied', async ({ page }) => {
  const factors: TestFactor[] = [
    {
      id: operatorFactorId,
      status: 'verified',
      factor_type: 'totp',
      friendly_name: 'Hunter World Operator',
      created_at: '2026-09-13T12:00:00.000Z',
      updated_at: '2026-09-13T12:00:00.000Z',
    },
  ];
  await useOperatorPasswordSession(page, factors);
  await page.route(`**/auth/v1/factors/${operatorFactorId}/challenge`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'challenge-fixture', type: 'totp', expires_at: 2_000_000_000 }),
    }),
  );
  await page.route(`**/auth/v1/factors/${operatorFactorId}/verify`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(passwordSession('aal2', factors)),
    }),
  );
  await page.route('**/v1/operator/session', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/problem+json',
      body: JSON.stringify({ error: { code: 'OPERATOR_ACCESS_DENIED' } }),
    }),
  );
  await page.goto('http://127.0.0.1:5174');
  await page.getByLabel('Operator email').fill('operator@example.test');
  await page.getByLabel('Password').fill('long-enough-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Enter your authenticator code.' })).toBeVisible();
  await expect(page.getByRole('img', { name: /QR/i })).toHaveCount(0);
  await expect(page.getByText('JBSWY3DPEHPK3PXP')).toHaveCount(0);
  await page.getByLabel('Six-digit code').fill('123456');
  await page.getByRole('button', { name: 'Verify authenticator' }).click();
  await expect(page.getByRole('heading', { name: 'Operator access denied.' })).toBeVisible();
  await expect(page.getByText('Operator session authorized.')).toHaveCount(0);
});

test('operator MFA admits only an active AAL2 operator to the restricted shell', async ({
  page,
}) => {
  const factors: TestFactor[] = [
    {
      id: operatorFactorId,
      status: 'verified',
      factor_type: 'totp',
      friendly_name: 'Hunter World Operator',
      created_at: '2026-09-13T12:00:00.000Z',
      updated_at: '2026-09-13T12:00:00.000Z',
    },
  ];
  await useOperatorPasswordSession(page, factors);
  await page.route(`**/auth/v1/factors/${operatorFactorId}/challenge`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'challenge-fixture', type: 'totp', expires_at: 2_000_000_000 }),
    }),
  );
  await page.route(`**/auth/v1/factors/${operatorFactorId}/verify`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(passwordSession('aal2', factors)),
    }),
  );
  await page.route('**/v1/operator/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authUserId: operatorUserId,
        aal: 'aal2',
        permissions: ['system:read'],
      }),
    }),
  );
  await page.goto('http://127.0.0.1:5174');
  await page.getByLabel('Operator email').fill('operator@example.test');
  await page.getByLabel('Password').fill('long-enough-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Six-digit code').fill('123456');
  await page.getByRole('button', { name: 'Verify authenticator' }).click();
  await expect(page.getByRole('heading', { name: 'Operator session authorized.' })).toBeVisible();
  await expect(page.getByText('system:read', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Administrative tools remain unavailable in this task.'),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: /QR/i })).toHaveCount(0);
  await expect(page.getByText('JBSWY3DPEHPK3PXP')).toHaveCount(0);
});
