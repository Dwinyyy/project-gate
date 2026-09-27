import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import {
  authConfigSchema,
  operatorSessionSchema,
  systemStatusSchema,
  errorResponseSchema,
  selfSessionSchema,
  type AuthConfig,
  type OperatorSession,
  type SelfSession,
  type SystemStatus,
} from '@hunter-world/contracts';
import type { AuthVerifier } from '@hunter-world/server';
import type { CharacterStore, OperatorAccessStore } from '@hunter-world/database';
import { registerCharacterRoutes } from './character-routes.js';
import { verifyStandardIdentity } from './identity.js';

export interface ApiOptions {
  logger?: boolean;
  database?: { ready(): Promise<boolean> };
  auth?: { publicConfig: AuthConfig; verifier: AuthVerifier };
  operators?: OperatorAccessStore;
  characters?: CharacterStore;
  revision?: string;
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
    if (options.revision) reply.header('x-hunter-revision', options.revision);
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
        return reply.code(503).send({ error: { code: 'AUTH_UNAVAILABLE', requestId: request.id } });
      }
      return reply.code(200).send(options.auth.publicConfig);
    },
  );
  registerCharacterRoutes(app, {
    ...(options.auth ? { auth: options.auth.verifier } : {}),
    ...(options.characters ? { characters: options.characters } : {}),
  });
  app.get(
    '/v1/auth/session',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        response: {
          200: selfSessionSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!options.auth || !options.operators) {
        return reply.code(503).send({ error: { code: 'AUTH_UNAVAILABLE', requestId: request.id } });
      }
      const verified = await verifyStandardIdentity(
        request.headers.authorization,
        options.auth.verifier,
      );
      if (verified.kind === 'invalid') {
        return reply.code(401).send({ error: { code: 'AUTH_REQUIRED', requestId: request.id } });
      }
      if (verified.kind === 'recovery') {
        return reply
          .code(403)
          .send({ error: { code: 'PASSWORD_UPDATE_REQUIRED', requestId: request.id } });
      }
      if (verified.kind === 'restricted') {
        return reply
          .code(403)
          .send({ error: { code: 'PASSWORD_SIGN_IN_REQUIRED', requestId: request.id } });
      }
      const identity = verified.identity;
      let operatorStatus;
      try {
        operatorStatus = await options.operators.findOperatorStatus(identity.authUserId);
      } catch {
        return reply.code(503).send({ error: { code: 'AUTH_UNAVAILABLE', requestId: request.id } });
      }
      if (operatorStatus === 'suspended') {
        return reply
          .code(403)
          .send({ error: { code: 'OPERATOR_SUSPENDED', requestId: request.id } });
      }
      const session: SelfSession = {
        authUserId: identity.authUserId,
        email: identity.email,
        emailVerified: identity.emailVerified,
        sessionId: identity.sessionId,
        aal: identity.aal,
        applicationRole: operatorStatus === 'active' ? 'operator' : 'player',
      };
      return reply.code(200).send(session);
    },
  );
  app.get(
    '/v1/operator/session',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        response: {
          200: operatorSessionSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!options.auth || !options.operators) {
        return reply
          .code(503)
          .send({ error: { code: 'OPERATOR_AUTH_UNAVAILABLE', requestId: request.id } });
      }
      const verified = await verifyStandardIdentity(
        request.headers.authorization,
        options.auth.verifier,
      );
      if (verified.kind === 'invalid') {
        return reply
          .code(401)
          .send({ error: { code: 'OPERATOR_AUTH_REQUIRED', requestId: request.id } });
      }
      if (verified.kind === 'recovery') {
        return reply
          .code(403)
          .send({ error: { code: 'PASSWORD_UPDATE_REQUIRED', requestId: request.id } });
      }
      if (verified.kind === 'restricted') {
        return reply
          .code(403)
          .send({ error: { code: 'PASSWORD_SIGN_IN_REQUIRED', requestId: request.id } });
      }
      const identity = verified.identity;
      let operator;
      try {
        operator = await options.operators.findActiveOperator(identity.authUserId);
      } catch {
        return reply
          .code(503)
          .send({ error: { code: 'OPERATOR_AUTH_UNAVAILABLE', requestId: request.id } });
      }
      if (!operator) {
        return reply
          .code(403)
          .send({ error: { code: 'OPERATOR_ACCESS_DENIED', requestId: request.id } });
      }
      if (!identity.emailVerified) {
        return reply
          .code(403)
          .send({ error: { code: 'OPERATOR_ACCESS_DENIED', requestId: request.id } });
      }
      if (identity.aal !== 'aal2' || !identity.hasVerifiedTotp || !identity.totpAuthenticated) {
        return reply.code(403).send({ error: { code: 'MFA_REQUIRED', requestId: request.id } });
      }
      const session: OperatorSession = {
        authUserId: identity.authUserId,
        aal: 'aal2',
        permissions: operator.permissions,
      };
      return reply.code(200).send(session);
    },
  );
  // Administrative tools remain closed until their permissioned routes are implemented.
  app.all(
    '/v1/operator/*',
    { schema: { hide: true, response: { 401: errorResponseSchema } } },
    async (request, reply) =>
      reply.code(401).send({ error: { code: 'OPERATOR_AUTH_REQUIRED', requestId: request.id } }),
  );
  return app;
}
