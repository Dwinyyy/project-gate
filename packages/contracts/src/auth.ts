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
  required: ['authUserId', 'email', 'emailVerified', 'sessionId', 'aal'],
  properties: {
    authUserId: { type: 'string', format: 'uuid' },
    email: { type: ['string', 'null'], format: 'email' },
    emailVerified: { type: 'boolean' },
    sessionId: { type: ['string', 'null'], format: 'uuid' },
    aal: { enum: ['aal1', 'aal2'] },
  },
} as const;

export type SelfSession = FromSchema<typeof selfSessionSchema>;
