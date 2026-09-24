import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../apps/api/src/app.js';
import { createSupabaseAuthVerifier, type AuthIdentity } from '../../packages/server/src/auth.js';

const apps: FastifyInstance[] = [];
it('reports the configured deployment revision without trusting request headers', async () => {
  const revision = 'a'.repeat(40);
  const app = buildApp({ revision });
  apps.push(app);
  const response = await app.inject({
    url: '/v1/system/status',
    headers: { 'x-hunter-revision': 'forged' },
  });
  expect(response.headers['x-hunter-revision']).toBe(revision);
  expect(response.headers['cache-control']).toBe('no-store');
});
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('foundation API trust boundaries', () => {
  it('distinguishes process liveness from database readiness', async () => {
    const app = buildApp({ logger: false });
    apps.push(app);
    expect((await app.inject('/health/live')).statusCode).toBe(200);
    expect((await app.inject('/health/ready')).statusCode).toBe(503);
  });
  it('returns safe foundation capabilities without invented player state', async () => {
    const app = buildApp({ logger: false });
    apps.push(app);
    const response = await app.inject('/v1/system/status');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      name: 'Hunter World',
      release: 'foundation',
      capabilities: { registration: false, characters: false, encounters: false, commerce: false },
    });
    expect(response.json()).not.toHaveProperty('character');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('does not accept an arbitrary request ID as a trusted log identifier', async () => {
    const app = buildApp({ logger: false });
    apps.push(app);
    const response = await app.inject({
      url: '/health/live',
      headers: { 'x-request-id': 'attacker-controlled' },
    });
    expect(response.headers['x-request-id']).not.toBe('attacker-controlled');
  });
  it.each(['GET', 'POST', 'DELETE'] as const)(
    'fails closed for operator access over %s',
    async (method) => {
      const app = buildApp({ logger: false });
      apps.push(app);
      const response = await app.inject({
        method,
        url: '/v1/operator/feature-controls',
        headers: { authorization: 'Bearer fabricated-operator-token' },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: { code: 'OPERATOR_AUTH_REQUIRED' } });
      expect(response.body).not.toMatch(/DATABASE_URL|stack|secret/i);
    },
  );
  it('does not expose game mutation endpoints or a location override', async () => {
    const app = buildApp({ logger: false });
    apps.push(app);
    for (const url of ['/v1/characters', '/v1/dev/location', '/v1/rewards']) {
      expect((await app.inject({ method: 'POST', url, payload: {} })).statusCode).toBe(404);
    }
  });
  it('redacts unexpected internal errors from the client', async () => {
    const app = buildApp({ logger: false });
    apps.push(app);
    app.get('/test-failure', () => {
      throw new Error('postgresql://owner:secret@host/private');
    });
    const response = await app.inject('/test-failure');
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toMatch(/owner|secret|postgresql|stack/);
    expect(response.json()).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
  });

  it('returns only public Auth bootstrap configuration', async () => {
    const app = buildApp({
      logger: false,
      auth: {
        publicConfig: {
          supabaseUrl: 'https://project.supabase.co',
          supabasePublishableKey: 'sb_publishable_example',
        },
        verifier: { verify: async () => null },
      },
    });
    apps.push(app);

    const response = await app.inject('/v1/auth/config');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      supabaseUrl: 'https://project.supabase.co',
      supabasePublishableKey: 'sb_publishable_example',
    });
    expect(response.body).not.toMatch(/service.role|database|password|secret/i);
  });

  it('fails closed when account Auth is not configured', async () => {
    const app = buildApp({ logger: false });
    apps.push(app);

    expect((await app.inject('/v1/auth/config')).statusCode).toBe(503);
    expect(
      (
        await app.inject({
          url: '/v1/auth/session',
          headers: { authorization: 'Bearer unavailable-token' },
        })
      ).statusCode,
    ).toBe(503);
  });

  it('returns a server-validated self session without provider metadata', async () => {
    const identity = {
      authUserId: '11111111-1111-4111-8111-111111111111',
      email: 'player@example.test',
      emailVerified: true,
      hasVerifiedTotp: false,
      totpAuthenticated: false,
      sessionId: '22222222-2222-4222-8222-222222222222',
      aal: 'aal1',
      accessMode: 'standard' as const,
    } satisfies AuthIdentity & { accessMode: 'standard' };
    const app = buildApp({
      logger: false,
      auth: {
        publicConfig: {
          supabaseUrl: 'https://project.supabase.co',
          supabasePublishableKey: 'sb_publishable_example',
        },
        verifier: {
          verify: async (token) => (token === 'valid-session-token' ? identity : null),
        },
      },
      operators: { findActiveOperator: async () => null },
    });
    apps.push(app);

    const response = await app.inject({
      url: '/v1/auth/session',
      headers: { authorization: 'Bearer valid-session-token' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      authUserId: identity.authUserId,
      email: identity.email,
      emailVerified: identity.emailVerified,
      sessionId: identity.sessionId,
      aal: identity.aal,
      applicationRole: 'player',
    });
    expect(response.body).not.toMatch(/user_metadata|provider|refresh/i);
  });

  it('routes an assigned, unenrolled password session as operator without granting protected access', async () => {
    const authUserId = '11111111-1111-4111-8111-111111111111';
    const app = buildApp({
      auth: {
        publicConfig: {
          supabaseUrl: 'https://project.supabase.co',
          supabasePublishableKey: 'sb_publishable_example',
        },
        verifier: {
          verify: async () => ({
            authUserId,
            email: 'assigned@example.test',
            emailVerified: true,
            hasVerifiedTotp: false,
            totpAuthenticated: false,
            sessionId: null,
            aal: 'aal1',
            accessMode: 'standard',
          }),
        },
      },
      operators: { findActiveOperator: async () => ({ authUserId, permissions: [] }) },
    });
    apps.push(app);
    const headers = { authorization: 'Bearer assigned-password-token' };
    const self = await app.inject({ url: '/v1/auth/session', headers });
    expect(self.statusCode).toBe(200);
    expect(self.json()).toMatchObject({ applicationRole: 'operator', aal: 'aal1' });
    const protectedSession = await app.inject({ url: '/v1/operator/session', headers });
    expect(protectedSession.statusCode).toBe(403);
    expect(protectedSession.json()).toMatchObject({ error: { code: 'MFA_REQUIRED' } });
  });

  it('fails closed when the operator assignment store is unavailable', async () => {
    const auth = {
      publicConfig: {
        supabaseUrl: 'https://project.supabase.co',
        supabasePublishableKey: 'sb_publishable_example',
      },
      verifier: {
        verify: async () => ({
          authUserId: '11111111-1111-4111-8111-111111111111',
          email: 'player@example.test',
          emailVerified: true,
          hasVerifiedTotp: false,
          totpAuthenticated: false,
          sessionId: null,
          aal: 'aal1' as const,
          accessMode: 'standard' as const,
        }),
      },
    };
    const unavailableStore = buildApp({ auth });
    const failedStore = buildApp({
      auth,
      operators: {
        findActiveOperator: async () => {
          throw new Error('private database details');
        },
      },
    });
    apps.push(unavailableStore, failedStore);
    for (const app of [unavailableStore, failedStore]) {
      const response = await app.inject({
        url: '/v1/auth/session',
        headers: { authorization: 'Bearer valid-password-token' },
      });
      expect(response.statusCode).toBe(503);
      expect(response.body).not.toMatch(/private database details/i);
    }
  });

  it.each([undefined, '', 'Basic credentials', 'Bearer ', `Bearer ${'x'.repeat(8193)}`])(
    'rejects malformed bearer authorization %s',
    async (authorization) => {
      const app = buildApp({
        logger: false,
        auth: {
          publicConfig: {
            supabaseUrl: 'https://project.supabase.co',
            supabasePublishableKey: 'sb_publishable_example',
          },
          verifier: {
            verify: async () => {
              throw new Error('Malformed authorization reached the provider verifier');
            },
          },
        },
        operators: { findActiveOperator: async () => null },
      });
      apps.push(app);

      const response = await app.inject({
        url: '/v1/auth/session',
        ...(authorization === undefined ? {} : { headers: { authorization } }),
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: { code: 'AUTH_REQUIRED' } });
    },
  );

  it('requires MFA after confirming current operator access', async () => {
    const authUserId = '11111111-1111-4111-8111-111111111111';
    const app = buildApp({
      logger: false,
      auth: {
        publicConfig: {
          supabaseUrl: 'https://project.supabase.co',
          supabasePublishableKey: 'sb_publishable_example',
        },
        verifier: {
          verify: async () => ({
            authUserId,
            email: 'operator@example.test',
            emailVerified: true,
            hasVerifiedTotp: true,
            totpAuthenticated: true,
            sessionId: '22222222-2222-4222-8222-222222222222',
            aal: 'aal1',
            accessMode: 'standard' as const,
          }),
        },
      },
      operators: {
        findActiveOperator: async () => ({
          authUserId,
          permissions: ['feature_controls:read'],
        }),
      },
    });
    apps.push(app);

    const response = await app.inject({
      url: '/v1/operator/session',
      headers: { authorization: 'Bearer valid-aal1-token' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'MFA_REQUIRED' } });
  });

  it('does not let an aal2 player session confer operator access', async () => {
    const app = buildApp({
      logger: false,
      auth: {
        publicConfig: {
          supabaseUrl: 'https://project.supabase.co',
          supabasePublishableKey: 'sb_publishable_example',
        },
        verifier: {
          verify: async () => ({
            authUserId: '11111111-1111-4111-8111-111111111111',
            email: 'player@example.test',
            emailVerified: true,
            hasVerifiedTotp: false,
            totpAuthenticated: false,
            sessionId: '22222222-2222-4222-8222-222222222222',
            aal: 'aal2',
            accessMode: 'standard' as const,
          }),
        },
      },
      operators: { findActiveOperator: async () => null },
    });
    apps.push(app);

    const response = await app.inject({
      url: '/v1/operator/session',
      headers: { authorization: 'Bearer valid-player-aal2-token' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'OPERATOR_ACCESS_DENIED' } });
  });

  it('returns only scoped permissions for a current aal2 operator', async () => {
    const authUserId = '11111111-1111-4111-8111-111111111111';
    const app = buildApp({
      logger: false,
      auth: {
        publicConfig: {
          supabaseUrl: 'https://project.supabase.co',
          supabasePublishableKey: 'sb_publishable_example',
        },
        verifier: {
          verify: async () => ({
            authUserId,
            email: 'operator@example.test',
            emailVerified: true,
            hasVerifiedTotp: true,
            totpAuthenticated: true,
            sessionId: '22222222-2222-4222-8222-222222222222',
            aal: 'aal2',
            accessMode: 'standard' as const,
          }),
        },
      },
      operators: {
        findActiveOperator: async () => ({
          authUserId,
          permissions: ['feature_controls:read'],
        }),
      },
    });
    apps.push(app);

    const response = await app.inject({
      url: '/v1/operator/session',
      headers: { authorization: 'Bearer valid-operator-aal2-token' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      authUserId,
      aal: 'aal2',
      permissions: ['feature_controls:read'],
    });
    expect(response.body).not.toMatch(/email|sessionId|user_metadata|provider/i);
  });

  it.each([
    ['unverified email', false, true, true],
    ['missing verified TOTP', true, false, true],
    ['no TOTP challenge', true, true, false],
  ] as const)(
    'denies an assigned aal2 session with %s',
    async (_label, emailVerified, hasVerifiedTotp, totpAuthenticated) => {
      const authUserId = '11111111-1111-4111-8111-111111111111';
      const app = buildApp({
        auth: {
          publicConfig: {
            supabaseUrl: 'https://project.supabase.co',
            supabasePublishableKey: 'sb_publishable_example',
          },
          verifier: {
            verify: async () => ({
              authUserId,
              email: 'operator@example.test',
              emailVerified,
              hasVerifiedTotp,
              totpAuthenticated,
              sessionId: null,
              aal: 'aal2',
              accessMode: 'standard',
            }),
          },
        },
        operators: { findActiveOperator: async () => ({ authUserId, permissions: [] }) },
      });
      apps.push(app);
      const response = await app.inject({
        url: '/v1/operator/session',
        headers: { authorization: 'Bearer password-token' },
      });
      expect(response.statusCode).toBe(403);
    },
  );

  it.each(['aal1', 'aal2'] as const)(
    'denies %s recovery sessions before normal or operator authorization',
    async (aal) => {
      const authUserId = '11111111-1111-4111-8111-111111111111';
      let operatorLookups = 0;
      const recoveryIdentity = {
        authUserId,
        email: 'player@example.test',
        emailVerified: true,
        hasVerifiedTotp: true,
        totpAuthenticated: true,
        sessionId: '22222222-2222-4222-8222-222222222222',
        aal,
        accessMode: 'recovery' as const,
      } satisfies AuthIdentity & { accessMode: 'recovery' };
      const app = buildApp({
        logger: false,
        auth: {
          publicConfig: {
            supabaseUrl: 'https://project.supabase.co',
            supabasePublishableKey: 'sb_publishable_example',
          },
          verifier: { verify: async () => recoveryIdentity },
        },
        operators: {
          findActiveOperator: async () => {
            operatorLookups += 1;
            return { authUserId, permissions: ['feature_controls:read'] };
          },
        },
      });
      apps.push(app);

      for (const url of ['/v1/auth/session', '/v1/operator/session']) {
        const response = await app.inject({
          url,
          headers: { authorization: 'Bearer recovery-session-token' },
        });
        expect(response.statusCode).toBe(403);
        expect(response.json()).toMatchObject({
          error: { code: 'PASSWORD_UPDATE_REQUIRED' },
        });
      }
      expect(operatorLookups).toBe(0);
    },
  );

  it('rechecks provider factors and current assignment for an already issued token', async () => {
    const authUserId = '11111111-1111-4111-8111-111111111111';
    const payload = Buffer.from(
      JSON.stringify({
        sub: authUserId,
        exp: Math.floor(Date.now() / 1000) + 600,
        session_id: '22222222-2222-4222-8222-222222222222',
        aal: 'aal2',
        amr: [
          { method: 'password', timestamp: Math.floor(Date.now() / 1000) - 60 },
          { method: 'totp', timestamp: Math.floor(Date.now() / 1000) - 30 },
        ],
      }),
    ).toString('base64url');
    const token = `eyJhbGciOiJub25lIn0.${payload}.provider-signature`;
    let assigned = true;
    let factors: unknown = [{ factor_type: 'totp', status: 'verified' }];
    const verifier = createSupabaseAuthVerifier({
      supabaseUrl: 'https://project.supabase.co',
      publishableKey: 'sb_publishable_example',
      fetch: (async (_input, init) => {
        if (new Headers(init?.headers).get('authorization') !== `Bearer ${token}`)
          return new Response(null, { status: 401 });
        return Response.json({
          id: authUserId,
          email: 'operator@example.test',
          email_confirmed_at: '2026-09-13T12:00:00.000Z',
          factors,
          user_metadata: { operator: true },
        });
      }) as typeof fetch,
    });
    const app = buildApp({
      auth: {
        publicConfig: {
          supabaseUrl: 'https://project.supabase.co',
          supabasePublishableKey: 'sb_publishable_example',
        },
        verifier,
      },
      operators: {
        findActiveOperator: async () =>
          assigned ? { authUserId, permissions: ['feature_controls:read'] } : null,
      },
    });
    apps.push(app);
    const headers = { authorization: `Bearer ${token}` };

    expect((await app.inject({ url: '/v1/operator/session', headers })).statusCode).toBe(200);
    factors = [];
    const removedFactor = await app.inject({ url: '/v1/operator/session', headers });
    expect(removedFactor.statusCode).toBe(403);
    expect(removedFactor.json()).toMatchObject({ error: { code: 'MFA_REQUIRED' } });
    factors = [{ factor_type: 'totp', status: 'verified' }];
    assigned = false;
    expect((await app.inject({ url: '/v1/auth/session', headers })).json()).toMatchObject({
      applicationRole: 'player',
    });
    const suspended = await app.inject({ url: '/v1/operator/session', headers });
    expect(suspended.statusCode).toBe(403);
    expect(suspended.json()).toMatchObject({ error: { code: 'OPERATOR_ACCESS_DENIED' } });
  });
});
