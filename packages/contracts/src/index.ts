import type { FromSchema } from 'json-schema-to-ts';

export {
  appearanceCatalogVersion,
  appearanceCatalog,
  appearanceChoiceSchema,
  type AppearanceChoice,
} from './appearance.js';

export {
  authConfigSchema,
  operatorSessionSchema,
  selfSessionSchema,
  type AuthConfig,
  type OperatorSession,
  type SelfSession,
} from './auth.js';

export const systemStatusSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'release', 'serverTime', 'capabilities'],
  properties: {
    name: { const: 'Hunter World' },
    release: { const: 'foundation' },
    serverTime: { type: 'string', format: 'date-time' },
    capabilities: {
      type: 'object',
      additionalProperties: false,
      required: ['registration', 'characters', 'encounters', 'commerce'],
      properties: {
        registration: { const: false },
        characters: { const: false },
        encounters: { const: false },
        commerce: { const: false },
      },
    },
  },
} as const;

export type SystemStatus = FromSchema<typeof systemStatusSchema>;

export { OPERATOR_PATH } from './navigation.js';

export const errorResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'requestId'],
      properties: { code: { type: 'string' }, requestId: { type: 'string' } },
    },
  },
} as const;

export type ErrorResponse = FromSchema<typeof errorResponseSchema>;

export {
  meResponseSchema,
  characterCreationResponseSchema,
  type MeResponse,
  type CharacterCreationResponse,
  type CreateCharacterInput,
} from './character.js';
