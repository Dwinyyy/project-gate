import { expect, test, type Page } from '@playwright/test';

const userId = '11111111-1111-4111-8111-111111111111';
const sessionId = '55555555-5555-4555-8555-555555555555';
const characterId = '77777777-7777-4777-8777-777777777777';
const invitationId = '88888888-8888-4888-8888-888888888888';
const publicReference = '44444444-4444-4444-8444-444444444444';
const operationId = '99999999-9999-4999-8999-999999999999';
const token = `${'A'.repeat(42)}E`;
const replacementToken = `${'B'.repeat(42)}E`;

const appearance = {
  catalogVersion: 1,
  presetId: 'portrait-02',
  skinToneId: 'tone-03',
  hairStyleId: 'curly',
  hairColorId: 'auburn',
} as const;

const user = {
  id: userId,
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

function encodedToken(id = sessionId) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    sub: userId,
    exp: 2_000_000_000,
    aal: 'aal1',
    session_id: id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    amr: [{ method: 'password', timestamp: 1_789_318_800 }],
  })}.fixture`;
}

function storedSession() {
  return {
    access_token: encodedToken(),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 2_000_000_000,
    refresh_token: 'fixture-profile-refresh',
    user,
  };
}

function preview(
  alias = 'Civilian Rowan',
  options: { showFictionalAvatar?: boolean; showRegistrationDate?: boolean } = {},
) {
  return {
    schemaVersion: 1,
    displayAlias: alias,
    identityLabel: 'Civilian',
    ...(options.showFictionalAvatar ? { appearance } : {}),
    ...(options.showRegistrationDate ? { registrationDate: '2026-09-28' } : {}),
  };
}

type Visibility = 'private' | 'limited' | 'public';
type InvitationStatus = 'valid' | 'expired' | 'revoked';

function ownerProfile({
  alias = 'Civilian Rowan',
  visibility = 'private' as Visibility,
  showFictionalAvatar = false,
  showRegistrationDate = false,
  invitation = null as null | { status: InvitationStatus; expiresAt: string },
  controls = {},
  revision = '7',
  mode = 'active',
} = {}) {
  return {
    schemaVersion: 1,
    ruleVersion: 'civilian-profile-v1',
    mode,
    status: 'available',
    profile: {
      characterId,
      characterRevision: revision,
      disclosureRevision: revision,
      visibility,
      showFictionalAvatar,
      showRegistrationDate,
      publicReference: visibility === 'public' ? publicReference : null,
      preview: preview(alias, { showFictionalAvatar, showRegistrationDate }),
      invitation: invitation
        ? {
            invitationId,
            scope: 'profile.view',
            issuedAt: '2026-10-04T03:00:00.000Z',
            expiresAt: invitation.expiresAt,
            status: invitation.status,
          }
        : null,
    },
    controls: {
      canUpdate: true,
      canIssue: visibility !== 'private',
      canRevoke: invitation?.status === 'valid',
      canWithdraw: true,
      sharingAvailable: true,
      ...controls,
    },
  };
}

function mutation<T>(current: T, operation = 'profile.update') {
  return {
    schemaVersion: 1,
    replayed: false,
    receipt: {
      operationId,
      operation,
      ruleVersion: 'civilian-profile-v1',
      committedAt: '2026-10-04T03:01:00.000Z',
      subject: operation === 'profile.disclosure.withdraw' ? 'account' : 'character',
      affectedProfileCount: operation === 'profile.disclosure.withdraw' ? 0 : 1,
      character:
        operation === 'profile.disclosure.withdraw'
          ? null
          : { characterId, characterRevision: '8', disclosureRevision: '8' },
      invitation: null,
    },
    current,
  };
}

function issued(current: ReturnType<typeof ownerProfile>, delivery: 'delivered' | 'unavailable') {
  const receipt = mutation(current, 'profile.invitation.generate').receipt;
  return {
    schemaVersion: 1,
    replayed: delivery === 'unavailable',
    receipt: {
      ...receipt,
      invitation: {
        invitationId,
        scope: 'profile.view',
        issuedAt: '2026-10-04T03:00:00.000Z',
        expiresAt: current.profile!.invitation!.expiresAt,
      },
    },
    current,
    tokenDelivery:
      delivery === 'delivered' ? { status: 'delivered', token } : { status: 'unavailable' },
  };
}

async function installPlayer(page: Page, options: { character?: boolean } = {}) {
  await page.addInitScript((session) => {
    localStorage.setItem('sb-127-auth-token', JSON.stringify(session));
  }, storedSession());
  await installAuthRoutes(page, options);
}

async function installAuthRoutes(page: Page, options: { character?: boolean } = {}) {
  await page.route('**/v1/auth/config', (route) =>
    route.fulfill({
      json: {
        supabaseUrl: 'http://127.0.0.1:5173',
        supabasePublishableKey: 'sb_publishable_profile_fixture',
      },
    }),
  );
  await page.route('**/auth/v1/user', (route) => route.fulfill({ json: user }));
  await page.route('**/v1/auth/session', (route) =>
    route.fulfill({
      json: {
        authUserId: userId,
        email: user.email,
        emailVerified: true,
        sessionId,
        aal: 'aal1',
        applicationRole: 'player',
      },
    }),
  );
  await page.route('**/v1/me', (route) =>
    route.fulfill({
      json: {
        schemaVersion: 3,
        mode: 'active',
        character:
          options.character === false
            ? null
            : {
                id: characterId,
                displayAlias: 'Civilian Rowan',
                appearance,
                lifeState: 'alive',
                awakeningState: 'unawakened',
                presenceState: 'sheltered',
                profileVisibility: 'private',
                revision: '7',
                createdAt: '2026-09-28T12:00:00.000Z',
              },
        creation:
          options.character === false
            ? { status: 'restricted', notBefore: null }
            : { status: 'occupied', notBefore: null },
      },
    }),
  );
}

test('owner card is voluntary and optional fields remain absent by default', async ({ page }) => {
  await installPlayer(page);
  await page.setViewportSize({ width: 390, height: 844 });
  let issues = 0;
  await page.route('**/v1/me/profile', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: ownerProfile() });
    issues += 1;
    return route.fulfill({ status: 500, json: {} });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Civilian Rowan', level: 1 })).toBeVisible();
  const idLink = page.getByRole('link', { name: 'System ID', exact: true });
  await expect(idLink).toBeVisible();
  const idLinkBounds = await idLink.boundingBox();
  expect(idLinkBounds).not.toBeNull();
  expect(idLinkBounds!.height).toBeGreaterThanOrEqual(44);
  await idLink.click();
  await expect(page).toHaveTitle('System ID · Hunter World');
  await expect(page.getByRole('button', { name: 'Show ID', exact: true })).toBeVisible();
  await page.screenshot({ path: '.cache/task26-system-id-settings-390x844.png', fullPage: true });
  expect(issues).toBe(0);
  await page.getByRole('button', { name: 'Show ID', exact: true }).click();
  const card = page.getByRole('dialog', { name: 'Civilian System ID' });
  await expect(card).toContainText('Civilian Rowan');
  await expect(card).toContainText('Civilian');
  await expect(card.getByRole('img', { name: /skin|hair/i })).toHaveCount(0);
  await expect(card.getByText('Registered', { exact: true })).toHaveCount(0);
  await expect(card.getByRole('img', { name: 'Temporary profile QR' })).toHaveCount(0);
  await card.getByRole('button', { name: 'Conceal ID' }).click();
  await expect(card).not.toBeVisible();
  expect(issues).toBe(0);
});

for (const character of [true, false]) {
  test(`compact owner header keeps 44px targets with Body ${character ? 'present' : 'absent'}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await installPlayer(page, { character });
    await page.goto('/');
    const systemId = page.getByRole('link', { name: 'System ID', exact: true });
    const signOut = page.getByRole('button', { name: 'Sign out', exact: true });
    await expect(systemId).toBeVisible();
    await expect(signOut).toBeVisible();
    for (const control of [systemId, signOut]) {
      const bounds = await control.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
    if (character) {
      const body = page.getByRole('button', { name: 'Body status' });
      await expect(body).toBeVisible();
      expect((await body.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    } else {
      await expect(page.getByRole('button', { name: 'Body status' })).toHaveCount(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await page.screenshot({
      path: `.cache/task5-r1-header-${character ? 'body' : 'no-body'}-320x568.png`,
      fullPage: true,
    });
  });
}

test('long_alias_small_viewports_remain_usable', async ({ page }) => {
  const alias = '界'.repeat(40);
  await installPlayer(page);
  await page.route('**/v1/me/profile', (route) => route.fulfill({ json: ownerProfile({ alias }) }));
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 440, height: 900 },
    { width: 640, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/identity');
    await page.getByRole('button', { name: 'Show ID', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Civilian System ID' });
    await expect(dialog.getByRole('heading', { name: alias })).toBeVisible();
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    expect(await dialog.evaluate((element) => getComputedStyle(element).animationName)).toBe(
      'none',
    );
    expect(
      await dialog
        .getByText('VERIFIED CURRENT VIEW', { exact: true })
        .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    ).toBeGreaterThanOrEqual(11);
    expect(
      await dialog
        .getByText('Civilian', { exact: true })
        .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    ).toBeGreaterThanOrEqual(13);
    await page.screenshot({
      path: `.cache/task26-system-id-card-${viewport.width}x${viewport.height}.png`,
      fullPage: true,
    });
    if (viewport.width === 320 || viewport.height === 390)
      await page.screenshot({
        path: `.cache/task5-r1-card-${viewport.width}x${viewport.height}.png`,
        fullPage: true,
      });
    const conceal = dialog.getByRole('button', { name: 'Conceal ID' });
    expect((await conceal.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await conceal.click();
  }
});

test('escape_back_conceal_restore_focus', async ({ page }) => {
  await installPlayer(page);
  await page.route('**/v1/me/profile', (route) => route.fulfill({ json: ownerProfile() }));
  await page.goto('/identity');
  const show = page.getByRole('button', { name: 'Show ID', exact: true });
  await show.click();
  const dialog = page.getByRole('dialog', { name: 'Civilian System ID' });
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(show).toBeFocused();
  await show.click();
  await page.goBack();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/identity$/);
  await expect(show).toBeFocused();
});

test('restricted_owner_can_stop_sharing', async ({ page }) => {
  await installPlayer(page);
  const restricted = ownerProfile({
    mode: 'restricted',
    visibility: 'public',
    controls: {
      canUpdate: false,
      canIssue: false,
      canRevoke: false,
      canWithdraw: true,
      sharingAvailable: false,
    },
  });
  let withdrawals = 0;
  await page.route('**/v1/me/profile', (route) => route.fulfill({ json: restricted }));
  await page.route('**/v1/me/profile/disclosure/withdraw', (route) => {
    withdrawals += 1;
    return route.fulfill({
      json: mutation(
        ownerProfile({
          controls: {
            canUpdate: false,
            canIssue: false,
            canRevoke: false,
            canWithdraw: true,
            sharingAvailable: false,
          },
          revision: '8',
        }),
        'profile.disclosure.withdraw',
      ),
    });
  });
  await page.goto('/identity');
  await expect(page.getByRole('button', { name: 'Save disclosure settings' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Stop sharing' }).click();
  await expect.poll(() => withdrawals).toBe(1);
  await expect(page.getByText('Sharing is off for every profile on this account.')).toBeVisible();
});

test('stale_draft_requires_deliberate_save', async ({ page }) => {
  await installPlayer(page);
  let current = ownerProfile();
  const saves: { key: string | undefined; body: Record<string, unknown> }[] = [];
  await page.route('**/v1/me/profile', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: current });
    saves.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postDataJSON(),
    });
    if (saves.length === 1) {
      current = ownerProfile({ visibility: 'limited', revision: '8' });
      return route.fulfill({
        status: 409,
        json: { error: { code: 'STALE_REVISION', requestId: 'fixture-stale' } },
      });
    }
    current = ownerProfile({ visibility: 'public', revision: '9' });
    return route.fulfill({ json: mutation(current) });
  });
  await page.goto('/identity');
  await page.getByLabel('Who can view this profile?').selectOption('public');
  await page.getByRole('button', { name: 'Save disclosure settings' }).click();
  await expect(page.getByText(/changed since this draft/i)).toBeVisible();
  expect(saves).toHaveLength(1);
  await page.getByRole('button', { name: 'Save disclosure settings' }).click();
  await expect.poll(() => saves.length).toBe(2);
  expect(saves[1]!.key).not.toBe(saves[0]!.key);
  expect(saves[1]!.body.visibility).toBe('public');
  expect(saves[1]!.body.expectedRevision).toBe('8');
});

test('settings failure and exact retry stay beside the save action', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    });
  });
  await installPlayer(page);
  await page.setViewportSize({ width: 390, height: 844 });
  let current = ownerProfile({ visibility: 'public' });
  const saves: { key: string | undefined; body: Record<string, unknown> }[] = [];
  await page.route('**/v1/me/profile', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: current });
    saves.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postDataJSON(),
    });
    if (saves.length === 1)
      return route.fulfill({
        status: 503,
        json: { error: { code: 'UNAVAILABLE', requestId: 'fixture-settings-retry' } },
      });
    current = ownerProfile({ visibility: 'limited', revision: '8' });
    return route.fulfill({ json: mutation(current) });
  });
  await page.goto('/identity');
  const settings = page
    .getByRole('heading', { name: 'Profile settings' })
    .locator('xpath=ancestor::section[1]');
  await page.getByLabel('Who can view this profile?').selectOption('limited');
  await settings.getByRole('button', { name: 'Save disclosure settings' }).click();
  await expect.poll(() => saves.length).toBe(1);
  await expect(settings.getByRole('alert')).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Retry exact request' })).toBeVisible();
  await expect(
    page
      .getByRole('heading', { name: 'Link and QR' })
      .locator('xpath=ancestor::section[1]')
      .getByRole('alert'),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Copy profile link' }).click();
  await expect(settings.getByRole('button', { name: 'Retry exact request' })).toBeVisible();
  await expect(
    page
      .getByRole('heading', { name: 'Link and QR' })
      .locator('xpath=ancestor::section[1]')
      .getByRole('status'),
  ).toContainText('Profile link copied.');
  await settings.getByRole('button', { name: 'Retry exact request' }).click();
  await expect.poll(() => saves.length).toBe(2);
  expect(saves[1]).toEqual(saves[0]);
  await expect(settings.getByRole('status')).toContainText('The exact request was confirmed.');
  await page.screenshot({
    path: '.cache/task5-r1-settings-feedback-390x844.png',
    fullPage: true,
  });
});

