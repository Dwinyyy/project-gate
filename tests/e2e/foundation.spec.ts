import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OPERATOR_PATH } from '../../packages/contracts/src/navigation';

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

function accessToken(
  aal: 'aal1' | 'aal2',
  method = 'password',
  sessionId = operatorSessionId,
): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    sub: operatorUserId,
    exp: 2_000_000_000,
    aal,
    session_id: sessionId,
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
    sessionId?: string;
  } = {},
) {
  const factors = options.factors ?? [];
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const accessToken = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    sub: playerUserId,
    exp: 2_000_000_000,
    aal: options.aal ?? 'aal1',
    session_id: options.sessionId ?? playerSessionId,
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
  await useControlledAuth(page);
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
  await page.route('**/__auth-state-test', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><body>Auth state fixture</body>',
    }),
  );
  await page.goto('/__auth-state-test');
  await page.evaluate(
    ({ storageKey, session }) => localStorage.setItem(storageKey, JSON.stringify(session)),
    { storageKey: 'sb-127-auth-token', session: passwordSession('aal1', factors) },
  );
}

test('assigned main-site sign-in opens same-origin operator MFA without another password', async ({
  page,
}) => {
  await useControlledAuth(page);
  await page.route('**/auth/v1/token**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(passwordSession('aal1', [])),
    }),
  );
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(operatorUser([])),
    }),
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
  await expect(page).toHaveURL(`http://127.0.0.1:5173${OPERATOR_PATH}`);
  await expect(page.getByRole('heading', { name: 'Add an authenticator.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Operator sign in.' })).toHaveCount(0);
});

test('operator shell stays hidden until assignment verification finishes', async ({ page }) => {
  await useOperatorPasswordSession(page, []);
  let releaseVerification: () => void = () => undefined;
  const heldVerification = new Promise<void>((resolveHeld) => {
    releaseVerification = resolveHeld;
  });
  await page.route('**/v1/auth/session', async (route) => {
    await heldVerification;
    await route.fulfill({
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
    });
  });
  await page.goto(OPERATOR_PATH);
  await expect(page.getByRole('heading', { name: 'Checking your account…' })).toBeVisible();
  await expect(page.getByText('OPERATOR WORKSPACE')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Add an authenticator.' })).toHaveCount(0);
  releaseVerification();
  await expect(page.getByRole('heading', { name: 'Add an authenticator.' })).toBeVisible();
});

test('ordinary main-site sign-in stays in the player application', async ({ page }) => {
  await useControlledAuth(page);
  await page.route('**/v1/me', (route) =>
    route.fulfill({
      json: {
        schemaVersion: 3,
        mode: 'onboarding',
        character: null,
        creation: { status: 'feature_disabled', notBefore: null },
      },
    }),
  );
  await page.route('**/auth/v1/token**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(playerSession('password')),
    }),
  );
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(playerUser()),
    }),
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
  await expect(page.getByRole('heading', { name: 'Create your character' })).toBeVisible();
  await expect(page.getByText(/Character creation is currently unavailable/)).toBeVisible();
});

test('player sees a dismissible warning when local sign-out lacks server confirmation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
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
  await page.route('**/auth/v1/logout**', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'unexpected_failure', msg: 'fixture unavailable' }),
    }),
  );
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  const notice = page.getByRole('alert');
  await expect(notice).toContainText(
    'You are signed out on this device, but the server could not confirm sign-out.',
  );
  expect(await page.evaluate(() => localStorage.getItem('sb-127-auth-token'))).toBeNull();
  const bounds = await notice.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await page.screenshot({ path: '.cache/sign-out-warning-320.png' });
  await page.getByRole('button', { name: 'Dismiss sign-out message' }).click();
  await expect(notice).toHaveCount(0);
});

