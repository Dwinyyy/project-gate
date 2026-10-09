import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import type {
  CivilianProfileResponse,
  IssueProfileInvitationResponse,
  OwnerProfileResponse,
  ProfileMutationResponse,
  ResolveProfileInvitationResponse,
} from '../../packages/contracts/src/profile.js';
import type {
  ProfileFailureKind,
  ProfileStore,
} from '../../packages/database/src/profile-disclosure.js';
import {
  createSupabaseAuthVerifier,
  type AuthIdentity,
  type AuthVerifier,
} from '../../packages/server/src/auth.js';
import { buildApp } from '../../apps/api/src/app.js';

const authUserId = '11111111-1111-4111-8111-111111111111';
const characterId = '22222222-2222-4222-8222-222222222222';
const operationId = 'a3333333-3333-4333-8333-333333333333';
const publicReference = '44444444-4444-4444-8444-444444444444';
const invitationId = '55555555-5555-4555-8555-555555555555';
// Synthetic canonical 32-byte token, never a production secret.
const token = 'A'.repeat(43);
const identity: AuthIdentity = {
  authUserId,
  email: 'civilian@example.test',
  emailVerified: true,
  hasVerifiedTotp: false,
  totpAuthenticated: false,
  sessionId: null,
  aal: 'aal1',
  accessMode: 'standard',
};
const headers = { authorization: 'Bearer valid-token', 'idempotency-key': operationId };
const outward: CivilianProfileResponse = {
  schemaVersion: 1,
  displayAlias: 'Civilian',
  identityLabel: 'Civilian',
};
const appearance = {
  catalogVersion: 1 as const,
  presetId: 'portrait-02' as const,
  skinToneId: 'tone-04' as const,
  hairStyleId: 'coiled' as const,
  hairColorId: 'auburn' as const,
};
const owner: OwnerProfileResponse = {
  schemaVersion: 1,
  ruleVersion: 'civilian-profile-v1',
  mode: 'active',
  status: 'available',
  profile: {
    characterId,
    characterRevision: '9007199254740993',
    disclosureRevision: '9007199254740994',
    visibility: 'limited',
    showFictionalAvatar: false,
    showRegistrationDate: false,
    publicReference: null,
    preview: outward,
    invitation: null,
  },
  controls: {
    canUpdate: true,
    canIssue: true,
    canRevoke: true,
    canWithdraw: true,
    sharingAvailable: true,
  },
};
const metadata = {
  invitationId,
  scope: 'profile.view' as const,
  issuedAt: '2026-10-02T10:00:00.000Z',
  expiresAt: '2026-10-02T10:10:00.000Z',
};
const mutation = {
  schemaVersion: 1,
  receipt: {
    operationId,
    operation: 'profile.update',
    ruleVersion: 'civilian-profile-v1',
    committedAt: '2026-10-02T10:00:00.000Z',
    subject: 'character',
    affectedProfileCount: 1,
    character: {
      characterId,
      characterRevision: '9007199254740993',
      disclosureRevision: '9007199254740994',
    },
    invitation: null,
  },
  replayed: false,
  current: owner,
} satisfies ProfileMutationResponse;
const issued: IssueProfileInvitationResponse = {
  ...mutation,
  receipt: {
    ...mutation.receipt,
    operation: 'profile.invitation.generate',
    subject: 'character',
    affectedProfileCount: 1,
    character: mutation.receipt.character!,
    invitation: metadata,
  },
  replayed: false,
  tokenDelivery: { status: 'delivered', token },
};
const resolved: ResolveProfileInvitationResponse = {
  schemaVersion: 1,
  profile: outward,
  invitation: { scope: 'profile.view', expiresAt: metadata.expiresAt },
};
const updateInput = {
  characterId,
  expectedRevision: '9007199254740993',
  visibility: 'limited',
  showFictionalAvatar: false,
  showRegistrationDate: false,
};
const ownerRead = { method: 'GET', url: '/v1/me/profile' } as const;
const publicRead = { method: 'GET', url: '/v1/profiles/' + publicReference } as const;
const resolveRead = {
  method: 'POST',
  url: '/v1/profile-invitations/resolve',
  payload: { token },
} as const;
const writes = [
  { method: 'PUT', url: '/v1/me/profile', payload: updateInput },
  {
    method: 'POST',
    url: '/v1/me/profile/invitations',
    payload: {
      characterId,
      expectedRevision: '9007199254740993',
      scope: 'profile.view',
      mode: 'generate',
    },
  },
  {
    method: 'POST',
    url: '/v1/me/profile/invitations/revoke',
    payload: { characterId, expectedRevision: '9007199254740993' },
  },
  {
    method: 'POST',
    url: '/v1/me/profile/disclosure/withdraw',
    payload: { scope: 'all-owned-profiles' },
  },
] satisfies InjectOptions[];
const routes = [ownerRead, ...writes, publicRead, resolveRead];
const apps: FastifyInstance[] = [];

