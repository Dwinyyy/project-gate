import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../apps/api/src/app.js';
import type { AuthIdentity } from '../../packages/server/src/auth.js';

const apps: FastifyInstance[] = [];
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
    const identity: AuthIdentity = {
      authUserId: '11111111-1111-4111-8111-111111111111',
      email: 'player@example.test',
      emailVerified: true,
      sessionId: '22222222-2222-4222-8222-222222222222',
      aal: 'aal1',
    };
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
    });
    apps.push(app);

    const response = await app.inject({
      url: '/v1/auth/session',
      headers: { authorization: 'Bearer valid-session-token' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(identity);
    expect(response.body).not.toMatch(/user_metadata|provider|refresh/i);
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
});
