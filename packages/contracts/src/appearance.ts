import type { FromSchema } from 'json-schema-to-ts';

export const appearanceCatalogVersion = 1 as const;

export const appearanceCatalog = {
  presets: [
    { id: 'portrait-01', label: 'Portrait one' },
    { id: 'portrait-02', label: 'Portrait two' },
    { id: 'portrait-03', label: 'Portrait three' },
    { id: 'portrait-04', label: 'Portrait four' },
  ],
  skinTones: [
    { id: 'tone-01', label: 'Skin tone one' },
    { id: 'tone-02', label: 'Skin tone two' },
    { id: 'tone-03', label: 'Skin tone three' },
    { id: 'tone-04', label: 'Skin tone four' },
    { id: 'tone-05', label: 'Skin tone five' },
    { id: 'tone-06', label: 'Skin tone six' },
  ],
  hairStyles: [
    { id: 'cropped', label: 'Cropped hair' },
    { id: 'swept', label: 'Swept hair' },
    { id: 'curly', label: 'Curly hair' },
    { id: 'coiled', label: 'Coiled hair' },
    { id: 'shaved', label: 'Shaved hair' },
  ],
  hairColors: [
    { id: 'black', label: 'Black hair' },
    { id: 'brown', label: 'Brown hair' },
    { id: 'auburn', label: 'Auburn hair' },
    { id: 'blond', label: 'Blond hair' },
    { id: 'silver', label: 'Silver hair' },
  ],
} as const;

export const appearanceChoiceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['catalogVersion', 'presetId', 'skinToneId', 'hairStyleId', 'hairColorId'],
  properties: {
    catalogVersion: { const: appearanceCatalogVersion },
    presetId: { enum: ['portrait-01', 'portrait-02', 'portrait-03', 'portrait-04'] },
    skinToneId: { enum: ['tone-01', 'tone-02', 'tone-03', 'tone-04', 'tone-05', 'tone-06'] },
    hairStyleId: { enum: ['cropped', 'swept', 'curly', 'coiled', 'shaved'] },
    hairColorId: { enum: ['black', 'brown', 'auburn', 'blond', 'silver'] },
  },
} as const;

export type AppearanceChoice = FromSchema<typeof appearanceChoiceSchema>;