test('a replaced sign-out error never resurfaces after the newer session ends', async ({
  page,
  context,
}) => {
  const replacementSession = playerSession('password', {
    sessionId: '66666666-6666-4666-8666-666666666666',
  });
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
  let releaseLogout: () => void = () => undefined;
  const heldLogout = new Promise<void>((resolve) => {
    releaseLogout = resolve;
  });
  let logoutStarted: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    logoutStarted = resolve;
  });
  await page.route('**/auth/v1/logout**', async (route) => {
    logoutStarted();
    await heldLogout;
    await route.fulfill({ status: 204, body: '' });
  });
  await context.route('**/__auth-state-test', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><body>Auth state fixture</body>',
    }),
  );

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await started;
  const second = await context.newPage();
  await second.goto('/__auth-state-test');
  await second.evaluate(
    ({ storageKey, session }) => localStorage.setItem(storageKey, JSON.stringify(session)),
    { storageKey: 'sb-127-auth-token', session: replacementSession },
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('sb-127-auth-token') ?? '{}').access_token,
      ),
    )
    .toBe(replacementSession.access_token);
  releaseLogout();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await second.evaluate((storageKey) => localStorage.removeItem(storageKey), 'sb-127-auth-token');

  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('operator can retry temporary assignment verification failure without signing in again', async ({
  page,
}) => {
  await useOperatorPasswordSession(page, []);
  let failLookup = true;
  let passwordRequests = 0;
  await page.route('**/auth/v1/token**', (route) => {
    passwordRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(passwordSession('aal1', [])),
    });
  });
  await page.route('**/v1/auth/session', (route) =>
    route.fulfill({
      status: failLookup ? 503 : 200,
      contentType: 'application/json',
      body: JSON.stringify(
        failLookup
          ? { error: { code: 'AUTH_UNAVAILABLE', requestId: 'fixture' } }
          : {
              authUserId: operatorUserId,
              email: 'operator@example.test',
              emailVerified: true,
              sessionId: operatorSessionId,
              aal: 'aal1',
              applicationRole: 'operator',
            },
      ),
    }),
  );
  await page.goto(OPERATOR_PATH);
  await expect(
    page.getByRole('heading', { name: 'Operator verification unavailable.' }),
  ).toBeVisible();
  failLookup = false;
  await page.getByRole('button', { name: 'Retry verification' }).click({ timeout: 1_000 });
  await expect(page.getByRole('heading', { name: 'Add an authenticator.' })).toBeVisible();
  expect(passwordRequests).toBe(0);
});

