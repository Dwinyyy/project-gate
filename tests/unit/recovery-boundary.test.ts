import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../apps/api/src/app.js';
import { createSupabaseAuthVerifier } from '../../packages/server/src/auth.js';

const authUserId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const publicConfig = {
  supabaseUrl: 'https://project.supabase.co',
  supabasePublishableKey: 'sb_publishable_example',
};
const providerKeys = generateKeyPairSync('ed25519');
const attackerKeys = generateKeyPairSync('ed25519');
const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: `${publicConfig.supabaseUrl}/auth/v1`,
    aud: 'authenticated',
    sub: authUserId,
    exp: now + 600,
    session_id: sessionId,
    aal: 'aal1',
    amr: [{ method: 'recovery', timestamp: now - 60 }],
    ...overrides,
  };
}

function signedToken(payload: Record<string, unknown>, key = providerKeys.privateKey): string {
  const content = `${encode({ alg: 'EdDSA', typ: 'JWT' })}.${encode(payload)}`;
  return `${content}.${sign(null, Buffer.from(content), key).toString('base64url')}`;
}

function methods(...names: string[]): Array<{ method: string; timestamp: number }> {
  return names.map((method, index) => ({
    method,
    timestamp: Math.floor(Date.now() / 1000) - index,
  }));
}

function fixture() {
  let sessionActive = true;
  // Controlled provider boundary, not a live Supabase emulator. Its signature check
  // ensures the actual verifier forwards exactly the token supplied to the API.
  const providerFetch = vi.fn<typeof fetch>(async (input, init) => {
    const headers = new Headers(init?.headers);
    if (
      String(input) !== `${publicConfig.supabaseUrl}/auth/v1/user` ||
      init?.method !== 'GET' ||
      headers.get('apikey') !== publicConfig.supabasePublishableKey ||
      !sessionActive
    ) {
      return new Response(null, { status: 401 });
    }
    const token = headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
    const [header, payload, signature, extra] = token.split('.');
    if (!header || !payload || !signature || extra !== undefined) {
      return new Response(null, { status: 401 });
    }
    try {
      const decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString()) as {
        alg?: unknown;
      };
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<
        string,
        unknown
      >;
      if (
        decodedHeader.alg !== 'EdDSA' ||
        !verify(
          null,
          Buffer.from(`${header}.${payload}`),
          providerKeys.publicKey,
          Buffer.from(signature, 'base64url'),
        ) ||
        decoded.iss !== `${publicConfig.supabaseUrl}/auth/v1` ||
        decoded.aud !== 'authenticated' ||
        decoded.sub !== authUserId ||
        decoded.session_id !== sessionId
      ) {
        return new Response(null, { status: 401 });
      }
      return Response.json({
        id: authUserId,
        email: 'fixture@example.test',
        email_confirmed_at: '2026-09-13T12:00:00.000Z',
        user_metadata: {
          accessMode: 'standard',
          amr: ['password'],
          aal: 'aal2',
          operator: true,
          recovery: false,
        },
      });
    } catch {
      return new Response(null, { status: 401 });
    }
  });
  const operatorLookup = vi.fn(async () => ({
    authUserId,
    permissions: ['feature_controls:read'],
  }));
  const verifier = createSupabaseAuthVerifier({
    supabaseUrl: publicConfig.supabaseUrl,
    publishableKey: publicConfig.supabasePublishableKey,
    fetch: providerFetch,
  });
  const app = buildApp({
    logger: false,
    auth: { publicConfig, verifier },
    operators: { findActiveOperator: operatorLookup },
  });
  apps.push(app);
  return {
    app,
    verifier,
    providerFetch,
    operatorLookup,
    revokeSession: () => {
      sessionActive = false;
    },
  };
}

