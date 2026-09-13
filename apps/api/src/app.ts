import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import {
  authConfigSchema,
  systemStatusSchema,
  errorResponseSchema,
  selfSessionSchema,
  type AuthConfig,
  type SelfSession,
  type SystemStatus,
} from '@hunter-world/contracts';
import type { AuthVerifier } from '@hunter-world/server';

export interface ApiOptions {
  logger?: boolean;
  database?: { ready(): Promise<boolean> };
  auth?: { publicConfig: AuthConfig; verifier: AuthVerifier };
}

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization || authorization.length > 8192) return null;
  const match = /^Bearer ([^\s,]+)$/.exec(authorization);
  return match?.[1] ?? null;
}

export function buildApp(options: ApiOptions = {}) {
  const app = Fastify({
    logger: options.logger
      ? {
          serializers: {
            req: (request: { method: string; url: string }) => ({
              method: request.method,
              path: request.url.split('?')[0],
            }),
          },
          redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
        }
      : false,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    bodyLimit: 32 * 1024,
    requestTimeout: 15000,
    trustProxy: false,
  });
  app.register(helmet);
  app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  app.register(swagger, { openapi: { info: { title: 'Hunter World API', version: '0.1.0' } } });
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id).header('cache-control', 'no-store');
  });
  app.setErrorHandler((error, request, reply) => {
    const statusCode =
      error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined;
    const status =
      typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500 ? statusCode : 500;
    const code =
      status === 429 ? 'RATE_LIMITED' : status < 500 ? 'INVALID_REQUEST' : 'INTERNAL_ERROR';
    // Driver messages and validation input can contain credentials or private state.
    if (status === 500)
      request.log.error({ event: 'request_failed', requestId: request.id }, 'Request failed');
    return reply.code(status).send({ error: { code, requestId: request.id } });
  });
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({ error: { code: 'NOT_FOUND', requestId: request.id } }),
  );
  app.get('/health/live', async () => ({ status: 'live' }));
  app.get('/health/ready', async (_request, reply) => {
    const ready = (await options.database?.ready().catch(() => false)) ?? false;
    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ready' : 'unavailable' });
  });
  app.get(
    '/v1/system/status',
    { schema: { response: { 200: systemStatusSchema } } },
    async (): Promise<SystemStatus> => ({
      name: 'Hunter World',
      release: 'foundation',
      serverTime: new Date().toISOString(),
      capabilities: { registration: false, characters: false, encounters: false, commerce: false },
    }),
  );
  app.get(
    '/v1/auth/config',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        response: { 200: authConfigSchema, 503: errorResponseSchema },
      },
    },
    async (request, reply) => {
      if (!options.auth) {
        return reply
          .code(503)
          .send({ error: { code: 'AUTH_UNAVAILABLE', requestId: request.id } });
      }
      return reply.code(200).send(options.auth.publicConfig);
    },
  );
  app.get(
    '/v1/auth/session',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        response: { 200: selfSessionSchema, 401: errorResponseSchema, 503: errorResponseSchema },
      },
    },
    async (request, reply) => {
      if (!options.auth) {
        return reply
          .code(503)
          .send({ error: { code: 'AUTH_UNAVAILABLE', requestId: request.id } });
      }
      const token = bearerToken(request.headers.authorization);
      if (!token) {
        return reply.code(401).send({ error: { code: 'AUTH_REQUIRED', requestId: request.id } });
      }
      const identity: SelfSession | null = await options.auth.verifier.verify(token);
      if (!identity) {
        return reply.code(401).send({ error: { code: 'AUTH_REQUIRED', requestId: request.id } });
      }
      return reply.code(200).send(identity);
    },
  );
  // No operator identity provider exists until Task 2.1. Deny every method and path.
  app.all(
    '/v1/operator/*',
    { schema: { hide: true, response: { 401: errorResponseSchema } } },
    async (request, reply) =>
      reply.code(401).send({ error: { code: 'OPERATOR_AUTH_REQUIRED', requestId: request.id } }),
  );
  return app;
}