for (const { recovery, sameUser } of [
  { recovery: false, sameUser: false },
  { recovery: true, sameUser: false },
  { recovery: false, sameUser: true },
]) {
  test(`${recovery ? 'recovery' : 'operator'} MFA cannot replace a newer ${sameUser ? 'same-user ' : ''}login in another tab`, async ({
    page,
    context,
  }) => {
    const factors: TestFactor[] = [
      {
        id: operatorFactorId,
        status: 'verified',
        factor_type: 'totp',
        friendly_name: 'Test authenticator',
        created_at: '2026-09-13T12:00:00.000Z',
        updated_at: '2026-09-13T12:00:00.000Z',
      },
    ];
    const sessionA = {
      ...passwordSession('aal1', factors),
      access_token: accessToken('aal1', recovery ? 'recovery' : 'password'),
    };
    const sessionB = sameUser
      ? {
          ...passwordSession('aal1', factors),
          access_token: accessToken('aal1', 'password', playerSessionId),
          refresh_token: 'fixture-new-same-user-login',
        }
      : playerSession('password');
    const emailB = sameUser ? 'operator@example.test' : 'player@example.test';
    await context.route('**/v1/auth/config', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          supabaseUrl: 'http://127.0.0.1:5173',
          supabasePublishableKey: 'sb_publishable_browser_fixture',
        }),
      }),
    );
    await context.route('**/auth/v1/user', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          !sameUser && route.request().headers().authorization === `Bearer ${sessionB.access_token}`
            ? playerUser()
            : operatorUser(factors),
        ),
      }),
    );
    await context.route('**/auth/v1/token**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(sessionB),
      }),
    );
    await context.route('**/v1/auth/session', (route) => {
      const isB = route.request().headers().authorization === `Bearer ${sessionB.access_token}`;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authUserId: isB && !sameUser ? playerUserId : operatorUserId,
          email: isB ? emailB : 'operator@example.test',
          emailVerified: true,
          sessionId: isB ? playerSessionId : operatorSessionId,
          aal: 'aal1',
          applicationRole: isB && !sameUser ? 'player' : 'operator',
        }),
      });
    });
    await context.route(`**/auth/v1/factors/${operatorFactorId}/challenge`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'deferred-challenge', type: 'totp', expires_at: 2_000_000_000 }),
      }),
    );
    let releaseVerification: () => void = () => undefined;
    const heldVerification = new Promise<void>((resolveHeld) => {
      releaseVerification = resolveHeld;
    });
    let verificationStarted: () => void = () => undefined;
    const started = new Promise<void>((resolveStarted) => {
      verificationStarted = resolveStarted;
    });
    let completedVerification: () => void = () => undefined;
    const completed = new Promise<void>((resolveCompleted) => {
      completedVerification = resolveCompleted;
    });
    await context.route(`**/auth/v1/factors/${operatorFactorId}/verify`, async (route) => {
      verificationStarted();
      await heldVerification;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...passwordSession('aal2', factors),
          access_token: accessToken('aal2', recovery ? 'recovery' : 'password'),
        }),
      });
      completedVerification();
    });
    await context.route('**/__auth-concurrency-test', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><body>Test login client</body>',
      }),
    );
    // Seed from an inert same-origin page: a loaded player app would legitimately route the
    // operator session to its private entry itself and race this navigation.
    await page.goto('/__auth-concurrency-test');
    await page.evaluate(
      (session) => localStorage.setItem('sb-127-auth-token', JSON.stringify(session)),
      sessionA,
    );
    await page.goto(recovery ? '/account/recovery' : OPERATOR_PATH);
    await page.getByLabel(recovery ? 'Authenticator code' : 'Six-digit code').fill('123456');
    await page.getByRole('button', { name: 'Verify authenticator' }).click();
    await started;

    // The second page uses the real public client and SDK, without a second app's
    // automatic role redirect preventing the deliberately overlapping sign-in.
    const second = await context.newPage();
    await second.goto('/__auth-concurrency-test');
    const moduleUrl = `/@fs/${resolve('packages/client/src/auth.ts').replaceAll('\\', '/')}`;
    await second.evaluate(
      async ({ url, email }) => {
        const client = (await import(url)) as typeof import('../../packages/client/src/auth');
        const controller = await client.createBrowserAuthController();
        await controller.ready();
        controller.subscribe(() => {
          document.body.textContent = controller.getSnapshot().user?.email ?? 'Signed out';
        });
        await controller.signIn(email, 'long-enough-password');
      },
      { url: moduleUrl, email: emailB },
    );
    await expect(second.locator('body')).toHaveText(emailB);
    await expect
      .poll(async () => {
        try {
          return await page.evaluate(
            () => JSON.parse(localStorage.getItem('sb-127-auth-token') ?? '{}').access_token,
          );
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.includes(
              'Execution context was destroyed, most likely because of a navigation',
            )
          ) {
            return undefined;
          }
          throw error;
        }
      })
      .toBe(sessionB.access_token);
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
    await expect(second.locator('body')).toHaveText(emailB);
    for (const tab of [page, second]) {
      const result = await tab.evaluate(() => ({
        current: JSON.parse(localStorage.getItem('sb-127-auth-token') ?? '{}').access_token,
        writes: (window as unknown as { authWrites: string[] }).authWrites.map(
          (value) => JSON.parse(value).access_token as string,
        ),
      }));
      expect(result.current).toBe(sessionB.access_token);
      expect(result.writes.every((token) => token === sessionB.access_token)).toBe(true);
    }
    if (recovery) await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
    else if (sameUser)
      await expect(
        page.getByRole('heading', { name: 'Enter your authenticator code.' }),
      ).toBeVisible();
    else {
      await expect(page).toHaveURL('http://127.0.0.1:5173/');
      await expect(page.getByText('OPERATOR WORKSPACE')).toHaveCount(0);
    }
  });
}