function store(overrides: Partial<ProfileStore> = {}): ProfileStore {
  return {
    getOwner: async () => ({ kind: 'success', value: owner }),
    update: async () => ({ kind: 'success', value: mutation }),
    issue: async () => ({ kind: 'success', value: issued }),
    revoke: async () => ({
      kind: 'success',
      value: {
        ...mutation,
        receipt: { ...mutation.receipt, operation: 'profile.invitation.revoke' },
      },
    }),
    withdraw: async () => ({
      kind: 'success',
      value: {
        ...mutation,
        receipt: {
          ...mutation.receipt,
          operation: 'profile.disclosure.withdraw',
          subject: 'account',
          character: null,
          invitation: null,
          affectedProfileCount: 2,
        },
      },
    }),
    getPublic: async () => ({ kind: 'success', value: outward }),
    resolve: async () => ({ kind: 'success', value: resolved }),
    ...overrides,
  };
}
function makeApp(
  options: {
    profiles?: ProfileStore;
    verified?: AuthIdentity | null;
    verifier?: AuthVerifier;
    logger?: boolean;
  } = {},
) {
  const app = buildApp({
    logger: options.logger ?? false,
    auth: {
      publicConfig: {
        supabaseUrl: 'https://project.supabase.co',
        supabasePublishableKey: 'public',
      },
      verifier: options.verifier ?? {
        verify: async () => (options.verified === undefined ? identity : options.verified),
      },
    },
    profiles: options.profiles ?? store(),
  });
  apps.push(app);
  return app;
}
function deniedStore(kind: ProfileFailureKind): ProfileStore {
  const denied = async () => ({ kind });
  return {
    getOwner: denied,
    update: denied,
    issue: denied,
    revoke: denied,
    withdraw: denied,
    getPublic: denied,
    resolve: denied,
  };
}
function safeError(
  response: Awaited<ReturnType<FastifyInstance['inject']>>,
  status: number,
  code: string,
) {
  expect(response.statusCode).toBe(status);
  expect(response.json()).toEqual({ error: { code, requestId: response.headers['x-request-id'] } });
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
});

