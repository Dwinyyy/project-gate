import { expect, test, type Page } from '@playwright/test';
import { OPERATOR_PATH } from '@hunter-world/contracts';

const characterUserId = '11111111-1111-4111-8111-111111111111';
const characterSessionId = '55555555-5555-4555-8555-555555555555';
const characterId = '77777777-7777-4777-8777-777777777777';

function characterFixture(alias: string, awakeningState: 'unawakened' | 'awakened' = 'unawakened') {
  return {
    id: characterId,
    displayAlias: alias,
    appearance: {
      catalogVersion: 1,
      presetId: 'portrait-02',
      skinToneId: 'tone-03',
      hairStyleId: 'curly',
      hairColorId: 'auburn',
    },
    lifeState: 'alive',
    awakeningState,
    presenceState: 'sheltered',
    profileVisibility: 'private',
    revision: '1',
    createdAt: '2026-09-28T12:00:00.000Z',
  };
}

async function characterSession(page: Page) {
  const user = {
    id: characterUserId,
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
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const accessToken = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    sub: characterUserId,
    exp: 2_000_000_000,
    aal: 'aal1',
    session_id: characterSessionId,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    amr: [{ method: 'password', timestamp: 1_789_318_800 }],
  })}.fixture`;
  const storedSession = {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 2_000_000_000,
    refresh_token: 'fixture-character-refresh',
    user,
  };
  await page.addInitScript((session) => {
    localStorage.setItem('sb-127-auth-token', JSON.stringify(session));
  }, storedSession);
  await page.route('**/v1/auth/config', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        supabaseUrl: 'http://127.0.0.1:5173',
        supabasePublishableKey: 'sb_publishable_character_fixture',
      }),
    }),
  );
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(user),
    }),
  );
  await page.route('**/v1/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authUserId: characterUserId,
        email: user.email,
        emailVerified: true,
        sessionId: characterSessionId,
        aal: 'aal1',
        applicationRole: 'player',
      }),
    }),
  );
  return storedSession;
}

test('allowlisted player creates one visual identity and refresh recovers confirmed System and body status', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const authSession = await characterSession(page);
  let created = false;
  await page.route('**/v1/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        schemaVersion: 3,
        mode: created ? 'active' : 'onboarding',
        character: created ? characterFixture('Aster') : null,
        creation: { status: created ? 'occupied' : 'available', notBefore: null },
      }),
    }),
  );
  const operations: string[] = [];
  const submitted: { body: unknown; authorization: string }[] = [];
  await page.route('**/v1/characters', (route) => {
    submitted.push({
      body: route.request().postDataJSON(),
      authorization: route.request().headers().authorization ?? '',
    });
    operations.push(route.request().headers()['idempotency-key'] ?? '');
    created = true;
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        characterId,
        operationId: operations.at(-1),
        createdAt: '2026-09-28T12:00:00.000Z',
      }),
    });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Create your character/i })).toBeVisible();
  for (const [label, count] of [
    ['Base portrait', 4],
    ['Skin tone', 6],
    ['Hair style', 5],
    ['Hair color', 5],
  ] as const) {
    await expect(page.getByLabel(label, { exact: true }).locator('option')).toHaveCount(count);
  }
  await page.getByLabel('Character alias').fill('Aster');
  await page.getByLabel('Base portrait').selectOption('portrait-02');
  await page.getByLabel('Skin tone', { exact: true }).selectOption('tone-03');
  await page.getByLabel('Hair style').selectOption('curly');
  await page.getByLabel('Hair color').selectOption('auburn');
  await expect(page.getByRole('img', { name: /portrait.*curly.*auburn/i })).toBeVisible();
  await page.screenshot({ path: 'test-results/character-onboarding-390.png' });
  await page.getByRole('button', { name: 'Create character' }).dblclick();
  await expect(page.getByRole('heading', { name: 'Aster', level: 1 })).toBeVisible();
  expect(operations).toHaveLength(1);
  expect(submitted).toEqual([
    {
      body: { displayAlias: 'Aster', appearance: characterFixture('Aster').appearance },
      authorization: `Bearer ${authSession.access_token}`,
    },
  ]);
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter((key) => key.startsWith('hunter-character-attempt:')),
    ),
  ).toEqual([]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Aster', level: 1 })).toBeVisible();
  await page.screenshot({ path: 'test-results/character-overview-390.png' });
  await page.getByRole('button', { name: 'Body status' }).click();
  await expect(page.getByRole('dialog', { name: 'Body status' })).toBeVisible();
  await expect(page.getByText('Dormant', { exact: true })).toBeVisible();
  await expect(page.getByText('Not yet tracked')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/character-system-390.png' });
});

test('unavailable creation states do not offer submission and a short phone stays within the viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await characterSession(page);
  await page.route('**/v1/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        schemaVersion: 3,
        mode: 'onboarding',
        character: null,
        creation: { status: 'feature_disabled', notBefore: null },
      }),
    }),
  );
  await page.goto('/');
  await expect(page.getByText(/character creation is currently unavailable/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create character' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/character-disabled-320-short.png' });
});

for (const status of ['restricted', 'occupied', 'cooldown'] as const) {
  test(`creation ${status} explains the current denial without a create action`, async ({
    page,
  }) => {
    await characterSession(page);
    await page.route('**/v1/me', (route) =>
      route.fulfill({
        json: {
          schemaVersion: 3,
          mode: 'onboarding',
          character: null,
          creation: {
            status,
            notBefore: status === 'cooldown' ? '2026-10-01T12:00:00.000Z' : null,
          },
        },
      }),
    );
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Check current state' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create character' })).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText(
      status === 'restricted'
        ? 'cannot create'
        : status === 'occupied'
          ? 'already has a living character'
          : 'Earliest eligible time',
    );
  });
}

test('character service failure hides stale identity and allows an explicit read retry', async ({
  page,
}) => {
  await characterSession(page);
  let failed = true;
  await page.route('**/v1/me', (route) =>
    failed
      ? route.fulfill({
          status: 503,
          json: { error: { code: 'UNAVAILABLE', requestId: 'fixture' } },
        })
      : route.fulfill({
          json: {
            schemaVersion: 3,
            mode: 'active',
            character: characterFixture('Recovered'),
            creation: { status: 'occupied', notBefore: null },
          },
        }),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Character service unavailable' })).toBeVisible();
  failed = false;
  await page.getByRole('button', { name: 'Retry character check' }).click();
  await expect(page.getByRole('heading', { name: 'Recovered', level: 1 })).toBeVisible();
});

test('lost response reads state before explicit exact retry, retains draft across refresh, and edits use a new identity', async ({
  page,
}) => {
  await characterSession(page);
  let reads = 0;
  const requests: { key: string; body: unknown; reads: number }[] = [];
  await page.route('**/v1/me', (route) => {
    reads++;
    return route.fulfill({
      json: {
        schemaVersion: 3,
        mode: 'onboarding',
        character: null,
        creation: { status: 'available', notBefore: null },
      },
    });
  });
  await page.route('**/v1/characters', (route) => {
    requests.push({
      key: route.request().headers()['idempotency-key'] ?? '',
      body: route.request().postDataJSON(),
      reads,
    });
    return route.abort('failed');
  });
  await page.goto('/');
  await page.getByLabel('Character alias').fill('  Retry me  ');
  await page.getByLabel('Hair style').selectOption('coiled');
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry creation' })).toBeEnabled();
  expect(reads).toBeGreaterThan(requests[0]!.reads);
  await page.reload();
  await expect(page.getByLabel('Character alias')).toHaveValue('Retry me');
  await expect(page.getByLabel('Hair style')).toHaveValue('coiled');
  expect(requests).toHaveLength(1);
  await page.getByRole('button', { name: 'Retry creation' }).click();
  await expect(page.getByRole('button', { name: 'Retry creation' })).toBeEnabled();
  expect(requests[1]!.key).toBe(requests[0]!.key);
  expect(requests[1]!.body).toEqual(requests[0]!.body);
  await page.getByLabel('Character alias').fill('Edited');
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry creation' })).toBeEnabled();
  expect(requests[2]!.key).not.toBe(requests[0]!.key);
});

test('offline reconnect only reads confirmed state and never silently sends creation', async ({
  page,
  context,
}) => {
  await characterSession(page);
  let reads = 0;
  let posts = 0;
  await page.route('**/v1/me', (route) => {
    reads++;
    return route.fulfill({
      json: {
        schemaVersion: 3,
        mode: 'onboarding',
        character: null,
        creation: { status: 'available', notBefore: null },
      },
    });
  });
  await page.route('**/v1/characters', (route) => {
    posts++;
    return route.abort();
  });
  await page.goto('/');
  await page.getByLabel('Character alias').fill('Offline');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('offline');
  const before = reads;
  await context.setOffline(false);
  await expect.poll(() => reads).toBeGreaterThan(before);
  expect(posts).toBe(0);
  await expect(page.getByRole('button', { name: 'Create character', exact: true })).toBeEnabled();
});

test('late account A character response cannot display in B and signout clears private view', async ({
  page,
  context,
}) => {
  const sessionA = await characterSession(page);
  const userB = '22222222-2222-4222-8222-222222222222';
  const sessionB = {
    ...sessionA,
    user: { ...sessionA.user, id: userB, email: 'b@example.test' },
    access_token: sessionA.access_token.replace(
      sessionA.access_token.split('.')[1]!,
      Buffer.from(
        JSON.stringify({
          sub: userB,
          session_id: characterSessionId,
          exp: 2_000_000_000,
          aal: 'aal1',
          amr: [{ method: 'password', timestamp: 1_789_318_800 }],
        }),
      ).toString('base64url'),
    ),
  };
  let releaseA: () => void = () => {};
  let startedA: () => void = () => {};
  let completedA: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    releaseA = resolve;
  });
  const started = new Promise<void>((resolve) => {
    startedA = resolve;
  });
  const completed = new Promise<void>((resolve) => {
    completedA = resolve;
  });
  await page.route('**/v1/auth/session', (route) =>
    route.fulfill({
      json: {
        authUserId:
          route.request().headers().authorization === `Bearer ${sessionA.access_token}`
            ? characterUserId
            : userB,
        email: 'fixture@example.test',
        emailVerified: true,
        sessionId: characterSessionId,
        aal: 'aal1',
        applicationRole: 'player',
      },
    }),
  );
  await page.route('**/v1/me', async (route) => {
    const isA = route.request().headers().authorization === `Bearer ${sessionA.access_token}`;
    if (isA) {
      startedA();
      await held;
    }
    await route
      .fulfill({
        json: {
          schemaVersion: 3,
          mode: 'active',
          character: characterFixture(isA ? 'Private A' : 'Private B'),
          creation: { status: 'occupied', notBefore: null },
        },
      })
      .catch(() => {});
    if (isA) completedA();
  });
  await context.route('**/__switch-fixture', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body>Session fixture</body>' }),
  );
  await page.goto('/');
  await started;
  const other = await context.newPage();
  await other.goto('/__switch-fixture');
  await other.evaluate(
    (session) => localStorage.setItem('sb-127-auth-token', JSON.stringify(session)),
    sessionB,
  );
  await expect(page.getByRole('heading', { name: 'Private B', level: 1 })).toBeVisible();
  releaseA();
  await completed;
  await expect(page.getByText('Private A', { exact: true })).toHaveCount(0);
  await other.evaluate(() => localStorage.removeItem('sb-127-auth-token'));
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByText('Private B', { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter((key) => key.startsWith('hunter-character-attempt:')),
    ),
  ).toEqual([]);
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 420 },
  { width: 1440, height: 1000 },
]) {
  test(`body drawer traps focus, returns it, and fits ${viewport.width}x${viewport.height} with reduced motion`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await characterSession(page);
    await page.route('**/v1/me', (route) =>
      route.fulfill({
        json: {
          schemaVersion: 3,
          mode: 'incapacitated',
          character: {
            ...characterFixture('Read only', 'awakened'),
            lifeState: 'incapacitated',
            presenceState: 'committed',
          },
          creation: { status: 'occupied', notBefore: null },
        },
      }),
    );
    await page.goto('/map');
    const button = page.getByRole('button', { name: 'Body status', exact: true });
    await button.click();
    const drawer = page.getByRole('dialog', { name: 'Body status' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText('Unavailable', { exact: true })).toBeVisible();
    await expect(drawer.getByText('Incapacitated', { exact: true })).toBeVisible();
    await expect(drawer.getByText('Committed', { exact: true })).toBeVisible();
    await page.keyboard.press('Tab');
    expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Shift+Tab');
    expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    expect(
      await page.getByRole('main').evaluate((element) => getComputedStyle(element).overflowY),
    ).toBe('hidden');
    const box = (await drawer.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.height).toBeLessThanOrEqual(viewport.height);
    expect(await drawer.evaluate((element) => getComputedStyle(element).animationName)).toBe(
      'none',
    );
    await page.screenshot({
      path: `test-results/character-drawer-${viewport.width}-${viewport.height}.png`,
    });
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
    await expect(button).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
  });
}

test('a conflicting operation has a distinct safe message instead of retrying the conflicting key', async ({
  page,
}) => {
  await characterSession(page);
  await page.route('**/v1/me', (route) =>
    route.fulfill({
      json: {
        schemaVersion: 3,
        mode: 'onboarding',
        character: null,
        creation: { status: 'available', notBefore: null },
      },
    }),
  );
  await page.route('**/v1/characters', (route) =>
    route.fulfill({
      status: 409,
      json: { error: { code: 'OPERATION_CONFLICT', requestId: 'fixture' } },
    }),
  );
  await page.goto('/');
  await page.getByLabel('Character alias').fill('Conflict');
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('conflicts with an earlier draft');
  await expect(page.getByRole('button', { name: 'Retry creation' })).toHaveCount(0);
});

test('expired create session stops further submissions until the player signs in again', async ({
  page,
}) => {
  await characterSession(page);
  await page.route('**/v1/me', (route) =>
    route.fulfill({
      json: {
        schemaVersion: 3,
        mode: 'onboarding',
        character: null,
        creation: { status: 'available', notBefore: null },
      },
    }),
  );
  await page.route('**/v1/characters', (route) =>
    route.fulfill({
      status: 401,
      json: { error: { code: 'AUTH_REQUIRED', requestId: 'fixture' } },
    }),
  );
  await page.goto('/');
  await page.getByLabel('Character alias').fill('Expired');
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('session has expired');
  await expect(page.getByRole('button', { name: 'Create character', exact: true })).toBeDisabled();
});

test('token refresh retains retry identity but a replacement session clears the old private attempt', async ({
  page,
  context,
}) => {
  const sessionA = await characterSession(page);
  const newSessionId = '66666666-6666-4666-8666-666666666666';
  const oldStorageKey = `hunter-character-attempt:${characterUserId}:${characterSessionId}`;
  const refreshedToken = sessionA.access_token.replace(
    sessionA.access_token.split('.')[1]!,
    Buffer.from(
      JSON.stringify({
        sub: characterUserId,
        session_id: characterSessionId,
        exp: 2_000_000_001,
        aal: 'aal1',
        amr: [{ method: 'password', timestamp: 1_789_318_800 }],
      }),
    ).toString('base64url'),
  );
  const newToken = sessionA.access_token.replace(
    sessionA.access_token.split('.')[1]!,
    Buffer.from(
      JSON.stringify({
        sub: characterUserId,
        session_id: newSessionId,
        exp: 2_000_000_000,
        aal: 'aal1',
        amr: [{ method: 'password', timestamp: 1_789_318_800 }],
      }),
    ).toString('base64url'),
  );
  await page.route('**/v1/auth/session', (route) =>
    route.fulfill({
      json: {
        authUserId: characterUserId,
        email: sessionA.user.email,
        emailVerified: true,
        sessionId:
          route.request().headers().authorization === `Bearer ${newToken}`
            ? newSessionId
            : characterSessionId,
        aal: 'aal1',
        applicationRole: 'player',
      },
    }),
  );
  await page.route('**/v1/me', (route) =>
    route.fulfill({
      json: {
        schemaVersion: 3,
        mode: 'onboarding',
        character: null,
        creation: { status: 'available', notBefore: null },
      },
    }),
  );
  const operations: string[] = [];
  await page.route('**/v1/characters', (route) => {
    operations.push(route.request().headers()['idempotency-key'] ?? '');
    return route.abort('failed');
  });
  await page.goto('/');
  await page.getByLabel('Character alias').fill('Old session draft');
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry creation' })).toBeEnabled();
  await context.route('**/__session-fixture', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body>Session fixture</body>' }),
  );
  const other = await context.newPage();
  await other.goto('/__session-fixture');
  const refreshedRead = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/me') &&
      response.request().headers().authorization === `Bearer ${refreshedToken}`,
  );
  await other.evaluate(
    (session) => localStorage.setItem('sb-127-auth-token', JSON.stringify(session)),
    { ...sessionA, access_token: refreshedToken },
  );
  await refreshedRead;
  await expect(page.getByLabel('Character alias')).toHaveValue('Old session draft');
  await page.getByRole('button', { name: 'Retry creation' }).click();
  await expect(page.getByRole('button', { name: 'Retry creation' })).toBeEnabled();
  expect(operations).toHaveLength(2);
  expect(operations[1]).toBe(operations[0]);
  await other.evaluate(
    (session) => localStorage.setItem('sb-127-auth-token', JSON.stringify(session)),
    { ...sessionA, access_token: newToken },
  );
  await expect(page.getByLabel('Character alias')).toHaveValue('');
  expect(await page.evaluate((key) => sessionStorage.getItem(key), oldStorageKey)).toBeNull();
});

test('guests and operator sessions never request private character state', async ({ page }) => {
  const privateRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/v1\/(me|characters)$/.test(request.url())) privateRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  expect(privateRequests).toEqual([]);
  await characterSession(page);
  await page.route('**/v1/auth/session', (route) =>
    route.fulfill({
      json: {
        authUserId: characterUserId,
        email: 'operator@example.test',
        emailVerified: true,
        sessionId: characterSessionId,
        aal: 'aal1',
        applicationRole: 'operator',
      },
    }),
  );
  await page.goto('/');
  await expect(page).toHaveURL(new RegExp(OPERATOR_PATH));
  expect(privateRequests).toEqual([]);
});

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