test('unassigned direct operator visit returns to player before authenticator enrollment', async ({
  page,
}) => {
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
  await page.goto(OPERATOR_PATH);
  await expect(page).toHaveURL('http://127.0.0.1:5173/');
  await expect(page.getByText('OPERATOR WORKSPACE')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Add an authenticator.' })).toHaveCount(0);
  expect(enrollmentRequests).toBe(0);
});

test('recovery password update and global logout stay bound to the originating account across tabs', async ({
  page,
  context,
}) => {
  const sessionA = playerSession('recovery');
  const sessionB = passwordSession('aal1', []);
  const gate = () => {
    let release: () => void = () => undefined;
    const promise = new Promise<void>((resolveGate) => {
      release = resolveGate;
    });
    return { promise, release };
  };
  const updateStarted = gate();
  const updateResponse = gate();
  const logoutStarted = gate();
  const logoutResponse = gate();
  const logoutCompleted = gate();
  const requests: Array<{ action: string; authorization: string | undefined }> = [];
  await context.route('**/v1/auth/config', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        supabaseUrl: 'http://127.0.0.1:5173',
        supabasePublishableKey: 'sb_publishable_browser_fixture',
      }),
    }),
  );
  await context.route('**/auth/v1/user', async (route) => {
    if (route.request().method() === 'PUT') {
      requests.push({ action: 'update', authorization: route.request().headers().authorization });
      updateStarted.release();
      await updateResponse.promise;
    }
    const isB = route.request().headers().authorization === `Bearer ${sessionB.access_token}`;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isB ? operatorUser([]) : playerUser()),
    });
  });
  await context.route('**/auth/v1/logout**', async (route) => {
    requests.push({ action: 'logout', authorization: route.request().headers().authorization });
    expect(new URL(route.request().url()).searchParams.get('scope')).toBe('global');
    logoutStarted.release();
    await logoutResponse.promise;
    await route.fulfill({ status: 204, body: '' });
    logoutCompleted.release();
  });
  await context.route('**/auth/v1/token**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionB) }),
  );
  await context.route('**/v1/auth/session', (route) =>
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
  await context.route('**/__auth-concurrency-test', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><body>Test login client</body>',
    }),
  );
  await page.goto('/account/sign-in');
  await page.evaluate(
    (session) => localStorage.setItem('sb-127-auth-token', JSON.stringify(session)),
    sessionA,
  );
  await page.goto('/account/recovery');
  await page.getByLabel('New password', { exact: true }).fill('new-long-enough-password');
  await page.getByLabel('Confirm new password').fill('new-long-enough-password');
  await page.getByRole('button', { name: 'Update password' }).click();
  await updateStarted.promise;
  const second = await context.newPage();
  await second.goto('/__auth-concurrency-test');
  await second.evaluate(
    async (url) => {
      const client = (await import(url)) as typeof import('../../packages/client/src/auth');
      const controller = await client.createBrowserAuthController();
      await controller.ready();
      controller.subscribe(() => {
        document.body.textContent = controller.getSnapshot().user?.email ?? 'Signed out';
      });
      await controller.signIn('operator@example.test', 'long-enough-password');
    },
    `/@fs/${resolve('packages/client/src/auth.ts').replaceAll('\\', '/')}`,
  );
  await expect(second.locator('body')).toHaveText('operator@example.test');
  updateResponse.release();
  await logoutStarted.promise;
  expect(requests).toEqual([
    { action: 'update', authorization: `Bearer ${sessionA.access_token}` },
    { action: 'logout', authorization: `Bearer ${sessionA.access_token}` },
  ]);
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('sb-127-auth-token') ?? '{}').access_token,
      ),
    )
    .toBe(sessionB.access_token);
  logoutResponse.release();
  await logoutCompleted.promise;
  await expect(page.getByRole('button', { name: 'Working…' })).toHaveCount(0);
  await expect(second.locator('body')).toHaveText('operator@example.test');
  await expect(
    page.getByText('Your password was updated. Sign in with your new password.'),
  ).toHaveCount(0);
  for (const tab of [page, second]) {
    expect(
      await tab.evaluate(
        () => JSON.parse(localStorage.getItem('sb-127-auth-token') ?? '{}').access_token,
      ),
    ).toBe(sessionB.access_token);
  }
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

test('anonymous operator entry returns to main-site sign-in while endpoint stays locked', async ({
  page,
  request,
}) => {
  await useControlledAuth(page);
  await page.goto(OPERATOR_PATH);
  await expect(page).toHaveURL('http://127.0.0.1:5173/account/sign-in');
  await expect(page.getByText('OPERATOR WORKSPACE')).toHaveCount(0);
  const response = await request.post('http://127.0.0.1:3001/v1/operator/feature-controls', {
    data: { commerce: true },
  });
  expect(response.status()).toBe(401);
});