describe('authenticated civilian profile API', () => {
  it('exposes the seven exact routes with no-store and server request IDs', async () => {
    const app = makeApp();
    for (const route of routes) {
      const response = await app.inject({
        ...route,
        headers: { ...headers, 'x-request-id': 'forged' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect((await app.inject({ ...ownerRead, headers })).json()).toEqual(owner);
    expect((await app.inject({ ...publicRead, headers })).json()).toEqual(outward);
    expect((await app.inject({ ...resolveRead, headers })).json()).toEqual(resolved);
    expect((await app.inject({ ...writes[0]!, headers })).json()).toEqual(mutation);
    expect((await app.inject({ ...writes[2]!, headers })).json().receipt.operation).toBe(
      'profile.invitation.revoke',
    );
    expect((await app.inject({ ...writes[3]!, headers })).json().receipt).toMatchObject({
      subject: 'account',
      character: null,
      affectedProfileCount: 2,
    });
  });

  it('delivers a token only for first issue and preserves historical receipt separately from current state', async () => {
    let issuedOnce = false;
    const current: OwnerProfileResponse = {
      ...owner,
      mode: 'observer',
      status: 'no_living_profile',
      profile: null,
    };
    const app = makeApp({
      profiles: store({
        issue: async () => {
          if (!issuedOnce) {
            issuedOnce = true;
            return { kind: 'success', value: issued };
          }
          return {
            kind: 'success',
            value: { ...issued, replayed: true, current, tokenDelivery: { status: 'unavailable' } },
          };
        },
      }),
    });
    const first = await app.inject({ ...writes[1]!, headers });
    const replay = await app.inject({ ...writes[1]!, headers });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual(issued);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual({
      ...issued,
      replayed: true,
      current,
      tokenDelivery: { status: 'unavailable' },
    });
    expect(replay.body).not.toContain(token);
  });

  it('copies all DTO layers, omits disabled outward fields, and preserves decimal revisions', async () => {
    const poison = {
      authUserId,
      accountId: 'private-account',
      tokenDigest: token,
      preciseLocation: 'private-place',
      providerPredicate: true,
    };
    const disclosed = {
      ...outward,
      appearance: { ...appearance, ...poison },
      registrationDate: '2026-10-02',
      ...poison,
    };
    const pollutedOwner: OwnerProfileResponse = {
      ...owner,
      ...poison,
      controls: { ...owner.controls, ...poison },
      profile: {
        ...owner.profile!,
        visibility: 'public',
        publicReference,
        showFictionalAvatar: true,
        showRegistrationDate: true,
        preview: disclosed,
        invitation: { ...metadata, status: 'valid', ...poison },
        ...poison,
      },
    };
    const pollutedMutation = {
      ...mutation,
      ...poison,
      current: pollutedOwner,
      receipt: {
        ...mutation.receipt,
        ...poison,
        character: { ...mutation.receipt.character!, ...poison },
      },
    };
    const app = makeApp({
      profiles: store({
        getOwner: async () => ({ kind: 'success', value: pollutedOwner }),
        update: async () => ({ kind: 'success', value: pollutedMutation }),
        getPublic: async () => ({ kind: 'success', value: disclosed }),
        resolve: async () => ({
          kind: 'success',
          value: {
            ...resolved,
            ...poison,
            profile: disclosed,
            invitation: { ...resolved.invitation, ...poison },
          },
        }),
      }),
    });
    for (const route of [ownerRead, writes[0]!, publicRead, resolveRead]) {
      const response = await app.inject({ ...route, headers });
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toMatch(
        /authUserId|accountId|tokenDigest|preciseLocation|providerPredicate/,
      );
      expect(response.body).not.toContain(token);
    }
    const profile = (await app.inject({ ...publicRead, headers })).json();
    expect(profile).toEqual({ ...outward, appearance, registrationDate: '2026-10-02' });
    const privateOwner = (await app.inject({ ...ownerRead, headers })).json();
    expect(privateOwner.profile.characterRevision).toBe('9007199254740993');
    expect(privateOwner.profile.disclosureRevision).toBe('9007199254740994');
    expect((await makeApp().inject({ ...publicRead, headers })).json()).toEqual(outward);
  });

  it.each(['onboarding', 'observer', 'restricted', 'incapacitated'] as const)(
    'preserves store-approved %s own-record reads without adding a character-action gate',
    async (mode) => {
      const current: OwnerProfileResponse = {
        ...owner,
        mode,
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
      const response = await makeApp({
        profiles: store({ getOwner: async () => ({ kind: 'success', value: current }) }),
      }).inject({ ...ownerRead, headers });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(current);
    },
  );
  it('preserves unsupported official-ID state without inventing a card', async () => {
    const current: OwnerProfileResponse = {
      ...owner,
      status: 'unsupported_official_id',
      profile: null,
    };
    expect(
      (
        await makeApp({
          profiles: store({ getOwner: async () => ({ kind: 'success', value: current }) }),
        }).inject({ ...ownerRead, headers })
      ).json(),
    ).toEqual(current);
  });

  it.each([
    ['operator_only', 403, 'OPERATOR_ONLY'],
    ['auth_ineligible', 403, 'AUTH_INELIGIBLE'],
    ['account_restricted', 403, 'ACCOUNT_RESTRICTED'],
    ['character_unavailable', 403, 'CHARACTER_ACTION_UNAVAILABLE'],
    ['profile_unavailable', 404, 'PROFILE_UNAVAILABLE'],
    ['sharing_unavailable', 503, 'PROFILE_SHARING_UNAVAILABLE'],
    ['stale_revision', 409, 'STALE_REVISION'],
    ['operation_conflict', 409, 'OPERATION_CONFLICT'],
    ['invitation_exists', 409, 'PROFILE_INVITATION_EXISTS'],
    ['invitation_missing', 409, 'PROFILE_INVITATION_MISSING'],
    ['invalid_request', 400, 'INVALID_REQUEST'],
  ] as const)('maps owner %s without leaking predicates', async (kind, status, code) => {
    const app = makeApp({ profiles: deniedStore(kind) });
    for (const route of [ownerRead, ...writes])
      safeError(await app.inject({ ...route, headers }), status, code);
  });
  it.each([
    ['operator_only', 403, 'OPERATOR_ONLY'],
    ['auth_ineligible', 403, 'AUTH_INELIGIBLE'],
    ['invalid_request', 400, 'INVALID_REQUEST'],
    ['profile_unavailable', 404, 'SHARED_PROFILE_UNAVAILABLE'],
    ['sharing_unavailable', 404, 'SHARED_PROFILE_UNAVAILABLE'],
    ['character_unavailable', 404, 'SHARED_PROFILE_UNAVAILABLE'],
    ['account_restricted', 404, 'SHARED_PROFILE_UNAVAILABLE'],
    ['stale_revision', 404, 'SHARED_PROFILE_UNAVAILABLE'],
    ['operation_conflict', 404, 'SHARED_PROFILE_UNAVAILABLE'],
    ['invitation_exists', 404, 'SHARED_PROFILE_UNAVAILABLE'],
    ['invitation_missing', 404, 'SHARED_PROFILE_UNAVAILABLE'],
  ] as const)('maps outward %s safely', async (kind, status, code) => {
    const app = makeApp({ profiles: deniedStore(kind) });
    for (const route of [publicRead, resolveRead])
      safeError(await app.inject({ ...route, headers }), status, code);
  });

  it.each([
    [null, 401, 'AUTH_REQUIRED'],
    [{ ...identity, accessMode: 'recovery' as const }, 403, 'PASSWORD_UPDATE_REQUIRED'],
    [{ ...identity, accessMode: 'restricted' as const }, 403, 'PASSWORD_SIGN_IN_REQUIRED'],
    [{ ...identity, emailVerified: false }, 403, 'EMAIL_VERIFICATION_REQUIRED'],
  ])(
    'retains Auth transport boundaries for every profile route',
    async (verified, status, code) => {
      const fail = async () => {
        throw new Error('store must not be reached');
      };
      const app = makeApp({
        verified,
        profiles: {
          getOwner: fail,
          update: fail,
          issue: fail,
          revoke: fail,
          withdraw: fail,
          getPublic: fail,
          resolve: fail,
        },
      });
      for (const route of routes) safeError(await app.inject({ ...route, headers }), status, code);
    },
  );
  it('requires a bearer even when the configured verifier would accept an empty value', async () => {
    const app = makeApp();
    for (const authorization of [undefined, 'Basic valid-token', 'Bearer a,b']) {
      for (const route of routes)
        safeError(
          await app.inject({
            ...route,
            headers: {
              'idempotency-key': operationId,
              ...(authorization ? { authorization } : {}),
            },
          }),
          401,
          'AUTH_REQUIRED',
        );
    }
  });
  it('rechecks current provider eligibility and recovery/OTP methods for the same profile session', async () => {
    let banned = false;
    const verifier = createSupabaseAuthVerifier({
      supabaseUrl: 'https://project.supabase.co',
      publishableKey: 'public',
      fetch: (async () =>
        Response.json({
          id: authUserId,
          is_anonymous: false,
          email: identity.email,
          email_confirmed_at: '2026-10-02T00:00:00.000Z',
          ...(banned ? { banned_until: new Date(Date.now() + 60_000).toISOString() } : {}),
        })) as typeof fetch,
    });
    function authorization(amr: string[]) {
      const payload = Buffer.from(
        JSON.stringify({
          sub: authUserId,
          exp: Math.floor(Date.now() / 1000) + 600,
          aal: 'aal1',
          amr,
        }),
      ).toString('base64url');
      return 'Bearer eyJhbGciOiJub25lIn0.' + payload + '.provider-signature';
    }
    const app = makeApp({ verifier });
    const password = { ...headers, authorization: authorization(['password']) };
    expect((await app.inject({ ...ownerRead, headers: password })).statusCode).toBe(200);
    for (const [amr, code] of [
      [['otp'], 'PASSWORD_SIGN_IN_REQUIRED'],
      [['password', 'recovery'], 'PASSWORD_UPDATE_REQUIRED'],
    ] as const) {
      for (const route of routes)
        safeError(
          await app.inject({
            ...route,
            headers: { ...headers, authorization: authorization([...amr]) },
          }),
          403,
          code,
        );
    }
    banned = true;
    for (const route of routes)
      safeError(await app.inject({ ...route, headers: password }), 401, 'AUTH_REQUIRED');
  });
  it('fails closed for missing services and provider/store exceptions on every route', async () => {
    const fail = async () => {
      throw new Error('private SQL predicate ' + token);
    };
    const absent = buildApp();
    apps.push(absent);
    const noStore = buildApp({
      auth: {
        publicConfig: {
          supabaseUrl: 'https://project.supabase.co',
          supabasePublishableKey: 'public',
        },
        verifier: { verify: async () => identity },
      },
    });
    apps.push(noStore);
    const noAuth = buildApp({ profiles: store() });
    apps.push(noAuth);
    const provider = makeApp({ verifier: { verify: fail } });
    const failed = makeApp({
      profiles: {
        getOwner: fail,
        update: fail,
        issue: fail,
        revoke: fail,
        withdraw: fail,
        getPublic: fail,
        resolve: fail,
      },
    });
    for (const app of [absent, noStore, noAuth, provider, failed]) {
      for (const route of routes)
        safeError(await app.inject({ ...route, headers }), 503, 'PROFILE_SERVICE_UNAVAILABLE');
    }
  });

  it('rejects raw coercible, nested, missing and extra inputs before the store', async () => {
    const malformed = [
      { ...writes[0]!, payload: { ...updateInput, showFictionalAvatar: 'false' } },
      { ...writes[0]!, payload: { ...updateInput, showRegistrationDate: 0 } },
      { ...writes[0]!, payload: { ...updateInput, expectedRevision: 1 } },
      { ...writes[0]!, payload: { ...updateInput, expectedRevision: '01' } },
      { ...writes[0]!, payload: { ...updateInput, characterId: [characterId] } },
      { ...writes[0]!, payload: { ...updateInput, visibility: ['limited'] } },
      { ...writes[0]!, payload: { ...updateInput, appearance } },
      { ...writes[0]!, payload: { ...updateInput, showFictionalAvatar: { value: true } } },
      { ...writes[0]!, payload: 'null' },
      { ...writes[0]!, payload: 'true' },
      { ...writes[0]!, payload: '123' },
      { ...writes[0]!, payload: [] },
      { ...writes[0]!, payload: { characterId } },
      { ...writes[1]!, payload: { ...writes[1]!.payload, scope: 'party.join' } },
      { ...writes[1]!, payload: { ...writes[1]!.payload, scope: ['profile.view'] } },
      { ...writes[1]!, payload: { ...writes[1]!.payload, mode: ['generate'] } },
      { ...writes[1]!, payload: { ...writes[1]!.payload, mode: 'friend' } },
      { ...writes[1]!, payload: { ...writes[1]!.payload, expiresAt: metadata.expiresAt } },
      { ...writes[2]!, payload: { ...writes[2]!.payload, expectedRevision: true } },
      { ...writes[2]!, payload: { ...writes[2]!.payload, foreignOwner: authUserId } },
      { ...writes[3]!, payload: { scope: ['all-owned-profiles'] } },
      { ...writes[3]!, payload: { scope: 'all-owned-profiles', characterId } },
      { ...resolveRead, payload: { token: [token] } },
      { ...resolveRead, payload: { token: token.slice(0, 42) + 'B' } },
      { ...resolveRead, payload: { token, scope: 'profile.view' } },
    ];
    const fail = async () => {
      throw new Error('store must not be reached');
    };
    const app = makeApp({
      profiles: {
        getOwner: fail,
        update: fail,
        issue: fail,
        revoke: fail,
        withdraw: fail,
        getPublic: fail,
        resolve: fail,
      },
    });
    // Separate IPs prevent malformed requests from exhausting the independent IP control.
    for (const [index, request] of malformed.entries())
      safeError(
        await app.inject({
          ...request,
          remoteAddress: '10.0.0.' + (index + 1),
          headers: { ...headers, 'content-type': 'application/json' },
        }),
        400,
        'INVALID_REQUEST',
      );
    for (const key of [
      undefined,
      '',
      'invalid',
      '33333333-3333-0333-8333-333333333333',
      [operationId, operationId],
    ]) {
      for (const route of writes)
        safeError(
          await makeApp().inject({
            ...route,
            headers: {
              authorization: headers.authorization,
              ...(key === undefined ? {} : { 'idempotency-key': key }),
            },
          }),
          400,
          'INVALID_REQUEST',
        );
    }
    safeError(
      await app.inject({ url: '/v1/profiles/not-a-reference', headers }),
      400,
      'INVALID_REQUEST',
    );
  });

  it('normalizes operation UUID casing and uses only verified actor identity', async () => {
    const app = makeApp({
      profiles: store({
        update: async (actor, input, key) => {
          if (
            actor !== authUserId ||
            key !== operationId ||
            input.expectedRevision !== '9007199254740993'
          )
            return { kind: 'invalid_request' };
          return { kind: 'success', value: mutation };
        },
        getPublic: async (actor, reference) =>
          actor === authUserId && reference === publicReference
            ? { kind: 'success', value: outward }
            : { kind: 'invalid_request' },
      }),
    });
    expect(
      (
        await app.inject({
          ...writes[0]!,
          headers: { ...headers, 'idempotency-key': operationId.toUpperCase() },
        })
      ).statusCode,
    ).toBe(200);
    expect((await app.inject({ ...publicRead, headers })).statusCode).toBe(200);
  });
  it('bounds all mutation and resolve bodies to 1024 bytes', async () => {
    const app = makeApp();
    for (const route of [...writes, resolveRead]) {
      const response = await app.inject({
        ...route,
        headers: { ...headers, 'content-type': 'application/json' },
        payload: { ...route.payload, excess: 'x'.repeat(1024) },
      });
      safeError(response, 413, 'INVALID_REQUEST');
    }
  });
  it('never registers a search, directory or token-in-path handler', async () => {
    const app = makeApp();
    for (const url of ['/v1/profiles', '/v1/profile-invitations/resolve/' + token])
      safeError(await app.inject({ url, headers }), 404, 'NOT_FOUND');
    safeError(
      await app.inject({ url: '/v1/profiles/search?q=Civilian', headers }),
      400,
      'INVALID_REQUEST',
    );
  });
  it('keeps raw resolve tokens, bearer credentials and exception inputs out of logs and error envelopes', async () => {
    const logs: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      logs.push(String(chunk));
      return true;
    });
    const app = makeApp({
      logger: true,
      profiles: store({
        resolve: async () => {
          throw new Error('private predicate ' + token);
        },
      }),
    });
    const response = await app.inject({ ...resolveRead, headers });
    safeError(response, 503, 'PROFILE_SERVICE_UNAVAILABLE');
    const invalid = await app.inject({ ...resolveRead, headers, payload: { token, extra: token } });
    safeError(invalid, 400, 'INVALID_REQUEST');
    const tooLarge = await app.inject({
      ...resolveRead,
      headers,
      payload: { token: token.repeat(25) },
    });
    safeError(tooLarge, 413, 'INVALID_REQUEST');
    for (let index = 0; index < 21; index++) {
      const limited = await app.inject({
        ...writes[index % 4]!,
        remoteAddress: '10.8.0.' + (index + 1),
        headers,
      });
      expect(limited.statusCode).toBe(index < 20 ? 200 : 429);
    }
    expect(logs.join('')).toContain('/v1/profile-invitations/resolve');
    expect(logs.join('')).not.toContain(token);
    expect(logs.join('')).not.toContain('valid-token');
    expect(logs.join('')).not.toContain(authUserId);
    expect(logs.join('')).not.toContain('private predicate');
    expect(response.body + invalid.body + tooLarge.body).not.toContain(token);
  });

  it('shares the verified-actor mutation quota across all four endpoints, changing bearers and IPs', async () => {
    const app = makeApp();
    for (let index = 0; index < 20; index++) {
      expect(
        (
          await app.inject({
            ...writes[index % 4]!,
            remoteAddress: '10.1.0.' + (index + 1),
            headers: { ...headers, authorization: 'Bearer rotated-' + index },
          })
        ).statusCode,
      ).toBe(200);
    }
    for (const route of writes) {
      const response = await app.inject({
        ...route,
        remoteAddress: '10.2.0.1',
        headers: { ...headers, authorization: 'Bearer another-session' },
      });
      safeError(response, 429, 'RATE_LIMITED');
      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    }
    expect(
      (await app.inject({ ...ownerRead, remoteAddress: '10.3.0.1', headers })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ ...resolveRead, remoteAddress: '10.3.0.1', headers })).statusCode,
    ).toBe(200);
  });
  it('keeps independently verified actors separate even after one exhausts the actor quota', async () => {
    const app = makeApp({
      verifier: {
        verify: async (bearer) => ({
          ...identity,
          authUserId:
            bearer === 'second-actor' ? '66666666-6666-4666-8666-666666666666' : authUserId,
        }),
      },
    });
    for (let index = 0; index < 21; index++) {
      const response = await app.inject({
        ...writes[index % 4]!,
        remoteAddress: '10.4.0.' + (index + 1),
        headers,
      });
      expect(response.statusCode).toBe(index < 20 ? 200 : 429);
    }
    for (let index = 0; index < 20; index++)
      expect(
        (
          await app.inject({
            ...writes[index % 4]!,
            remoteAddress: '10.5.0.' + (index + 1),
            headers: { ...headers, authorization: 'Bearer second-actor' },
          })
        ).statusCode,
      ).toBe(200);
  });
  it.each(writes)(
    'enforces the 20-per-IP mutation limit at $url independently of verified actors',
    async (route) => {
      const app = makeApp({
        verifier: {
          verify: async (bearer) => ({
            ...identity,
            authUserId: bearer.padStart(8, '0') + '-1111-4111-8111-111111111111',
          }),
        },
      });
      for (let index = 0; index < 21; index++) {
        const response = await app.inject({
          ...route,
          remoteAddress: '10.6.0.1',
          headers: { ...headers, authorization: 'Bearer ' + index },
        });
        if (index < 20) expect(response.statusCode).toBe(200);
        else {
          safeError(response, 429, 'RATE_LIMITED');
          expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
        }
      }
    },
  );
  it.each([ownerRead, publicRead, resolveRead])(
    'enforces the 60-per-IP authenticated read limit at $url',
    async (route) => {
      const app = makeApp();
      for (let index = 0; index < 61; index++) {
        const response = await app.inject({ ...route, remoteAddress: '10.9.0.1', headers });
        if (index < 60) expect(response.statusCode).toBe(200);
        else {
          safeError(response, 429, 'RATE_LIMITED');
          expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
        }
      }
    },
  );
  it.each([ownerRead, publicRead, resolveRead])(
    'enforces the 60-per-IP read limit at $url even for anonymous requests',
    async (route) => {
      const app = makeApp();
      for (let index = 0; index < 61; index++) {
        const response = await app.inject({ ...route, remoteAddress: '10.7.0.1' });
        safeError(response, index < 60 ? 401 : 429, index < 60 ? 'AUTH_REQUIRED' : 'RATE_LIMITED');
        if (index === 60) expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
      }
    },
  );
});
