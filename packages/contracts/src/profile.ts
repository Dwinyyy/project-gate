import type { FromSchema } from 'json-schema-to-ts';
import { appearanceChoiceSchema } from './appearance.js';
import { meResponseSchema } from './character.js';

export const profileSchemaVersion = 1 as const;
export const profileRuleVersion = 'civilian-profile-v1' as const;

const uuid = {
  type: 'string',
  format: 'uuid',
  pattern:
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
} as const;
const reference = {
  ...uuid,
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
} as const;
const revision = { type: 'string', pattern: '^(0|[1-9][0-9]*)$' } as const;
const timestamp = { type: 'string', format: 'date-time' } as const;
const token = { type: 'string', pattern: '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$' } as const;
const scope = { const: 'profile.view' } as const;
const nil = { type: 'null' } as const;
const draftProperties = {
  visibility: { enum: ['private', 'limited', 'public'] },
  showFictionalAvatar: { type: 'boolean' },
  showRegistrationDate: { type: 'boolean' },
} as const;
const draftKeys = ['visibility', 'showFictionalAvatar', 'showRegistrationDate'] as const;

export const updateMyProfileInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['characterId', 'expectedRevision', ...draftKeys],
  properties: { characterId: uuid, expectedRevision: revision, ...draftProperties },
} as const;
export const issueProfileInvitationInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['characterId', 'expectedRevision', 'scope', 'mode'],
  properties: {
    characterId: uuid,
    expectedRevision: revision,
    scope,
    mode: { enum: ['generate', 'replace'] },
  },
} as const;
export const revokeProfileInvitationInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['characterId', 'expectedRevision'],
  properties: { characterId: uuid, expectedRevision: revision },
} as const;
export const withdrawProfileDisclosureInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['scope'],
  properties: { scope: { const: 'all-owned-profiles' } },
} as const;
export const resolveProfileInvitationInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['token'],
  properties: { token },
} as const;
export const civilianProfileResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'displayAlias', 'identityLabel'],
  properties: {
    schemaVersion: { const: profileSchemaVersion },
    displayAlias: { type: 'string' },
    identityLabel: { const: 'Civilian' },
    appearance: appearanceChoiceSchema,
    registrationDate: { type: 'string', format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  },
} as const;
const issuanceProperties = {
  invitationId: uuid,
  scope,
  issuedAt: timestamp,
  expiresAt: timestamp,
} as const;
const issuanceKeys = ['invitationId', 'scope', 'issuedAt', 'expiresAt'] as const;
const issuedInvitationMetadataSchema = {
  type: 'object',
  additionalProperties: false,
  required: issuanceKeys,
  properties: issuanceProperties,
} as const;
const profileInvitationMetadataSchema = {
  type: 'object',
  additionalProperties: false,
  required: [...issuanceKeys, 'status'],
  properties: { ...issuanceProperties, status: { enum: ['valid', 'expired', 'revoked'] } },
} as const;
const profileKeys = [
  ...draftKeys,
  'characterId',
  'characterRevision',
  'disclosureRevision',
  'publicReference',
  'preview',
  'invitation',
] as const;
const profileProperties = {
  ...draftProperties,
  characterId: uuid,
  characterRevision: revision,
  disclosureRevision: revision,
  preview: civilianProfileResponseSchema,
  invitation: { anyOf: [nil, profileInvitationMetadataSchema] },
} as const;
const ownedProfileSchema = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: profileKeys,
      properties: {
        ...profileProperties,
        visibility: { enum: ['private', 'limited'] },
        publicReference: nil,
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: profileKeys,
      properties: {
        ...profileProperties,
        visibility: { const: 'public' },
        publicReference: reference,
      },
    },
  ],
} as const;
const ownerKeys = [
  'schemaVersion',
  'ruleVersion',
  'mode',
  'status',
  'profile',
  'controls',
] as const;
const ownerProperties = {
  schemaVersion: { const: profileSchemaVersion },
  ruleVersion: { const: profileRuleVersion },
  mode: meResponseSchema.properties.mode,
  controls: {
    type: 'object',
    additionalProperties: false,
    required: ['canUpdate', 'canIssue', 'canRevoke', 'canWithdraw', 'sharingAvailable'],
    properties: {
      canUpdate: { type: 'boolean' },
      canIssue: { type: 'boolean' },
      canRevoke: { type: 'boolean' },
      canWithdraw: { type: 'boolean' },
      sharingAvailable: { type: 'boolean' },
    },
  },
} as const;
export const ownerProfileResponseSchema = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ownerKeys,
      properties: {
        ...ownerProperties,
        status: { const: 'available' },
        profile: ownedProfileSchema,
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ownerKeys,
      properties: {
        ...ownerProperties,
        status: { enum: ['no_living_profile', 'unsupported_official_id'] },
        profile: nil,
      },
    },
  ],
} as const;
const receiptKeys = [
  'operationId',
  'operation',
  'ruleVersion',
  'committedAt',
  'subject',
  'affectedProfileCount',
  'character',
  'invitation',
] as const;
const receiptProperties = {
  operationId: uuid,
  ruleVersion: { const: profileRuleVersion },
  committedAt: timestamp,
} as const;
const characterReceipt = {
  type: 'object',
  additionalProperties: false,
  required: ['characterId', 'characterRevision', 'disclosureRevision'],
  properties: { characterId: uuid, characterRevision: revision, disclosureRevision: revision },
} as const;
const characterReceiptProperties = {
  ...receiptProperties,
  subject: { const: 'character' },
  affectedProfileCount: { const: 1 },
  character: characterReceipt,
} as const;
const profileOperationReceiptSchema = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: receiptKeys,
      properties: {
        ...characterReceiptProperties,
        operation: { enum: ['profile.update', 'profile.invitation.revoke'] },
        invitation: nil,
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: receiptKeys,
      properties: {
        ...characterReceiptProperties,
        operation: { enum: ['profile.invitation.generate', 'profile.invitation.replace'] },
        invitation: issuedInvitationMetadataSchema,
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: receiptKeys,
      properties: {
        ...receiptProperties,
        operation: { const: 'profile.disclosure.withdraw' },
        subject: { const: 'account' },
        affectedProfileCount: { type: 'integer', minimum: 0 },
        character: nil,
        invitation: nil,
      },
    },
  ],
} as const;
const mutationKeys = ['schemaVersion', 'receipt', 'replayed', 'current'] as const;
const mutationProperties = {
  schemaVersion: { const: profileSchemaVersion },
  receipt: profileOperationReceiptSchema,
  replayed: { type: 'boolean' },
  current: ownerProfileResponseSchema,
} as const;
export const profileMutationResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: mutationKeys,
  properties: mutationProperties,
} as const;
const issueReceiptSchema = {
  type: 'object',
  additionalProperties: false,
  required: receiptKeys,
  properties: {
    ...characterReceiptProperties,
    operation: { enum: ['profile.invitation.generate', 'profile.invitation.replace'] },
    invitation: issuedInvitationMetadataSchema,
  },
} as const;
export const issueProfileInvitationResponseSchema = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: [...mutationKeys, 'tokenDelivery'],
      properties: {
        ...mutationProperties,
        receipt: issueReceiptSchema,
        replayed: { const: false },
        tokenDelivery: {
          type: 'object',
          additionalProperties: false,
          required: ['status', 'token'],
          properties: { status: { const: 'delivered' }, token },
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: [...mutationKeys, 'tokenDelivery'],
      properties: {
        ...mutationProperties,
        receipt: issueReceiptSchema,
        tokenDelivery: {
          type: 'object',
          additionalProperties: false,
          required: ['status'],
          properties: { status: { const: 'unavailable' } },
        },
      },
    },
  ],
} as const;
export const resolveProfileInvitationResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'profile', 'invitation'],
  properties: {
    schemaVersion: { const: profileSchemaVersion },
    profile: civilianProfileResponseSchema,
    invitation: {
      type: 'object',
      additionalProperties: false,
      required: ['scope', 'expiresAt'],
      properties: { scope, expiresAt: timestamp },
    },
  },
} as const;