test('copy keeps a terminal save denial beside settings', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    });
  });
  await installPlayer(page);
  const current = ownerProfile({ visibility: 'public' });
  let saves = 0;
  await page.route('**/v1/me/profile', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: current });
    saves += 1;
    return route.fulfill({
      status: 403,
      json: { error: { code: 'PROFILE_UPDATE_FORBIDDEN', requestId: 'fixture-save-denial' } },
    });
  });
  await page.goto('/identity');
  const settings = page
    .getByRole('heading', { name: 'Profile settings' })
    .locator('xpath=ancestor::section[1]');
  const sharing = page
    .getByRole('heading', { name: 'Link and QR' })
    .locator('xpath=ancestor::section[1]');
  await page.getByLabel('Who can view this profile?').selectOption('limited');
  await settings.getByRole('button', { name: 'Save disclosure settings' }).click();
  await expect.poll(() => saves).toBe(1);
  await expect(settings.getByRole('alert')).toContainText(
    'Profile information is unavailable. Try again shortly.',
  );
  await expect(settings.getByRole('button', { name: 'Retry exact request' })).toHaveCount(0);

  await sharing.getByRole('button', { name: 'Copy profile link' }).click();

  await expect(settings.getByRole('alert')).toContainText(
    'Profile information is unavailable. Try again shortly.',
  );
  await expect(sharing.getByRole('alert')).toHaveCount(0);
  await expect(sharing.getByRole('status')).toContainText('Profile link copied.');
});

