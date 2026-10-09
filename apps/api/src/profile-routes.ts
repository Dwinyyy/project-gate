import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  civilianProfileResponseSchema,
  errorResponseSchema,
  issueProfileInvitationInputSchema,
  issueProfileInvitationResponseSchema,
  ownerProfileResponseSchema,
  profileMutationResponseSchema,
  resolveProfileInvitationInputSchema,
  resolveProfileInvitationResponseSchema,
  revokeProfileInvitationInputSchema,
  updateMyProfileInputSchema,
  withdrawProfileDisclosureInputSchema,
  type CivilianProfileResponse,
  type IssuedInvitationMetadata,
  type IssueProfileInvitationInput,
  type IssueProfileInvitationResponse,
  type OwnerProfileResponse,
  type ProfileMutationResponse,
  type ProfileOperationReceipt,
  type ResolveProfileInvitationInput,
  type RevokeProfileInvitationInput,
  type UpdateMyProfileInput,
  type WithdrawProfileDisclosureInput,
} from '@hunter-world/contracts';
import type { ProfileFailureKind, ProfileStore } from '@hunter-world/database';
import type { AuthVerifier } from '@hunter-world/server';
import { verifyStandardIdentity } from './identity.js';

interface ProfileRouteOptions {
  auth?: AuthVerifier;
  profiles?: ProfileStore;
}

const operationHeaders = {
  type: 'object',
  required: ['idempotency-key'],
  properties: { 'idempotency-key': updateMyProfileInputSchema.properties.characterId },
} as const;
const errorSchemas = Object.fromEntries(
  [400, 401, 403, 404, 409, 413, 429, 503].map((status) => [status, errorResponseSchema]),
);

function failure(reply: FastifyReply, request: FastifyRequest, status: number, code: string) {
  return reply.code(status).send({ error: { code, requestId: request.id } });
}

