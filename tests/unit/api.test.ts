import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../apps/api/src/app.js';

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
});
