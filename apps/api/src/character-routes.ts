import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  characterCreationResponseSchema,
  errorResponseSchema,
  meResponseSchema,
} from '@hunter-world/contracts';
import type { CharacterStore, CreateCharacterResult } from '@hunter-world/database';
import type { AuthVerifier } from '@hunter-world/server';
import { verifyStandardIdentity } from './identity.js';

interface CharacterRouteOptions {
  auth?: AuthVerifier;
  characters?: CharacterStore;
}

const uuidPattern =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
const createRequestSchema = {
  headers: {
    type: 'object',
    required: ['idempotency-key'],
    properties: { 'idempotency-key': { type: 'string', pattern: uuidPattern } },
  },
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['displayAlias'],
    properties: { displayAlias: { type: 'string', minLength: 1, maxLength: 40, pattern: '\\S' } },
  },
} as const;

function failure(reply: FastifyReply, request: FastifyRequest, status: number, code: string) {
  return reply.code(status).send({ error: { code, requestId: request.id } });
}

async function authorize(
  request: FastifyRequest,
  reply: FastifyReply,
  options: CharacterRouteOptions,
): Promise<string | null> {
  if (!options.auth || !options.characters) {
    failure(reply, request, 503, 'CHARACTER_SERVICE_UNAVAILABLE');
    return null;
  }
  let verified;
  try {
    verified = await verifyStandardIdentity(request.headers.authorization, options.auth);
  } catch {
    failure(reply, request, 503, 'CHARACTER_SERVICE_UNAVAILABLE');
    return null;
  }
  if (verified.kind === 'invalid') {
    failure(reply, request, 401, 'AUTH_REQUIRED');
    return null;
  }
  if (verified.kind === 'recovery') {
    failure(reply, request, 403, 'PASSWORD_UPDATE_REQUIRED');
    return null;
  }
  if (verified.kind === 'restricted') {
    failure(reply, request, 403, 'PASSWORD_SIGN_IN_REQUIRED');
    return null;
  }
  if (!verified.identity.emailVerified) {
    failure(reply, request, 403, 'EMAIL_VERIFICATION_REQUIRED');
    return null;
  }
  return verified.identity.authUserId;
}

function creationFailure(result: Exclude<CreateCharacterResult, { kind: 'created' }>) {
  switch (result.kind) {
    case 'operator_only':
      return { status: 403, code: 'OPERATOR_ONLY' };
    case 'auth_ineligible':
      return { status: 403, code: 'AUTH_INELIGIBLE' };
    case 'account_restricted':
      return { status: 403, code: 'ACCOUNT_RESTRICTED' };
    case 'disabled':
      return { status: 503, code: 'CHARACTER_CREATION_DISABLED' };
    case 'occupied':
      return { status: 409, code: 'CHARACTER_SLOT_OCCUPIED' };
    case 'cooldown':
      return { status: 409, code: 'CHARACTER_CREATION_COOLDOWN' };
    case 'operation_conflict':
      return { status: 409, code: 'OPERATION_CONFLICT' };
  }
}

export function registerCharacterRoutes(
  app: FastifyInstance,
  options: CharacterRouteOptions,
): void {
  app.get(
    '/v1/me',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        response: {
          200: meResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const authUserId = await authorize(request, reply, options);
      if (!authUserId) return reply;
      try {
        const result = await options.characters!.getMe(authUserId);
        if (result.kind === 'operator_only') return failure(reply, request, 403, 'OPERATOR_ONLY');
        if (result.kind === 'auth_ineligible')
          return failure(reply, request, 403, 'AUTH_INELIGIBLE');
        if (result.kind !== 'player')
          return failure(reply, request, 503, 'CHARACTER_SERVICE_UNAVAILABLE');
        return reply.code(200).send({
          schemaVersion: result.schemaVersion,
          mode: result.mode,
          character: result.character
            ? {
                id: result.character.id,
                displayAlias: result.character.displayAlias,
                lifeState: result.character.lifeState,
                awakeningState: result.character.awakeningState,
                presenceState: result.character.presenceState,
                profileVisibility: result.character.profileVisibility,
                revision: result.character.revision,
                createdAt: result.character.createdAt,
              }
            : null,
          creation: result.creation,
        });
      } catch {
        request.log.error(
          { event: 'character_read_failed', requestId: request.id },
          'Character read failed',
        );
        return failure(reply, request, 503, 'CHARACTER_SERVICE_UNAVAILABLE');
      }
    },
  );

  app.post<{ Headers: { 'idempotency-key': string }; Body: { displayAlias: string } }>(
    '/v1/characters',
    {
      bodyLimit: 1024,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      preValidation: (request, reply, done) => {
        const body = request.body;
        if (
          body &&
          typeof body === 'object' &&
          !Array.isArray(body) &&
          (Object.keys(body).some((key) => key !== 'displayAlias') ||
            (typeof body.displayAlias === 'string' && body.displayAlias.includes('\u0000')))
        ) {
          failure(reply, request, 400, 'INVALID_REQUEST');
        }
        done();
      },
      schema: {
        ...createRequestSchema,
        response: {
          201: characterCreationResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          409: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const authUserId = await authorize(request, reply, options);
      if (!authUserId) return reply;
      try {
        const result = await options.characters!.create(
          authUserId,
          request.body.displayAlias,
          request.headers['idempotency-key'].toLowerCase(),
        );
        if (result.kind === 'created') {
          return reply.code(201).send({
            characterId: result.characterId,
            operationId: result.operationId,
            createdAt: result.createdAt,
          });
        }
        if (result.kind === 'cooldown') {
          const delay = Math.ceil((Date.parse(result.notBefore) - Date.now()) / 1000);
          if (Number.isFinite(delay) && delay > 0) reply.header('retry-after', String(delay));
        }
        const denied = creationFailure(result);
        return failure(reply, request, denied.status, denied.code);
      } catch {
        request.log.error(
          { event: 'character_create_failed', requestId: request.id },
          'Character creation failed',
        );
        return failure(reply, request, 503, 'CHARACTER_SERVICE_UNAVAILABLE');
      }
    },
  );
}
