import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm dev:api',
      url: 'http://127.0.0.1:3001/health/live',
      reuseExistingServer: false,
    },
    { command: 'pnpm dev:player', url: 'http://127.0.0.1:5173', reuseExistingServer: false },
    { command: 'pnpm dev:operator', url: 'http://127.0.0.1:5174', reuseExistingServer: false },
  ],
});
