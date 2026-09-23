import type { FromSchema } from 'json-schema-to-ts';

export const authConfigSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['supabaseUrl', 'supabasePublishableKey'],
  properties: {
    supabaseUrl: { type: 'string', format: 'uri' },
    supabasePublishableKey: { type: 'string', minLength: 1, maxLength: 4096 },
  },
} as const;

export type AuthConfig = FromSchema<typeof authConfigSchema>;

export const selfSessionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['authUserId', 'email', 'emailVerified', 'sessionId', 'aal', 'applicationRole'],
  properties: {
    authUserId: { type: 'string', format: 'uuid' },
    email: { type: ['string', 'null'], format: 'email' },
    emailVerified: { type: 'boolean' },
    sessionId: { type: ['string', 'null'], format: 'uuid' },
    aal: { enum: ['aal1', 'aal2'] },
    applicationRole: { enum: ['player', 'operator'] },
  },
} as const;

export type SelfSession = FromSchema<typeof selfSessionSchema>;

export const operatorSessionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['authUserId', 'aal', 'permissions'],
  properties: {
    authUserId: { type: 'string', format: 'uuid' },
    aal: { const: 'aal2' },
    permissions: {
      type: 'array',
      uniqueItems: true,
      items: { type: 'string', minLength: 3, maxLength: 80 },
    },
  },
} as const;

export type OperatorSession = FromSchema<typeof operatorSessionSchema>;
