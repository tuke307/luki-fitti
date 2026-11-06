import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '.env.local') });

// Opt-in production-server mode (CI): runs the built api, email-worker and web
// (`next start` on :3100) instead of `yarn dev`. Set PLAYWRIGHT_PROD_SERVER=1.
const prodServer = process.env.PLAYWRIGHT_PROD_SERVER === '1';
const monorepoRoot = resolve(__dirname, '../..');

const devWebServer = {
  // Bring up the full dev stack (api + web + workers) via turbo from the
  // monorepo root. Locally reuses an already-running `yarn dev`; CI starts
  // fresh. Raise timeout if the cold start (turbo + next dev + api + prisma)
  // needs longer.
  command: 'yarn run dev',
  cwd: monorepoRoot,
  url: 'http://localhost:3000',
  reuseExistingServer: !process.env.CI,
  timeout: 180_000,
};

// Production-server mode: api and email-worker serve their built dist output,
// web serves `next start` on :3100. The tests still hit :3000, which a reverse
// proxy (Caddyfile.e2e) fronts — in production the /api rewrite is off, so
// /api/* must be proxied to the api just like the real deployment.
const prodWebServers = [
  {
    command: 'yarn workspace @luki-fitti/api start',
    cwd: monorepoRoot,
    url: 'http://localhost:3001/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  {
    command: 'yarn workspace @luki-fitti/email-worker start',
    cwd: monorepoRoot,
    port: 3002,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  {
    command: 'yarn workspace @luki-fitti/web next start --port 3100',
    cwd: monorepoRoot,
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
];

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  // 'line' prints `[n/total] [chromium] › …` per test in non-TTY CI logs.
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'html',
  webServer: prodServer ? prodWebServers : devWebServer,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    viewport: { width: 1920, height: 1080 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: 'mobile',
      testIgnore: /doc-screenshots\.spec\.ts/,
      use: {
        ...devices['iPhone 15 Pro'],
        defaultBrowserType: 'chromium',
      },
    },
  ],
});