test('a held save denial stays in settings after an independent copy notice', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    });
  });
  await installPlayer(page);
  const current = ownerProfile({ visibility: 'public' });
  let releaseSave!: () => void;
  const heldSave = new Promise<void>((resolve) => (releaseSave = resolve));
  let markSaveStarted!: () => void;
  const saveStarted = new Promise<void>((resolve) => (markSaveStarted = resolve));
  await page.route('**/v1/me/profile', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: current });
    markSaveStarted();
    await heldSave;
    return route.fulfill({
      status: 403,
      json: { error: { code: 'PROFILE_UPDATE_FORBIDDEN', requestId: 'fixture-held-save-denial' } },
    });
  });
  await page.goto('/identity');
  const settings = page
    .getByRole('heading', { name: 'Profile settings' })
    .locator('xpath=ancestor::section[1]');
  const sharing = page
    .getByRole('heading', { name: 'Link and QR' })
    .locator('xpath=ancestor::section[1]');
  await page.getByLabel('Who can view this profile?').selectOption('limited');
  await settings.getByRole('button', { name: 'Save disclosure settings' }).click();
  await saveStarted;

  await sharing.getByRole('button', { name: 'Copy profile link' }).click();
  await expect(sharing.getByRole('status')).toContainText('Profile link copied.');
  releaseSave();

  await expect(settings.getByRole('alert')).toContainText(
    'Profile information is unavailable. Try again shortly.',
  );
  await expect(settings.getByRole('button', { name: 'Retry exact request' })).toHaveCount(0);
  await expect(sharing.getByRole('alert')).toHaveCount(0);
  await expect(sharing.getByRole('status')).toContainText('Profile link copied.');
});

