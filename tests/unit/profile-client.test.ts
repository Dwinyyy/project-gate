import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../../packages/client/src/profile.js';
import * as contracts from '../../packages/contracts/src/profile.js';

const id = '11111111-1111-4111-8111-111111111111';
const operationId = '22222222-2222-4222-8222-222222222222';
const timestamp = '2026-10-02T12:00:00.000Z';
const secret = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const revision = '9007199254740993';
const card = { schemaVersion: 1, displayAlias: 'Aster', identityLabel: 'Civilian' };
const appearance = {
  catalogVersion: 1,
  presetId: 'portrait-01',
  skinToneId: 'tone-01',
  hairStyleId: 'curly',
  hairColorId: 'black',
};
const invitation = {
  invitationId: id,
  scope: 'profile.view',
  issuedAt: timestamp,
  expiresAt: '2026-10-02T12:10:00.000Z',
};
const owner = {
  schemaVersion: 1,
  ruleVersion: 'civilian-profile-v1',
  mode: 'active',
  status: 'available',
  profile: {
    characterId: id,
    characterRevision: revision,
    disclosureRevision: '0',
    visibility: 'private',
    showFictionalAvatar: false,
    showRegistrationDate: false,
    publicReference: null,
    preview: card,
    invitation: null,
  },
  controls: {
    canUpdate: true,
    canIssue: false,
    canRevoke: false,
    canWithdraw: true,
    sharingAvailable: false,
  },
};
const receipt = {
  operationId,
  operation: 'profile.update',
  ruleVersion: 'civilian-profile-v1',
  committedAt: timestamp,
  subject: 'character',
  affectedProfileCount: 1,
  character: { characterId: id, characterRevision: revision, disclosureRevision: '1' },
  invitation: null,
};
const mutation = { schemaVersion: 1, receipt, replayed: false, current: owner };
const issued = {
  ...mutation,
  receipt: { ...receipt, operation: 'profile.invitation.generate', invitation },
  tokenDelivery: { status: 'delivered', token: secret },
};
const withdraw = {
  ...mutation,
  receipt: {
    ...receipt,
    operation: 'profile.disclosure.withdraw',
    subject: 'account',
    affectedProfileCount: 2,
    character: null,
  },
};
const resolved = {
  schemaVersion: 1,
  profile: card,
  invitation: { scope: 'profile.view', expiresAt: invitation.expiresAt },
};
function reply(value: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(value), { status, ...(headers ? { headers } : {}) });
}
function serve(value: unknown, status = 200, headers?: HeadersInit) {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => reply(value, status, headers));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('profile contract and client', () => {
  it('omits_disabled_projection_fields and preserves decimal revisions', async () => {
    serve(owner);
    expect(await client.getMyProfile('access')).toEqual(owner);
    serve(card);
    expect(Object.keys(await client.getPublicProfile('access', id))).toEqual([
      'schemaVersion',
      'displayAlias',
      'identityLabel',
    ]);
    serve({ ...card, appearance, registrationDate: '2024-02-29' });
    await expect(client.getPublicProfile('access', id)).resolves.toMatchObject({
      registrationDate: '2024-02-29',
    });
    expect(contracts.ownerProfileResponseSchema).toBeDefined();
  });

  it.each([
    { ...owner, hidden: true },
    { ...owner, controls: { ...owner.controls, secret } },
    { ...owner, profile: { ...owner.profile, digest: secret } },
    { ...owner, profile: { ...owner.profile, preview: { ...card, hidden: true } } },
    {
      ...owner,
      profile: { ...owner.profile, invitation: { ...invitation, status: 'valid', token: secret } },
    },
    {
      ...owner,
      profile: {
        ...owner.profile,
        preview: { ...card, appearance: { ...appearance, hidden: true } },
      },
    },
  ])('rejects_unknown_nested_fields %#', async (value) => {
    serve(value);
    await expect(client.getMyProfile('access')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it.each([
    { ...owner, status: 'no_living_profile' },
    { ...owner, profile: null },
    { ...owner, mode: 'operator' },
    { ...owner, profile: { ...owner.profile, characterRevision: 9007199254740992 } },
    { ...owner, profile: { ...owner.profile, disclosureRevision: '01' } },
    { ...owner, profile: { ...owner.profile, publicReference: id } },
    {
      ...owner,
      profile: {
        ...owner.profile,
        visibility: 'public',
        publicReference: operationId.replace('-4222-', '-1222-'),
      },
    },
    { ...owner, profile: { ...owner.profile, preview: { ...card, identityLabel: 'Hunter' } } },
    { ...owner, profile: { ...owner.profile, preview: { ...card, appearance: null } } },
    { ...owner, profile: { ...owner.profile, preview: { ...card, registrationDate: null } } },
    ...['2026-02-29', '2024-02-30', '2026-10-02T12:00:00Z'].map((registrationDate) => ({
      ...owner,
      profile: { ...owner.profile, preview: { ...card, registrationDate } },
    })),
    {
      ...owner,
      profile: {
        ...owner.profile,
        invitation: { ...invitation, status: 'valid', issuedAt: '2026-02-30T12:00:00Z' },
      },
    },
  ])('rejects_invalid_discriminants_dates_revisions %#', async (value) => {
    serve(value);
    await expect(client.getMyProfile('access')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('accepts null unavailable owner profiles independently of withdrawal eligibility', async () => {
    for (const status of ['no_living_profile', 'unsupported_official_id']) {
      const value = { ...owner, status, profile: null };
      serve(value);
      await expect(client.getMyProfile('access')).resolves.toEqual(value);
    }
  });

  it('issue_replay_cannot_deliver_token', async () => {
    const input = {
      characterId: id,
      expectedRevision: revision,
      scope: 'profile.view',
      mode: 'generate',
    } as const;
    serve(issued);
    await expect(client.issueMyProfileInvitation('access', input, operationId)).resolves.toEqual(
      issued,
    );
    serve({ ...issued, replayed: true });
    await expect(
      client.issueMyProfileInvitation('access', input, operationId),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    const replay = { ...issued, replayed: true, tokenDelivery: { status: 'unavailable' } };
    serve(replay);
    await expect(client.issueMyProfileInvitation('access', input, operationId)).resolves.toEqual(
      replay,
    );
    for (const token of [secret + '=', secret.slice(0, -1) + 'B', 'short']) {
      serve({ ...issued, tokenDelivery: { status: 'delivered', token } });
      await expect(
        client.issueMyProfileInvitation('access', input, operationId),
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  });

  it('withdraw_receipt_has_no_historical_subject', async () => {
    serve(withdraw);
    await expect(
      client.withdrawMyProfileDisclosure('access', { scope: 'all-owned-profiles' }, operationId),
    ).resolves.toEqual(withdraw);
    for (const replacement of [
      { character: receipt.character },
      { invitation },
      { publicReference: id },
      { affectedProfileCount: -1 },
      { affectedProfileCount: 0.5 },
    ]) {
      serve({ ...withdraw, receipt: { ...withdraw.receipt, ...replacement } });
      await expect(
        client.withdrawMyProfileDisclosure('access', { scope: 'all-owned-profiles' }, operationId),
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  });

  it('uses_exact_paths_headers_bodies_and_abort', async () => {
    const controller = new AbortController();
    const signal = controller.signal;
    const input = {
      characterId: id,
      expectedRevision: revision,
      visibility: 'limited',
      showFictionalAvatar: false,
      showRegistrationDate: false,
    } as const;
    const cases = [
      {
        path: '/v1/me/profile',
        method: 'GET',
        body: undefined,
        response: owner,
        run: () => client.getMyProfile('access', signal),
        key: false,
      },
      {
        path: '/v1/me/profile',
        method: 'PUT',
        body: input,
        response: mutation,
        run: () =>
          client.updateMyProfile(
            'access',
            { ...input, hidden: 'drop' } as never,
            operationId,
            signal,
          ),
        key: true,
      },
      {
        path: '/v1/me/profile/invitations',
        method: 'POST',
        body: {
          characterId: id,
          expectedRevision: revision,
          scope: 'profile.view',
          mode: 'generate',
        },
        response: issued,
        run: () =>
          client.issueMyProfileInvitation(
            'access',
            {
              characterId: id,
              expectedRevision: revision,
              scope: 'profile.view',
              mode: 'generate',
              hidden: 'drop',
            } as never,
            operationId,
            signal,
          ),
        key: true,
      },
      {
        path: '/v1/me/profile/invitations/revoke',
        method: 'POST',
        body: { characterId: id, expectedRevision: revision },
        response: { ...mutation, receipt: { ...receipt, operation: 'profile.invitation.revoke' } },
        run: () =>
          client.revokeMyProfileInvitation(
            'access',
            { characterId: id, expectedRevision: revision, hidden: 'drop' } as never,
            operationId,
            signal,
          ),
        key: true,
      },
      {
        path: '/v1/me/profile/disclosure/withdraw',
        method: 'POST',
        body: { scope: 'all-owned-profiles' },
        response: withdraw,
        run: () =>
          client.withdrawMyProfileDisclosure(
            'access',
            { scope: 'all-owned-profiles', characterId: id } as never,
            operationId,
            signal,
          ),
        key: true,
      },
      {
        path: `/v1/profiles/${id}`,
        method: 'GET',
        body: undefined,
        response: card,
        run: () => client.getPublicProfile('access', id, signal),
        key: false,
      },
      {
        path: '/v1/profile-invitations/resolve',
        method: 'POST',
        body: { token: secret },
        response: resolved,
        run: () =>
          client.resolveProfileInvitation(
            'access',
            { token: secret, hidden: 'drop' } as never,
            signal,
          ),
        key: false,
      },
    ];
    for (const test of cases) {
      const fetcher = serve(test.response);
      await test.run();
      const [path, init] = fetcher.mock.calls[0]!;
      expect(path).toBe(test.path);
      expect(init?.method).toBe(test.method);
      expect(init?.body).toBe(test.body ? JSON.stringify(test.body) : undefined);
      expect(init?.headers).toEqual({
        Accept: 'application/json',
        Authorization: 'Bearer access',
        ...(test.body ? { 'Content-Type': 'application/json' } : {}),
        ...(test.key ? { 'Idempotency-Key': operationId } : {}),
      });
      expect(init?.cache).toBe('no-store');
      expect(init?.signal).toBe(signal);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(String(path)).not.toContain(secret);
    }
  });

  it('safe_errors_and_retry_after', async () => {
    serve({ error: { code: 'RATE_LIMITED', requestId: id } }, 429, { 'Retry-After': '17' });
    await expect(client.getMyProfile('access')).rejects.toMatchObject({
      name: 'ProfileActionError',
      code: 'RATE_LIMITED',
      status: 429,
      requestId: id,
      retryAfter: 17,
      message: 'Profile information is unavailable. Try again shortly.',
    });
    serve({ error: { code: 'PRIVATE', requestId: id, message: secret } }, 503);
    await expect(client.getMyProfile('access')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      requestId: null,
    });
    serve({ error: { code: 'AUTH_REQUIRED', requestId: id } }, 401);
    await expect(client.getPublicProfile('access', id)).rejects.toMatchObject({
      message: 'Your session has expired. Sign in again.',
    });
    serve({ error: { code: 'SHARED_PROFILE_UNAVAILABLE', requestId: id } }, 404);
    await expect(
      client.resolveProfileInvitation('access', { token: secret }),
    ).rejects.toMatchObject({ message: 'Shared profile unavailable' });
    serve({ ...resolved, invitation: { ...resolved.invitation, digest: secret } });
    await expect(
      client.resolveProfileInvitation('access', { token: secret }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE', message: 'Shared profile unavailable' });
  });

  it('parses HTTP-date Retry-After and does not retry failed requests', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T12:00:00Z'));
    const fetcher = serve({ error: { code: 'RATE_LIMITED', requestId: id } }, 429, {
      'Retry-After': 'Fri, 02 Oct 2026 12:00:20 GMT',
    });
    await expect(client.getMyProfile('access')).rejects.toMatchObject({ retryAfter: 20 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('forwards even an invalid empty operation identity for server validation', async () => {
    const fetcher = serve(withdraw);
    await client.withdrawMyProfileDisclosure('access', { scope: 'all-owned-profiles' }, '');
    expect(fetcher.mock.calls[0]?.[1]?.headers).toHaveProperty('Idempotency-Key', '');
  });

  it('rejects references that could put untrusted fragments or queries in the URL', async () => {
    const fetcher = serve(card);
    for (const reference of [
      id + '?token=' + secret,
      id + '#' + secret,
      '../me',
      id.replace('-4111-', '-1111-'),
    ]) {
      await expect(client.getPublicProfile('access', reference)).rejects.toMatchObject({
        code: 'INVALID_REQUEST',
        message: 'Shared profile unavailable',
      });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses safe messages for network failure and malformed JSON', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error(secret));
    vi.stubGlobal('fetch', fetcher);
    await expect(client.getMyProfile('access')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      status: null,
      message: 'Profile information is unavailable. Try again shortly.',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(secret, { status: 200 })));
    await expect(
      client.resolveProfileInvitation('access', { token: secret }),
    ).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      status: 200,
      message: 'Shared profile unavailable',
    });
  });

  it.each([
    { ...mutation, receipt: { ...receipt, subject: 'account' } },
    { ...mutation, receipt: { ...receipt, affectedProfileCount: 2 } },
    { ...mutation, receipt: { ...receipt, invitation } },
    { ...mutation, receipt: { ...receipt, character: { ...receipt.character, alias: 'secret' } } },
    { ...mutation, receipt: { ...receipt, committedAt: '2026-10-02T24:00:00Z' } },
  ])('rejects incompatible or contaminated character receipts %#', async (value) => {
    serve(value);
    await expect(
      client.updateMyProfile(
        'access',
        {
          characterId: id,
          expectedRevision: revision,
          visibility: 'private',
          showFictionalAvatar: false,
          showRegistrationDate: false,
        },
        operationId,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('preserves cancellation during request and success/error body reads', async () => {
    const abort = new DOMException('Aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));
    await expect(client.getMyProfile('access')).rejects.toBe(abort);
    for (const status of [200, 503]) {
      const response = new Response(null, { status });
      vi.spyOn(response, 'json').mockRejectedValue(abort);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      await expect(client.getMyProfile('access')).rejects.toBe(abort);
    }
  });
});