export type ProfileVisibility = FromSchema<typeof updateMyProfileInputSchema>['visibility'];
export type ProfileDraft = Pick<
  UpdateMyProfileInput,
  'visibility' | 'showFictionalAvatar' | 'showRegistrationDate'
>;
export type UpdateMyProfileInput = FromSchema<typeof updateMyProfileInputSchema>;
export type IssueProfileInvitationInput = FromSchema<typeof issueProfileInvitationInputSchema>;
export type RevokeProfileInvitationInput = FromSchema<typeof revokeProfileInvitationInputSchema>;
export type WithdrawProfileDisclosureInput = FromSchema<
  typeof withdrawProfileDisclosureInputSchema
>;
export type ResolveProfileInvitationInput = FromSchema<typeof resolveProfileInvitationInputSchema>;
export type CivilianProfileResponse = FromSchema<typeof civilianProfileResponseSchema>;
export type IssuedInvitationMetadata = FromSchema<typeof issuedInvitationMetadataSchema>;
export type ProfileInvitationMetadata = FromSchema<typeof profileInvitationMetadataSchema>;
export type OwnerProfileResponse = FromSchema<typeof ownerProfileResponseSchema>;
export type ProfileOperationKind = ProfileOperationReceipt['operation'];
export type ProfileOperationReceipt = FromSchema<typeof profileOperationReceiptSchema>;
export type ProfileMutationResponse = FromSchema<typeof profileMutationResponseSchema>;
export type IssueProfileInvitationResponse = FromSchema<
  typeof issueProfileInvitationResponseSchema
>;
export type ResolveProfileInvitationResponse = FromSchema<
  typeof resolveProfileInvitationResponseSchema
>;
