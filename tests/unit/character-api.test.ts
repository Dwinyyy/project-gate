import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type {
  CharacterStore,
  CreateCharacterResult,
  MeResult,
} from '../../packages/database/src/character-creation.js';
import { createSupabaseAuthVerifier, type AuthIdentity } from '../../packages/server/src/auth.js';
import { buildApp } from '../../apps/api/src/app.js';

const authUserId = '11111111-1111-4111-8111-111111111111';
const characterId = '22222222-2222-4222-8222-222222222222';
const operationId = '33333333-3333-4333-8333-333333333333';
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
const apps: FastifyInstance[] = [];
const headers = { authorization: 'Bearer valid-token', 'idempotency-key': operationId };
const appearance = {
  catalogVersion: 1 as const,
  presetId: 'portrait-02' as const,
  skinToneId: 'tone-04' as const,
  hairStyleId: 'coiled' as const,
  hairColorId: 'auburn' as const,
};
const player: MeResult = {
  kind: 'player',
  schemaVersion: 3,
  mode: 'onboarding',
  character: null,
  creation: { status: 'feature_disabled', notBefore: null },
};
const created: CreateCharacterResult = {
  kind: 'created',
  characterId,
  operationId,
  createdAt: '2026-09-27T10:00:00.000Z',
  replayed: false,
};

function makeApp(options: { verified?: AuthIdentity | null; characters?: CharacterStore }) {
  const app = buildApp({
    auth: {
      publicConfig: {
        supabaseUrl: 'https://project.supabase.co',
        supabasePublishableKey: 'public',
      },
      verifier: {
        verify: async () => (options.verified === undefined ? identity : options.verified),
      },
    },
    ...(options.characters ? { characters: options.characters } : {}),
  });
  apps.push(app);
  return app;
}

function store(me: MeResult = player, creation: CreateCharacterResult = created): CharacterStore {
  return { getMe: async () => me, create: async () => creation };
}

afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe('private character API', () => {
  it.each([123, true, ['A']])(
    'rejects a non-string raw alias before schema coercion',
    async (displayAlias) => {
      let storeCalls = 0;
      const app = makeApp({
        characters: {
          getMe: async () => player,
          create: async () => {
            storeCalls += 1;
            return created;
          },
        },
      });
      const response = await app.inject({
        method: 'POST',
        url: '/v1/characters',
        headers,
        payload: { displayAlias, appearance },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
      expect(storeCalls).toBe(0);
    },
  );

  it('requires the complete appearance and passes the exact creation input', async () => {
    const received: unknown[] = [];
    const app = makeApp({
      characters: {
        getMe: async () => player,
        create: async (_id, input) => {
          received.push(input);
          return created;
        },
      },
    });
    const valid = await app.inject({
      method: 'POST',
      url: '/v1/characters',
      headers,
      payload: { displayAlias: 'Civilian', appearance },
    });
    expect(valid.statusCode).toBe(201);
    expect(received).toEqual([{ displayAlias: 'Civilian', appearance }]);
    for (const payload of [
      { displayAlias: 'Civilian' },
      { displayAlias: 'Civilian', appearance: { ...appearance, hairColorId: 'unknown' } },
      {
        displayAlias: 'Civilian',
        appearance: { ...appearance, imageUrl: 'https://example.test/a' },
      },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/characters',
        headers,
        payload,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
    }
    expect(received).toHaveLength(1);
  });

  it('returns a private, versioned read with no account for a disabled first login', async () => {
    const response = await makeApp({ characters: store() }).inject({ url: '/v1/me', headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      schemaVersion: 3,
      mode: 'onboarding',
      character: null,
      creation: { status: 'feature_disabled', notBefore: null },
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('projects only the current living character and eligibility', async () => {
    const response = await makeApp({
      characters: store({
        kind: 'player',
        schemaVersion: 3,
        mode: 'incapacitated',
        character: {
          id: characterId,
          displayAlias: 'Civilian',
          appearance,
          lifeState: 'incapacitated',
          awakeningState: 'unawakened',
          presenceState: 'sheltered',
          profileVisibility: 'private',
          revision: '9007199254740993',
          createdAt: '2026-09-27T10:00:00.000Z',
        },
        creation: { status: 'occupied', notBefore: null },
      }),
    }).inject({ url: '/v1/me', headers });
    expect(response.statusCode).toBe(200);
    expect(response.json().character).toMatchObject({
      id: characterId,
      appearance,
      lifeState: 'incapacitated',
      revision: '9007199254740993',
    });
    expect(response.body).not.toMatch(/accountId|deadHistory|preciseLocation|authUserId/);
  });

  it.each([
    ['onboarding', 'available', null],
    ['active', 'occupied', 'alive'],
    ['incapacitated', 'occupied', 'incapacitated'],
    ['observer', 'cooldown', null],
    ['restricted', 'restricted', 'alive'],
  ] as const)('projects the private %s mode and %s creation state', async (mode, status, life) => {
    const privateFields = {
      accountId: authUserId,
      deadHistory: [{ id: 'private history' }],
      providerStatus: 'private provider status',
    };
    const character = life
      ? {
          id: characterId,
          displayAlias: 'Civilian',
          appearance,
          lifeState: life,
          awakeningState: 'unawakened' as const,
          presenceState: 'sheltered' as const,
          profileVisibility: 'private' as const,
          revision: '9007199254740993',
          createdAt: '2026-09-27T10:00:00.000Z',
          accountId: authUserId,
          moderationReason: 'private reason',
          preciseLocation: 'private coordinates',
        }
      : null;
    const response = await makeApp({
      characters: store({
        kind: 'player',
        schemaVersion: 3,
        mode,
        character,
        creation: {
          status,
          notBefore: status === 'cooldown' ? '2026-09-29T10:00:00.000Z' : null,
        },
        ...privateFields,
      }),
    }).inject({ url: '/v1/me?accountId=foreign&mode=active', headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      schemaVersion: 3,
      mode,
      character: character && {
        id: characterId,
        displayAlias: 'Civilian',
        appearance,
        lifeState: life,
        awakeningState: 'unawakened',
        presenceState: 'sheltered',
        profileVisibility: 'private',
        revision: '9007199254740993',
        createdAt: '2026-09-27T10:00:00.000Z',
      },
      creation: {
        status,
        notBefore: status === 'cooldown' ? '2026-09-29T10:00:00.000Z' : null,
      },
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.body).not.toMatch(
      /accountId|deadHistory|moderationReason|preciseLocation|providerStatus/,
    );
  });

  it('returns the same receipt for an authorized replay and no life claim', async () => {
    let calls = 0;
    const characters: CharacterStore = {
      getMe: async () => player,
      create: async () => ({ ...created, replayed: calls++ > 0 }),
    };
    const app = makeApp({ characters });
    const request = {
      method: 'POST' as const,
      url: '/v1/characters',
      headers,
      payload: { displayAlias: 'Civilian', appearance },
    };
    const first = await app.inject(request);
    const replay = await app.inject(request);
    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    expect(replay.body).toBe(first.body);
    expect(first.json()).toEqual({ characterId, operationId, createdAt: created.createdAt });
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('canonicalizes UUID key casing so the same receipt has byte-identical responses', async () => {
    const canonical = 'a3333333-3333-4333-8333-333333333333';
    const received: string[] = [];
    const characters: CharacterStore = {
      getMe: async () => player,
      create: async (_authUserId, _alias, receivedOperationId) => {
        received.push(receivedOperationId);
        return { ...created, operationId: receivedOperationId, replayed: received.length > 1 };
      },
    };
    const app = makeApp({ characters });
    const request = {
      method: 'POST' as const,
      url: '/v1/characters',
      payload: { displayAlias: 'Civilian', appearance },
    };
    const first = await app.inject({
      ...request,
      headers: { ...headers, 'idempotency-key': canonical.toUpperCase() },
    });
    const retry = await app.inject({
      ...request,
      headers: { ...headers, 'idempotency-key': canonical },
    });
    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(201);
    expect(first.body).toBe(retry.body);
    expect(first.json().operationId).toBe(canonical);
    expect(received).toEqual([canonical, canonical]);
  });

  it.each([
    [null, 401, 'AUTH_REQUIRED'],
    [{ ...identity, accessMode: 'recovery' as const }, 403, 'PASSWORD_UPDATE_REQUIRED'],
    [{ ...identity, accessMode: 'restricted' as const }, 403, 'PASSWORD_SIGN_IN_REQUIRED'],
    [{ ...identity, emailVerified: false }, 403, 'EMAIL_VERIFICATION_REQUIRED'],
  ])(
    'denies unavailable or ineligible bearer before touching character state',
    async (verified, status, code) => {
      const characters: CharacterStore = {
        getMe: async () => {
          throw Error('store called');
        },
        create: async () => {
          throw Error('store called');
        },
      };
      const app = makeApp({ verified, characters });
      for (const request of [
        { url: '/v1/me' },
        {
          method: 'POST' as const,
          url: '/v1/characters',
          payload: { displayAlias: 'Civilian', appearance },
        },
      ]) {
        const response = await app.inject({ ...request, headers });
        expect(response.statusCode).toBe(status);
        expect(response.json()).toMatchObject({ error: { code } });
      }
    },
  );

  it('rejects an earlier bearer after the provider bans its user', async () => {
    const payload = Buffer.from(
      JSON.stringify({
        sub: authUserId,
        exp: Math.floor(Date.now() / 1000) + 600,
        aal: 'aal1',
        amr: ['password'],
      }),
    ).toString('base64url');
    const token = `eyJhbGciOiJub25lIn0.${payload}.provider-signature`;
    const verifier = createSupabaseAuthVerifier({
      supabaseUrl: 'https://project.supabase.co',
      publishableKey: 'public',
      fetch: (async () =>
        Response.json({
          id: authUserId,
          is_anonymous: false,
          email: 'civilian@example.test',
          email_confirmed_at: '2026-09-27T00:00:00Z',
          banned_until: new Date(Date.now() + 60_000).toISOString(),
        })) as typeof fetch,
    });
    const app = buildApp({
      auth: {
        publicConfig: {
          supabaseUrl: 'https://project.supabase.co',
          supabasePublishableKey: 'public',
        },
        verifier,
      },
      characters: {
        getMe: async () => {
          throw Error('store called');
        },
        create: async () => {
          throw Error('store called');
        },
      },
    });
    apps.push(app);
    const response = await app.inject({
      url: '/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'AUTH_REQUIRED' } });
  });

  it.each([
    ['operator_only', 'OPERATOR_ONLY'],
    ['auth_ineligible', 'AUTH_INELIGIBLE'],
  ] as const)('maps current %s denial to 403 before a receipt is returned', async (kind, code) => {
    const app = makeApp({ characters: store({ kind }, { kind }) });
    for (const request of [
      { url: '/v1/me' },
      {
        method: 'POST' as const,
        url: '/v1/characters',
        payload: { displayAlias: 'Civilian', appearance },
      },
    ]) {
      const response = await app.inject({ ...request, headers });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: { code } });
      expect(response.body).not.toContain(characterId);
    }
  });

  it.each([
    ['account_restricted', 403, 'ACCOUNT_RESTRICTED'],
    ['disabled', 503, 'CHARACTER_CREATION_DISABLED'],
    ['occupied', 409, 'CHARACTER_SLOT_OCCUPIED'],
    ['operation_conflict', 409, 'OPERATION_CONFLICT'],
    ['cooldown', 409, 'CHARACTER_CREATION_COOLDOWN'],
  ] as const)('maps %s creation result to safe %s response', async (kind, status, code) => {
    const result: CreateCharacterResult =
      kind === 'cooldown' ? { kind, notBefore: '2026-09-28T10:00:00.000Z' } : { kind };
    const response = await makeApp({ characters: store(player, result) }).inject({
      method: 'POST',
      url: '/v1/characters',
      headers,
      payload: { displayAlias: 'Civilian', appearance },
    });
    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ error: { code } });
    expect(response.body).not.toMatch(/accountId|SELECT|INSERT|postgres/i);
  });

  it('does not return a previous receipt after the account becomes restricted', async () => {
    let restricted = false;
    const characters: CharacterStore = {
      getMe: async () => player,
      create: async () => (restricted ? { kind: 'account_restricted' } : created),
    };
    const app = makeApp({ characters });
    const request = {
      method: 'POST' as const,
      url: '/v1/characters',
      headers,
      payload: { displayAlias: 'Civilian', appearance },
    };
    expect((await app.inject(request)).statusCode).toBe(201);
    restricted = true;
    const replay = await app.inject(request);
    expect(replay.statusCode).toBe(403);
    expect(replay.json()).toEqual({
      error: { code: 'ACCOUNT_RESTRICTED', requestId: replay.headers['x-request-id'] },
    });
    expect(replay.headers['cache-control']).toBe('no-store');
    expect(replay.body).not.toMatch(/characterId|operationId|createdAt|moderationReason/);
  });

  it('fails closed without configured services and sanitizes store failures', async () => {
    const noStore = makeApp({});
    expect((await noStore.inject({ url: '/v1/me', headers })).statusCode).toBe(503);
    expect(
      (
        await noStore.inject({
          method: 'POST',
          url: '/v1/characters',
          headers,
          payload: { displayAlias: 'Civilian', appearance },
        })
      ).statusCode,
    ).toBe(503);
    const failing = makeApp({
      characters: {
        getMe: async () => {
          throw Error('SELECT secret');
        },
        create: async () => {
          throw Error('INSERT secret');
        },
      },
    });
    for (const request of [
      { url: '/v1/me' },
      {
        method: 'POST' as const,
        url: '/v1/characters',
        payload: { displayAlias: 'Civilian', appearance },
      },
    ]) {
      const response = await failing.inject({ ...request, headers });
      expect(response.statusCode).toBe(503);
      expect(response.body).not.toMatch(/SELECT|INSERT|secret|stack/i);
    }
  });

  it.each([
    [{ displayAlias: '' }, operationId],
    [{ displayAlias: '   ' }, operationId],
    [{ displayAlias: 'Civilian\u0000Injected' }, operationId],
    [{ displayAlias: 'x'.repeat(41) }, operationId],
    [{ displayAlias: 'Civilian', accountId: authUserId }, operationId],
    [{ displayAlias: 'Civilian' }, 'not-a-uuid'],
    [{ displayAlias: 'Civilian' }, ''],
  ])('rejects malformed client claims before creation', async (payload, key) => {
    const app = makeApp({
      characters: {
        getMe: async () => player,
        create: async () => {
          throw Error('store called');
        },
      },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/characters',
      headers: { ...headers, 'idempotency-key': key },
      payload,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
  });

  it('uses Unicode code points for the 40-character alias boundary', async () => {
    const app = makeApp({ characters: store() });
    const forty = await app.inject({
      method: 'POST',
      url: '/v1/characters',
      headers,
      payload: { displayAlias: '😀'.repeat(40), appearance },
    });
    const fortyOne = await app.inject({
      method: 'POST',
      url: '/v1/characters',
      headers,
      payload: { displayAlias: '😀'.repeat(41), appearance },
    });
    expect(forty.statusCode).toBe(201);
    expect(fortyOne.statusCode).toBe(400);
  });
});