test('legacy operator URLs discard query and fragment credentials', async ({ page }) => {
  await useControlledAuth(page);
  const bridgeOutput = resolve('dist/player/_legacy/operator');
  const bridgeHtml = readFileSync(resolve(bridgeOutput, 'index.html'), 'utf8');
  const bridgeScript = readFileSync(resolve(bridgeOutput, 'redirect.js'), 'utf8');
  await page.route('**/operator/callback**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: bridgeHtml }),
  );
  await page.route('**/_legacy/operator/redirect.js', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: bridgeScript }),
  );
  await page.goto('/operator/callback?access_token=legacy-query#refresh_token=legacy-fragment');
  await expect(page).toHaveURL('http://127.0.0.1:5173/account/sign-in');
  await expect(page.getByLabel('Operator email')).toHaveCount(0);

  const retiredOutput = resolve('dist/operator');
  const retiredHtml = readFileSync(resolve(retiredOutput, 'index.html'), 'utf8');
  const retiredScript = readFileSync(resolve(retiredOutput, 'redirect.js'), 'utf8');
  await page.route('http://127.0.0.1:5174/callback**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: retiredHtml }),
  );
  await page.route('http://127.0.0.1:5174/redirect.js', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: retiredScript }),
  );
  await page.route('https://project-gate-player.vercel.app/account/sign-in', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><body>Sign in</body>',
    }),
  );
  await page.goto(
    'http://127.0.0.1:5174/callback?access_token=legacy-query#refresh_token=legacy-fragment',
  );
  await expect(page).toHaveURL('https://project-gate-player.vercel.app/account/sign-in');
  await expect(page.getByLabel('Operator email')).toHaveCount(0);
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
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByLabel('Confirm password').fill('short');
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
  await page.getByLabel('Password', { exact: true }).fill('long-enough-password');
  await page.getByLabel('Confirm password').fill('long-enough-password');
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

test('replacing a recovery session clears password fields and stale errors', async ({
  page,
  context,
}) => {
  const replacementSession = playerSession('recovery', {
    sessionId: '66666666-6666-4666-8666-666666666666',
  });
  await restorePlayerSession(page, 'recovery');
  await page.getByLabel('New password', { exact: true }).fill('password-for-recovery-a');
  await page.getByLabel('Confirm new password').fill('different-password-for-a');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByText('The password confirmation does not match.')).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill('password-for-recovery-a');
  await page.getByLabel('Confirm new password').fill('password-for-recovery-a');
  await context.route('**/__auth-state-test', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><body>Auth state fixture</body>',
    }),
  );
  const second = await context.newPage();
  await second.goto('/__auth-state-test');
  await second.evaluate(
    ({ storageKey, session }) => localStorage.setItem(storageKey, JSON.stringify(session)),
    { storageKey: 'sb-127-auth-token', session: replacementSession },
  );

  await expect(page.getByRole('heading', { name: 'Choose a new password.' })).toBeVisible();
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Confirm new password')).toHaveValue('');
  await expect(page.getByText('The password confirmation does not match.')).toHaveCount(0);
});

test('replacing a recovery session clears the authenticator code', async ({ page, context }) => {
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
  const replacementSession = playerSession('recovery', {
    factors,
    sessionId: '66666666-6666-4666-8666-666666666666',
  });
  await restorePlayerSession(page, 'recovery', { factors });
  await page.getByLabel('Authenticator code').fill('123456');
  await context.route('**/__auth-state-test', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><body>Auth state fixture</body>',
    }),
  );
  const second = await context.newPage();
  await second.goto('/__auth-state-test');
  await second.evaluate(
    ({ storageKey, session }) => localStorage.setItem(storageKey, JSON.stringify(session)),
    { storageKey: 'sb-127-auth-token', session: replacementSession },
  );

  await expect(
    page.getByRole('heading', { name: 'Authenticator verification required.' }),
  ).toBeVisible();
  await expect(page.getByLabel('Authenticator code')).toHaveValue('');
});

