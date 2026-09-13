import { describe, expect, it } from 'vitest';
import { inspectPublicSource } from '../../scripts/lib/boundaries.js';

describe('public package import guard', () => {
  it.each([
    "import { rule } from '@hunter-world/server';",
    "export * from '@hunter-world/database';",
    "import '../../../server/src/secret.js';",
    "const x = import('../../../content/private/awakening.json');",
    "const x = require('@hunter-world/server');",
    'const x = import(variable);',
    "const x = import.meta.glob('../../../content/private/**');",
  ])('rejects private or unbounded dependencies: %s', (source) => {
    expect(inspectPublicSource('packages/client/src/file.ts', source)).not.toEqual([]);
  });
  it('permits approved public contracts and same-package modules', () => {
    expect(
      inspectPublicSource(
        'apps/player/src/features/file.tsx',
        "import type { SystemStatus } from '@hunter-world/contracts'; import '../styles.css';",
      ),
    ).toEqual([]);
  });
  it('permits node URL tooling only in build configuration outside the public source graph', () => {
    expect(
      inspectPublicSource(
        'apps/player/vite.config.ts',
        "import { fileURLToPath } from 'node:url';",
      ),
    ).toEqual([]);
  });
});
