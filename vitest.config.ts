import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'packages/**/*.test.ts'],
    exclude: ['tests/e2e/**', '**/node_modules/**'],
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