test('clipboard denial exposes the current selectable and openable public URL', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')) },
    });
  });
  await installPlayer(page);
  let current = ownerProfile({ visibility: 'public' });
  await page.route('**/v1/me/profile', (route) => route.fulfill({ json: current }));
  await page.goto('/identity');
  await page.getByRole('button', { name: 'Copy profile link' }).click();
  const expectedUrl = `http://127.0.0.1:5173/profiles/${publicReference}`;
  await expect(page.getByRole('textbox', { name: 'Current public profile URL' })).toHaveValue(
    expectedUrl,
  );
  await expect(page.getByRole('link', { name: 'Open current public profile' })).toHaveAttribute(
    'href',
    expectedUrl,
  );
  current = ownerProfile({
    visibility: 'public',
    controls: { sharingAvailable: false },
    revision: '8',
  });
  await page.getByRole('button', { name: 'Check current profile' }).click();
  await expect(page.getByRole('textbox', { name: 'Current public profile URL' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open current public profile' })).toHaveCount(0);
});

test('receipt_current_does_not_replace_draft', async ({ page }) => {
  await installPlayer(page);
  let current = ownerProfile();
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/v1/me/profile', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: current });
    await held;
    current = ownerProfile({ visibility: 'limited', revision: '8' });
    return route.fulfill({ json: mutation(current) });
  });
  await page.goto('/identity');
  const select = page.getByLabel('Who can view this profile?');
  await select.selectOption('limited');
  const submitted = page.waitForRequest(
    (request) => request.method() === 'PUT' && request.url().endsWith('/v1/me/profile'),
  );
  await page.getByRole('button', { name: 'Save disclosure settings' }).click();
  await submitted;
  await select.selectOption('private');
  release();
  await expect(select).toHaveValue('private');
  await expect(page.getByText('Unsaved draft')).toBeVisible();
  await expect(page.getByText('Saved setting: Limited', { exact: true })).toBeVisible();
});