async function authorize(
  request: FastifyRequest,
  reply: FastifyReply,
  options: ProfileRouteOptions,
): Promise<string | null> {
  if (!options.auth || !options.profiles) {
    failure(reply, request, 503, 'PROFILE_SERVICE_UNAVAILABLE');
    return null;
  }
  let verified;
  try {
    verified = await verifyStandardIdentity(request.headers.authorization, options.auth);
  } catch {
    failure(reply, request, 503, 'PROFILE_SERVICE_UNAVAILABLE');
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

const ownerFailures: Record<ProfileFailureKind, { status: number; code: string }> = {
  operator_only: { status: 403, code: 'OPERATOR_ONLY' },
  auth_ineligible: { status: 403, code: 'AUTH_INELIGIBLE' },
  account_restricted: { status: 403, code: 'ACCOUNT_RESTRICTED' },
  character_unavailable: { status: 403, code: 'CHARACTER_ACTION_UNAVAILABLE' },
  profile_unavailable: { status: 404, code: 'PROFILE_UNAVAILABLE' },
  sharing_unavailable: { status: 503, code: 'PROFILE_SHARING_UNAVAILABLE' },
  stale_revision: { status: 409, code: 'STALE_REVISION' },
  operation_conflict: { status: 409, code: 'OPERATION_CONFLICT' },
  invitation_exists: { status: 409, code: 'PROFILE_INVITATION_EXISTS' },
  invitation_missing: { status: 409, code: 'PROFILE_INVITATION_MISSING' },
  invalid_request: { status: 400, code: 'INVALID_REQUEST' },
};
function denied(
  reply: FastifyReply,
  request: FastifyRequest,
  kind: ProfileFailureKind,
  outward = false,
) {
  const mapped =
    outward && kind !== 'operator_only' && kind !== 'auth_ineligible' && kind !== 'invalid_request'
      ? { status: 404, code: 'SHARED_PROFILE_UNAVAILABLE' }
      : ownerFailures[kind];
  return failure(reply, request, mapped.status, mapped.code);
}
function serviceFailure(reply: FastifyReply, request: FastifyRequest) {
  request.log.error(
    { event: 'profile_service_failed', requestId: request.id },
    'Profile service failed',
  );
  return failure(reply, request, 503, 'PROFILE_SERVICE_UNAVAILABLE');
}

// AJV normally coerces primitives and removes additional properties. Check the
// raw parsed object first, before schema validation can change either.
function rawBody(fields: Record<string, 'string' | 'boolean'>, operation = false) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const body: unknown = request.body;
    if (
      (operation && typeof request.headers['idempotency-key'] !== 'string') ||
      body === null ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length !== Object.keys(fields).length ||
      Object.entries(fields).some(
        ([key, type]) => !Object.hasOwn(body, key) || typeof Reflect.get(body, key) !== type,
      )
    )
      return failure(reply, request, 400, 'INVALID_REQUEST');
  };
}
function profileCopy(value: CivilianProfileResponse): CivilianProfileResponse {
  return {
    schemaVersion: value.schemaVersion,
    displayAlias: value.displayAlias,
    identityLabel: value.identityLabel,
    ...(value.appearance
      ? {
          appearance: {
            catalogVersion: value.appearance.catalogVersion,
            presetId: value.appearance.presetId,
            skinToneId: value.appearance.skinToneId,
            hairStyleId: value.appearance.hairStyleId,
            hairColorId: value.appearance.hairColorId,
          },
        }
      : {}),
    ...(value.registrationDate !== undefined ? { registrationDate: value.registrationDate } : {}),
  };
}
function invitationCopy(value: IssuedInvitationMetadata): IssuedInvitationMetadata {
  return {
    invitationId: value.invitationId,
    scope: value.scope,
    issuedAt: value.issuedAt,
    expiresAt: value.expiresAt,
  };
}
function ownerCopy(value: OwnerProfileResponse): OwnerProfileResponse {
  const base = {
    schemaVersion: value.schemaVersion,
    ruleVersion: value.ruleVersion,
    mode: value.mode,
    controls: {
      canUpdate: value.controls.canUpdate,
      canIssue: value.controls.canIssue,
      canRevoke: value.controls.canRevoke,
      canWithdraw: value.controls.canWithdraw,
      sharingAvailable: value.controls.sharingAvailable,
    },
  };
  if (value.status !== 'available') return { ...base, status: value.status, profile: null };
  const profile = value.profile;
  const fields = {
    characterId: profile.characterId,
    characterRevision: profile.characterRevision,
    disclosureRevision: profile.disclosureRevision,
    showFictionalAvatar: profile.showFictionalAvatar,
    showRegistrationDate: profile.showRegistrationDate,
    preview: profileCopy(profile.preview),
    invitation: profile.invitation
      ? { ...invitationCopy(profile.invitation), status: profile.invitation.status }
      : null,
  };
  return {
    ...base,
    status: 'available',
    profile:
      profile.visibility === 'public'
        ? { ...fields, visibility: 'public', publicReference: profile.publicReference }
        : { ...fields, visibility: profile.visibility, publicReference: null },
  };
}
function receiptCopy(value: ProfileOperationReceipt): ProfileOperationReceipt {
  const base = {
    operationId: value.operationId,
    ruleVersion: value.ruleVersion,
    committedAt: value.committedAt,
  };
  if (value.operation === 'profile.disclosure.withdraw')
    return {
      ...base,
      operation: value.operation,
      subject: 'account',
      affectedProfileCount: value.affectedProfileCount,
      character: null,
      invitation: null,
    };
  const character = {
    characterId: value.character.characterId,
    characterRevision: value.character.characterRevision,
    disclosureRevision: value.character.disclosureRevision,
  };
  const fields = {
    ...base,
    subject: 'character' as const,
    affectedProfileCount: 1 as const,
    character,
  };
  if (value.operation === 'profile.update' || value.operation === 'profile.invitation.revoke')
    return { ...fields, operation: value.operation, invitation: null };
  if (value.invitation === null) throw new Error('Invalid invitation receipt');
  return { ...fields, operation: value.operation, invitation: invitationCopy(value.invitation) };
}
function mutationCopy(value: ProfileMutationResponse): ProfileMutationResponse {
  return {
    schemaVersion: value.schemaVersion,
    receipt: receiptCopy(value.receipt),
    replayed: value.replayed,
    current: ownerCopy(value.current),
  };
}
function issueCopy(value: IssueProfileInvitationResponse) {
  return {
    ...mutationCopy(value),
    tokenDelivery:
      value.tokenDelivery.status === 'delivered' && !value.replayed
        ? { status: 'delivered', token: value.tokenDelivery.token }
        : { status: 'unavailable' },
  };
}