async function expectDenied(
  app: FastifyInstance,
  token: string,
  status: 401 | 403,
  code?: string,
): Promise<void> {
  for (const url of ['/v1/auth/session', '/v1/operator/session']) {
    const response = await app.inject({ url, headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(status);
    if (code) expect(response.json()).toMatchObject({ error: { code } });
    expect(response.json()).not.toHaveProperty('authUserId');
    expect(response.json()).not.toHaveProperty('permissions');
    expect(response.headers['cache-control']).toBe('no-store');
  }
}

describe('recovery boundary through the real verifier and API routes', () => {
  it.each(['aal1', 'aal2'] as const)(
    'rejects signed %s recovery tokens despite refresh, MFA, password and metadata claims',
    async (aal) => {
      const { app, operatorLookup, providerFetch } = fixture();
      const token = signedToken(
        claims({ aal, amr: methods('token_refresh', 'totp', 'password', 'recovery') }),
      );
      await expectDenied(app, token, 403, 'PASSWORD_UPDATE_REQUIRED');
      expect(providerFetch).toHaveBeenCalledTimes(2);
      expect(operatorLookup).not.toHaveBeenCalled();
    },
  );

  it.each([
    'otp',
    'magiclink',
    'email/signup',
    'invite',
    'email_change',
    'token_refresh',
    'totp',
    'future_method',
  ])('requires password sign-in when a signed token proves only %s', async (method) => {
    const { app, verifier, operatorLookup } = fixture();
    // Supabase verifyPost and implicit verifyGet can issue OTP AMR for recovery.
    // Provider source: https://github.com/supabase/auth/blob/master/internal/api/verify.go
    const token = signedToken(claims({ aal: 'aal2', amr: methods(method) }));
    await expect(verifier.verify(token)).resolves.toMatchObject({ accessMode: 'restricted' });
    await expectDenied(app, token, 403, 'PASSWORD_SIGN_IN_REQUIRED');
    expect(operatorLookup).not.toHaveBeenCalled();
  });

  it('keeps alternate OTP recovery restricted after provider refresh and MFA upgrade', async () => {
    const { app, operatorLookup } = fixture();
    const token = signedToken(
      claims({ aal: 'aal2', amr: methods('totp', 'token_refresh', 'otp') }),
    );
    await expectDenied(app, token, 403, 'PASSWORD_SIGN_IN_REQUIRED');
    expect(operatorLookup).not.toHaveBeenCalled();
  });

  it('applies the same restriction to RFC string AMR', async () => {
    const { app } = fixture();
    await expectDenied(
      app,
      signedToken(claims({ amr: ['token_refresh', 'otp'] })),
      403,
      'PASSWORD_SIGN_IN_REQUIRED',
    );
    await expectDenied(
      app,
      signedToken(claims({ amr: ['password', 'recovery'] })),
      403,
      'PASSWORD_UPDATE_REQUIRED',
    );
  });

  it.each([
    ['removed recovery AMR', { amr: methods('password') }],
    ['raised assurance', { aal: 'aal2' }],
    ['changed account', { sub: '33333333-3333-4333-8333-333333333333' }],
    ['changed session', { session_id: '44444444-4444-4444-8444-444444444444' }],
    ['extended expiry', { exp: Math.floor(Date.now() / 1000) + 86_400 }],
  ])('rejects a browser-edited JWT with %s', async (_label, overrides) => {
    const { app, providerFetch, operatorLookup } = fixture();
    const originalClaims = claims();
    const [header, , signature] = signedToken(originalClaims).split('.');
    const tampered = `${header}.${encode({ ...originalClaims, ...overrides })}.${signature}`;
    await expectDenied(app, tampered, 401);
    expect(providerFetch).toHaveBeenCalledTimes(2);
    expect(operatorLookup).not.toHaveBeenCalled();
  });

  it('rejects tokens signed with an attacker key and unsigned algorithm-none tokens', async () => {
    const { app, operatorLookup } = fixture();
    const passwordClaims = claims({ aal: 'aal2', amr: methods('password') });
    await expectDenied(app, signedToken(passwordClaims, attackerKeys.privateKey), 401);
    await expectDenied(app, `${encode({ alg: 'none' })}.${encode(passwordClaims)}.`, 401);
    expect(operatorLookup).not.toHaveBeenCalled();
  });

  it('ignores client-supplied role and recovery overrides in headers, cookies and query strings', async () => {
    const { app, operatorLookup } = fixture();
    const token = signedToken(claims());
    for (const path of ['/v1/auth/session', '/v1/operator/session']) {
      const response = await app.inject({
        url: `${path}?accessMode=standard&recovery=false&aal=aal2`,
        headers: {
          authorization: `Bearer ${token}`,
          'x-access-mode': 'standard',
          'x-user-id': authUserId,
          'x-operator': 'true',
          cookie: 'accessMode=standard; recovery=false; aal=aal2',
        },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: { code: 'PASSWORD_UPDATE_REQUIRED' } });
    }
    expect(operatorLookup).not.toHaveBeenCalled();
  });

  it('accepts an explicit password session with MFA, then denies provider-revoked reuse', async () => {
    const { app, operatorLookup, providerFetch, revokeSession } = fixture();
    const token = signedToken(
      claims({ aal: 'aal2', amr: methods('totp', 'token_refresh', 'password') }),
    );
    for (const url of ['/v1/auth/session', '/v1/operator/session']) {
      const response = await app.inject({ url, headers: { authorization: `Bearer ${token}` } });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ authUserId, aal: 'aal2' });
    }
    expect(operatorLookup).toHaveBeenCalledTimes(1);
    revokeSession();
    await expectDenied(app, token, 401);
    expect(providerFetch).toHaveBeenCalledTimes(4);
    expect(operatorLookup).toHaveBeenCalledTimes(1);
  });
});
