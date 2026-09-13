import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { api: 'apps/api/src/index.ts', worker: 'apps/worker/src/index.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  outDir: 'dist/server',
  clean: true,
  sourcemap: false,
  splitting: false,
  noExternal: [/^@hunter-world\//],
});