test('entering recovery clears a stale recovery-request notice', async ({ page, context }) => {
  const recoverySession = playerSession('recovery', {
    sessionId: '66666666-6666-4666-8666-666666666666',
  });
  await useControlledAuth(page);
  await page.route('**/auth/v1/recover**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(playerUser()),
    }),
  );
  await page.goto('/account/recovery');
  await page.getByLabel('Email address').fill('player@example.test');
  await page.getByRole('button', { name: 'Send recovery link' }).click();
  await expect(
    page.getByText('If the account exists, a recovery link is on its way.'),
  ).toBeVisible();
  await context.route('**/__auth-state-test', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><body>Auth state fixture</body>',
    }),
  );
  const second = await context.newPage();
  await second.goto('/__auth-state-test');
  await second.evaluate(
    ({ storageKey, session }) => localStorage.setItem(storageKey, JSON.stringify(session)),
    { storageKey: 'sb-127-auth-token', session: recoverySession },
  );

  await expect(page.getByRole('heading', { name: 'Choose a new password.' })).toBeVisible();
  await expect(page.getByText('If the account exists, a recovery link is on its way.')).toHaveCount(
    0,
  );
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

test('anonymous operator visits use main-site sign-in without exposing an operator form', async ({
  page,
}) => {
  await useControlledAuth(page);
  await page.goto(OPERATOR_PATH);
  await expect(page).toHaveURL('http://127.0.0.1:5173/account/sign-in');
  await expect(page.getByRole('heading', { name: 'Sign in to your account.' })).toBeVisible();
  await expect(page.getByLabel('Operator email')).toHaveCount(0);
  await expect(page.getByText('Operator session authorized.')).toHaveCount(0);
});

for (const method of ['recovery', 'otp']) {
  test(`operator client rejects ${method} sessions before entering the MFA flow`, async ({
    page,
  }) => {
    await useControlledAuth(page);
    await page.route('**/auth/v1/user', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(operatorUser([])),
      }),
    );
    await page.route('**/__auth-state-test', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><body>Auth state fixture</body>',
      }),
    );
    await page.goto('/__auth-state-test');
    await page.evaluate(
      ({ storageKey, session }) => localStorage.setItem(storageKey, JSON.stringify(session)),
      { storageKey: 'sb-127-auth-token', session: operatorRecoverySession(method) },
    );
    await page.goto(OPERATOR_PATH);

    await expect(page).toHaveURL(
      `http://127.0.0.1:5173${method === 'recovery' ? '/account/recovery' : '/account/sign-in'}`,
    );
    await expect(page.getByText('OPERATOR WORKSPACE')).toHaveCount(0);
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
  await page.goto(OPERATOR_PATH);
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

test('operator MFA returns an unprovisioned AAL2 identity to the player app', async ({ page }) => {
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
  await page.goto(OPERATOR_PATH);
  await expect(page.getByRole('heading', { name: 'Enter your authenticator code.' })).toBeVisible();
  await expect(page.getByRole('img', { name: /QR/i })).toHaveCount(0);
  await expect(page.getByText('JBSWY3DPEHPK3PXP')).toHaveCount(0);
  await page.getByLabel('Six-digit code').fill('123456');
  await page.getByRole('button', { name: 'Verify authenticator' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:5173/');
  await expect(page.getByText('OPERATOR WORKSPACE')).toHaveCount(0);
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
  await page.goto(OPERATOR_PATH);
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

test('operator partial sign-out reports provider failure after local credentials clear', async ({
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
  await page.route('**/auth/v1/logout**', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"msg":"Provider unavailable"}',
    }),
  );
  await page.goto(OPERATOR_PATH);
  await expect(page.getByRole('heading', { name: 'Enter your authenticator code.' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Operator access denied.' })).toBeVisible();
  await expect(
    page.getByText(
      'This browser session was cleared, but provider sign-out could not be confirmed. Sign in again and retry if needed.',
    ),
  ).toBeVisible();
  await expect(page).toHaveURL(`http://127.0.0.1:5173${OPERATOR_PATH}`);
  await expect(page.getByText('OPERATOR WORKSPACE')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('sb-127-auth-token')))
    .toBeNull();
  await page.getByRole('button', { name: 'Return to sign in' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:5173/account/sign-in');
});
