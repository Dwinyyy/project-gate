import type { FromSchema } from 'json-schema-to-ts';

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