test('confirmed_expiry_hides_qr', async ({ page }) => {
  await installPlayer(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const future = '2099-10-04T03:10:00.000Z';
  let current = ownerProfile({ visibility: 'limited', revision: '8' });
  await page.route('**/v1/me/profile', (route) => route.fulfill({ json: current }));
  await page.route('**/v1/me/profile/invitations', (route) => {
    current = ownerProfile({
      visibility: 'limited',
      invitation: { status: 'valid', expiresAt: future },
      revision: '9',
    });
    return route.fulfill({ json: issued(current, 'delivered') });
  });
  await page.goto('/identity');
  await page.getByRole('button', { name: 'Generate QR' }).click();
  await page.getByRole('button', { name: 'Show ID', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Temporary profile QR' })).toBeVisible();
  await page.screenshot({ path: '.cache/task26-system-id-qr-390x844.png', fullPage: true });
  await page.getByRole('button', { name: 'Conceal ID' }).click();
  current = ownerProfile({
    visibility: 'limited',
    invitation: { status: 'expired', expiresAt: '2026-10-04T03:10:00.000Z' },
    revision: '9',
  });
  await page.getByRole('button', { name: 'Check current profile' }).click();
  await page.getByRole('button', { name: 'Show ID', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Temporary profile QR' })).toHaveCount(0);
  await expect(page.getByText(/server-confirmed invitation is expired/i)).toBeVisible();
});

test('anonymous_scan_continues_after_validated_signin', async ({ page }) => {
  await installAuthRoutes(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/auth/v1/token**', (route) => route.fulfill({ json: storedSession() }));
  let resolves = 0;
  await page.route('**/v1/profile-invitations/resolve', (route) => {
    resolves += 1;
    return route.fulfill({
      json: {
        schemaVersion: 1,
        profile: preview('Scanned Civilian'),
        invitation: { scope: 'profile.view', expiresAt: '2099-10-04T03:10:00.000Z' },
      },
    });
  });
  await page.goto(`/profile-invitation#token=${token}`);
  await expect(page).toHaveURL(/\/profile-invitation$/);
  await expect(
    page.getByRole('heading', { name: 'Sign in to view this shared profile.' }),
  ).toBeVisible();
  expect(resolves).toBe(0);
  await page.getByRole('link', { name: 'Sign in to continue' }).click();
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('long-enough-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/profile-invitation$/);
  await expect(page.getByRole('heading', { name: 'Scanned Civilian' })).toBeVisible();
  await page.screenshot({ path: '.cache/task26-shared-profile-390x844.png', fullPage: true });
  await expect.poll(() => resolves).toBe(1);
  expect(await page.content()).not.toContain(token);
  expect(
    await page.evaluate(
      () =>
        `${JSON.stringify(history.state)}${JSON.stringify(localStorage)}${JSON.stringify(sessionStorage)}`,
    ),
  ).not.toContain(token);
});

test('receiver denial is generic and can retry or paste a new link', async ({ page }) => {
  await installPlayer(page);
  let attempts = 0;
  await page.route('**/v1/profile-invitations/resolve', (route) => {
    attempts += 1;
    return route.fulfill({
      status: attempts === 1 ? 503 : 404,
      json: {
        error: {
          code: attempts === 1 ? 'UNAVAILABLE' : 'PROFILE_UNAVAILABLE',
          requestId: 'fixture-denial',
        },
      },
    });
  });
  await page.goto(`/profile-invitation#token=${token}`);
  await expect(page.getByRole('heading', { name: 'Shared profile unavailable' })).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  await expect(page.getByLabel('Paste profile link')).toBeVisible();
  await expect(page.getByText(/friend|party|trade/i)).toHaveCount(0);
});

test('token-free invitation landing honestly requests a rescan without resolving', async ({
  page,
}) => {
  await installPlayer(page);
  let resolves = 0;
  await page.route('**/v1/profile-invitations/resolve', (route) => {
    resolves += 1;
    return route.fulfill({ status: 500, json: {} });
  });
  await page.goto('/profile-invitation');
  await expect(
    page.getByRole('heading', { name: 'Rescan or paste a profile link.' }),
  ).toBeVisible();
  await expect(page.getByLabel('Paste profile link')).toBeVisible();
  expect(resolves).toBe(0);
});

test('receiver hides confirmed content offline and does not restore the stale result', async ({
  page,
  context,
}) => {
  await installPlayer(page);
  await page.route('**/v1/profile-invitations/resolve', (route) =>
    route.fulfill({
      json: {
        schemaVersion: 1,
        profile: preview('Offline Civilian'),
        invitation: { scope: 'profile.view', expiresAt: '2099-10-04T03:10:00.000Z' },
      },
    }),
  );
  await page.goto(`/profile-invitation#token=${token}`);
  await expect(page.getByRole('heading', { name: 'Offline Civilian' })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByRole('heading', { name: 'Offline Civilian' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Connection unavailable' })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole('heading', { name: 'Offline Civilian' })).toHaveCount(0);
  await expect(page.getByLabel('Paste profile link')).toHaveValue('');
});

test('a replacement scan wins over an older held request for the same reader', async ({ page }) => {
  await installPlayer(page);
  let releaseFirst!: () => void;
  let releaseSecond!: () => void;
  const firstHeld = new Promise<void>((resolve) => (releaseFirst = resolve));
  const secondHeld = new Promise<void>((resolve) => (releaseSecond = resolve));
  const requested: string[] = [];
  await page.route('**/v1/profile-invitations/resolve', async (route) => {
    const submitted = route.request().postDataJSON() as { token: string };
    requested.push(submitted.token);
    await (submitted.token === token ? firstHeld : secondHeld);
    try {
      await route.fulfill({
        json: {
          schemaVersion: 1,
          profile: preview(submitted.token === token ? 'First Scan' : 'Replacement Scan'),
          invitation: { scope: 'profile.view', expiresAt: '2099-10-04T03:10:00.000Z' },
        },
      });
    } catch {
      // Chromium may finish aborting the superseded request before its fixture is released.
    }
  });
  await page.goto(`/profile-invitation#token=${token}`);
  await expect(page.getByRole('heading', { name: 'Checking shared profile…' })).toBeVisible();
  await page
    .getByLabel('Paste profile link')
    .fill(`http://127.0.0.1:5173/profile-invitation#token=${replacementToken}`);
  await page.getByRole('button', { name: 'Open pasted link' }).click();
  await expect.poll(() => requested).toEqual([token, replacementToken]);
  releaseFirst();
  await expect(page.getByRole('heading', { name: 'First Scan' })).toHaveCount(0);
  releaseSecond();
  await expect(page.getByRole('heading', { name: 'Replacement Scan' })).toBeVisible();
  expect(await page.content()).not.toContain(replacementToken);
});

test('lost issued secret stays unavailable until a deliberate replacement', async ({ page }) => {
  await installPlayer(page);
  let current = ownerProfile({ visibility: 'limited', revision: '8' });
  const requests: { key: string | undefined; body: Record<string, unknown> }[] = [];
  await page.route('**/v1/me/profile', (route) => route.fulfill({ json: current }));
  await page.route('**/v1/me/profile/invitations', (route) => {
    requests.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postDataJSON(),
    });
    current = ownerProfile({
      visibility: 'limited',
      invitation: { status: 'valid', expiresAt: '2099-10-04T03:10:00.000Z' },
      revision: requests.length === 1 ? '9' : '10',
    });
    return route.fulfill({
      json: issued(current, requests.length === 1 ? 'unavailable' : 'delivered'),
    });
  });
  await page.goto('/identity');
  await page.getByRole('button', { name: 'Generate QR' }).click();
  await expect(page.getByText('QR issued; code unavailable on this device')).toBeVisible();
  await page.getByRole('button', { name: 'Show ID', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Temporary profile QR' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Conceal ID' }).click();
  await page.getByRole('button', { name: 'Replace QR' }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]!.key).not.toBe(requests[0]!.key);
  expect(requests[1]!.body).toMatchObject({ mode: 'replace', expectedRevision: '9' });
  await page.getByRole('button', { name: 'Show ID', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Temporary profile QR' })).toBeVisible();
});

test('read-only valid invitation metadata explains the lost code before replacement', async ({
  page,
}) => {
  await installPlayer(page);
  let current = ownerProfile({
    visibility: 'limited',
    invitation: { status: 'valid', expiresAt: '2099-10-04T03:10:00.000Z' },
    revision: '8',
  });
  const requests: { key: string | undefined; body: Record<string, unknown> }[] = [];
  await page.route('**/v1/me/profile', (route) => route.fulfill({ json: current }));
  await page.route('**/v1/me/profile/invitations', (route) => {
    requests.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postDataJSON(),
    });
    current = ownerProfile({
      visibility: 'limited',
      invitation: { status: 'valid', expiresAt: '2099-10-04T03:10:00.000Z' },
      revision: '9',
    });
    return route.fulfill({ json: issued(current, 'delivered') });
  });
  await page.goto('/identity');
  await expect(page.getByText('QR issued; code unavailable on this device')).toBeVisible();
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: 'Show ID', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Temporary profile QR' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Conceal ID' }).click();
  await page.getByRole('button', { name: 'Replace QR' }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]!.key).toMatch(/^[0-9a-f-]{36}$/);
  expect(requests[0]!.body).toMatchObject({ mode: 'replace', expectedRevision: '8' });
});

test('owner service and offline transitions hide stale card and never write automatically', async ({
  page,
  context,
}) => {
  await installPlayer(page);
  let unavailable = false;
  let writes = 0;
  await page.route('**/v1/me/profile', (route) => {
    if (route.request().method() !== 'GET') writes += 1;
    return unavailable
      ? route.fulfill({
          status: 503,
          json: { error: { code: 'UNAVAILABLE', requestId: 'fixture-owner-service' } },
        })
      : route.fulfill({ json: ownerProfile() });
  });
  await page.goto('/identity');
  await expect(page.getByRole('button', { name: 'Show ID', exact: true })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByRole('heading', { name: 'Connection unavailable' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show ID', exact: true })).toHaveCount(0);
  expect(writes).toBe(0);
  unavailable = true;
  await context.setOffline(false);
  await expect(page.getByRole('heading', { name: 'Profile service unavailable' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show ID', exact: true })).toHaveCount(0);
  expect(writes).toBe(0);
});

test('owner without a current card keeps historical stop-sharing access', async ({ page }) => {
  await installPlayer(page);
  let withdrawals = 0;
  let current = {
    schemaVersion: 1,
    ruleVersion: 'civilian-profile-v1',
    mode: 'observer',
    status: 'no_living_profile',
    profile: null,
    controls: {
      canUpdate: false,
      canIssue: false,
      canRevoke: false,
      canWithdraw: true,
      sharingAvailable: false,
    },
  };
  await page.route('**/v1/me/profile', (route) => route.fulfill({ json: current }));
  await page.route('**/v1/me/profile/disclosure/withdraw', (route) => {
    withdrawals += 1;
    current = {
      ...current,
      controls: { ...current.controls, canWithdraw: false },
    };
    return route.fulfill({ json: mutation(current, 'profile.disclosure.withdraw') });
  });
  await page.goto('/identity');
  await expect(
    page.getByRole('heading', { name: 'No living civilian profile is available.' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show ID', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Stop sharing' }).click();
  await expect.poll(() => withdrawals).toBe(1);
  await expect(page.getByText('Sharing is off for every profile on this account.')).toBeVisible();
  current = {
    ...current,
    mode: 'active',
    status: 'unsupported_official_id',
    controls: { ...current.controls, canWithdraw: true },
  };
  await page.getByRole('button', { name: 'Check current profile' }).click();
  await expect(
    page.getByRole('heading', { name: 'Official ID registration is not available yet.' }),
  ).toBeVisible();
  await expect(page.getByText(/does not invent a Hunter rank, class, credential/i)).toBeVisible();
});

test('no-card withdrawal failure exposes the exact retry without automatic replay', async ({
  page,
}) => {
  await installPlayer(page);
  const current = {
    schemaVersion: 1,
    ruleVersion: 'civilian-profile-v1',
    mode: 'observer',
    status: 'no_living_profile',
    profile: null,
    controls: {
      canUpdate: false,
      canIssue: false,
      canRevoke: false,
      canWithdraw: true,
      sharingAvailable: false,
    },
  };
  const requests: { key: string | undefined; body: Record<string, unknown> }[] = [];
  await page.route('**/v1/me/profile', (route) => route.fulfill({ json: current }));
  await page.route('**/v1/me/profile/disclosure/withdraw', (route) => {
    requests.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postDataJSON(),
    });
    if (requests.length === 1)
      return route.fulfill({
        status: 503,
        json: { error: { code: 'UNAVAILABLE', requestId: 'fixture-withdraw-retry' } },
      });
    return route.fulfill({ json: mutation(current, 'profile.disclosure.withdraw') });
  });
  await page.goto('/identity');
  await page.getByRole('button', { name: 'Stop sharing' }).click();
  await expect.poll(() => requests.length).toBe(1);
  await expect(page.getByRole('alert')).toBeVisible();
  const retry = page.getByRole('button', { name: 'Retry exact request' });
  await expect(retry).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]!.key).toMatch(/^[0-9a-f-]{36}$/);
  await retry.click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toEqual(requests[0]);
  const confirmed = page.getByText('The exact request was confirmed.', { exact: true });
  await expect(confirmed).toBeVisible();
  await expect(confirmed).toHaveAttribute('role', 'status');
});

test('a lost save keeps its exact retry after the confirmed profile becomes no-card', async ({
  page,
}) => {
  await installPlayer(page);
  const noCard = {
    schemaVersion: 1,
    ruleVersion: 'civilian-profile-v1',
    mode: 'observer',
    status: 'no_living_profile',
    profile: null,
    controls: {
      canUpdate: false,
      canIssue: false,
      canRevoke: false,
      canWithdraw: true,
      sharingAvailable: false,
    },
  };
  let current: ReturnType<typeof ownerProfile> | typeof noCard = ownerProfile({
    visibility: 'public',
  });
  const requests: { key: string | undefined; body: Record<string, unknown> }[] = [];
  await page.route('**/v1/me/profile', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: current });
    requests.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postDataJSON(),
    });
    if (requests.length === 1) {
      current = noCard;
      return route.fulfill({
        status: 503,
        json: { error: { code: 'UNAVAILABLE', requestId: 'fixture-save-no-card' } },
      });
    }
    const replay = mutation(current);
    return route.fulfill({
      json: {
        ...replay,
        replayed: true,
        receipt: { ...replay.receipt, operationId: requests[0]!.key },
      },
    });
  });
  await page.goto('/identity');
  await page.getByLabel('Who can view this profile?').selectOption('limited');
  await page.getByRole('button', { name: 'Save disclosure settings' }).click();
  await expect(
    page.getByRole('heading', { name: 'No living civilian profile is available.' }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toBeVisible();
  const retry = page.getByRole('button', { name: 'Retry exact request' });
  await expect(retry).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]!.key).toMatch(/^[0-9a-f-]{36}$/);
  await retry.click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toEqual(requests[0]);
  const confirmed = page.getByText('The exact request was confirmed.', { exact: true });
  await expect(confirmed).toBeVisible();
  await expect(confirmed).toHaveAttribute('role', 'status');
  await expect(page.getByRole('button', { name: 'Show ID', exact: true })).toHaveCount(0);
});