export function registerProfileRoutes(app: FastifyInstance, options: ProfileRouteOptions): void {
  // A child plugin runs after the parent limiter has initialized its decorator.
  app.register(async (scoped) => {
    const actors = new WeakMap<FastifyRequest, string>();
    const actorLimit = scoped.createRateLimit({
      max: 20,
      timeWindow: '1 minute',
      keyGenerator: (request) => {
        const actor = actors.get(request);
        if (!actor) throw new Error('Verified profile actor required');
        return actor;
      },
    });
    async function mutationActor(request: FastifyRequest, reply: FastifyReply) {
      const actor = await authorize(request, reply, options);
      if (!actor) return null;
      actors.set(request, actor.toLowerCase());
      try {
        const result = await actorLimit(request);
        if (!result.isAllowed && result.isExceeded) {
          reply.header('retry-after', String(result.ttlInSeconds));
          failure(reply, request, 429, 'RATE_LIMITED');
          return null;
        }
      } catch {
        serviceFailure(reply, request);
        return null;
      }
      return actor;
    }
    const readConfig = { rateLimit: { max: 60, timeWindow: '1 minute' } };
    const writeConfig = { rateLimit: { max: 20, timeWindow: '1 minute' } };
    scoped.get(
      '/v1/me/profile',
      {
        config: readConfig,
        schema: { response: { 200: ownerProfileResponseSchema, ...errorSchemas } },
      },
      async (request, reply) => {
        const actor = await authorize(request, reply, options);
        if (!actor) return reply;
        try {
          const result = await options.profiles!.getOwner(actor);
          return result.kind === 'success'
            ? reply.code(200).send(ownerCopy(result.value))
            : denied(reply, request, result.kind);
        } catch {
          return serviceFailure(reply, request);
        }
      },
    );
    scoped.put<{ Body: UpdateMyProfileInput; Headers: { 'idempotency-key': string } }>(
      '/v1/me/profile',
      {
        bodyLimit: 1024,
        config: writeConfig,
        preValidation: rawBody(
          {
            characterId: 'string',
            expectedRevision: 'string',
            visibility: 'string',
            showFictionalAvatar: 'boolean',
            showRegistrationDate: 'boolean',
          },
          true,
        ),
        schema: {
          headers: operationHeaders,
          body: updateMyProfileInputSchema,
          response: { 200: profileMutationResponseSchema, ...errorSchemas },
        },
      },
      async (request, reply) => {
        const actor = await mutationActor(request, reply);
        if (!actor) return reply;
        try {
          const result = await options.profiles!.update(
            actor,
            request.body,
            request.headers['idempotency-key'].toLowerCase(),
          );
          return result.kind === 'success'
            ? reply.code(200).send(mutationCopy(result.value))
            : denied(reply, request, result.kind);
        } catch {
          return serviceFailure(reply, request);
        }
      },
    );
    scoped.post<{ Body: IssueProfileInvitationInput; Headers: { 'idempotency-key': string } }>(
      '/v1/me/profile/invitations',
      {
        bodyLimit: 1024,
        config: writeConfig,
        preValidation: rawBody(
          {
            characterId: 'string',
            expectedRevision: 'string',
            scope: 'string',
            mode: 'string',
          },
          true,
        ),
        schema: {
          headers: operationHeaders,
          body: issueProfileInvitationInputSchema,
          response: { 200: issueProfileInvitationResponseSchema, ...errorSchemas },
        },
      },
      async (request, reply) => {
        const actor = await mutationActor(request, reply);
        if (!actor) return reply;
        try {
          const result = await options.profiles!.issue(
            actor,
            request.body,
            request.headers['idempotency-key'].toLowerCase(),
          );
          return result.kind === 'success'
            ? reply.code(200).send(issueCopy(result.value))
            : denied(reply, request, result.kind);
        } catch {
          return serviceFailure(reply, request);
        }
      },
    );
    scoped.post<{ Body: RevokeProfileInvitationInput; Headers: { 'idempotency-key': string } }>(
      '/v1/me/profile/invitations/revoke',
      {
        bodyLimit: 1024,
        config: writeConfig,
        preValidation: rawBody({ characterId: 'string', expectedRevision: 'string' }, true),
        schema: {
          headers: operationHeaders,
          body: revokeProfileInvitationInputSchema,
          response: { 200: profileMutationResponseSchema, ...errorSchemas },
        },
      },
      async (request, reply) => {
        const actor = await mutationActor(request, reply);
        if (!actor) return reply;
        try {
          const result = await options.profiles!.revoke(
            actor,
            request.body,
            request.headers['idempotency-key'].toLowerCase(),
          );
          return result.kind === 'success'
            ? reply.code(200).send(mutationCopy(result.value))
            : denied(reply, request, result.kind);
        } catch {
          return serviceFailure(reply, request);
        }
      },
    );
    scoped.post<{ Body: WithdrawProfileDisclosureInput; Headers: { 'idempotency-key': string } }>(
      '/v1/me/profile/disclosure/withdraw',
      {
        bodyLimit: 1024,
        config: writeConfig,
        preValidation: rawBody({ scope: 'string' }, true),
        schema: {
          headers: operationHeaders,
          body: withdrawProfileDisclosureInputSchema,
          response: { 200: profileMutationResponseSchema, ...errorSchemas },
        },
      },
      async (request, reply) => {
        const actor = await mutationActor(request, reply);
        if (!actor) return reply;
        try {
          const result = await options.profiles!.withdraw(
            actor,
            request.body,
            request.headers['idempotency-key'].toLowerCase(),
          );
          return result.kind === 'success'
            ? reply.code(200).send(mutationCopy(result.value))
            : denied(reply, request, result.kind);
        } catch {
          return serviceFailure(reply, request);
        }
      },
    );
    scoped.get<{ Params: { publicReference: string } }>(
      '/v1/profiles/:publicReference',
      {
        config: readConfig,
        schema: {
          params: {
            type: 'object',
            required: ['publicReference'],
            properties: {
              publicReference: {
                ...updateMyProfileInputSchema.properties.characterId,
                pattern:
                  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
              },
            },
          },
          response: { 200: civilianProfileResponseSchema, ...errorSchemas },
        },
      },
      async (request, reply) => {
        const actor = await authorize(request, reply, options);
        if (!actor) return reply;
        try {
          const result = await options.profiles!.getPublic(
            actor,
            request.params.publicReference.toLowerCase(),
          );
          return result.kind === 'success'
            ? reply.code(200).send(profileCopy(result.value))
            : denied(reply, request, result.kind, true);
        } catch {
          return serviceFailure(reply, request);
        }
      },
    );
    scoped.post<{ Body: ResolveProfileInvitationInput }>(
      '/v1/profile-invitations/resolve',
      {
        bodyLimit: 1024,
        config: readConfig,
        preValidation: rawBody({ token: 'string' }),
        schema: {
          body: resolveProfileInvitationInputSchema,
          response: { 200: resolveProfileInvitationResponseSchema, ...errorSchemas },
        },
      },
      async (request, reply) => {
        const actor = await authorize(request, reply, options);
        if (!actor) return reply;
        try {
          const result = await options.profiles!.resolve(actor, request.body);
          return result.kind === 'success'
            ? reply.code(200).send({
                schemaVersion: result.value.schemaVersion,
                profile: profileCopy(result.value.profile),
                invitation: {
                  scope: result.value.invitation.scope,
                  expiresAt: result.value.invitation.expiresAt,
                },
              })
            : denied(reply, request, result.kind, true);
        } catch {
          return serviceFailure(reply, request);
        }
      },
    );
  });
}
