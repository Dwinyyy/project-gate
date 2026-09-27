import type { FromSchema } from 'json-schema-to-ts';

export const meResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'character', 'creation'],
  properties: {
    schemaVersion: { const: 1 },
    character: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: [
            'id',
            'displayAlias',
            'lifeState',
            'awakeningState',
            'presenceState',
            'profileVisibility',
            'createdAt',
          ],
          properties: {
            id: { type: 'string', format: 'uuid' },
            displayAlias: { type: 'string' },
            lifeState: { enum: ['alive', 'incapacitated'] },
            awakeningState: { enum: ['unawakened', 'awakened'] },
            presenceState: { enum: ['sheltered', 'active', 'committed'] },
            profileVisibility: { enum: ['private', 'limited', 'public'] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      ],
    },
    creation: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'notBefore'],
      properties: {
        status: { enum: ['available', 'occupied', 'cooldown', 'feature_disabled'] },
        notBefore: { type: ['string', 'null'], format: 'date-time' },
      },
    },
  },
} as const;

export type MeResponse = FromSchema<typeof meResponseSchema>;

export const characterCreationResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['characterId', 'operationId', 'createdAt'],
  properties: {
    characterId: { type: 'string', format: 'uuid' },
    operationId: { type: 'string', format: 'uuid' },
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const;

export type CharacterCreationResponse = FromSchema<typeof characterCreationResponseSchema>;
