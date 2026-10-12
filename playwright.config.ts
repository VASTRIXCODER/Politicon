import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { FAKE_SERVICE_ROLE_KEY, FAKE_SUPABASE_PORT, FAKE_SUPABASE_URL, cspAllowsFakeSupabase } from './tests/e2e/hermetic';

/**
 * End-to-end tests (tests/e2e) run against a production build served by
 * `next start`, never the dev server, so they see the real headers (CSP),
 * middleware redirects, metadata routes and minified client bundles.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3201 NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder npm run build
 *   npx playwright test
 *
 * Playwright then starts two servers (or reuses ones already listening,
 * outside CI): an in-memory fake Supabase on port 3201
 * (tests/e2e/fake-supabase.mjs) and `next start -p 3200`. It does not build:
 * a build takes minutes, so it is a separate, explicit step.
 *
 * The build above points the app at the fake, so the signed-in journey runs
 * hermetically (tests/e2e/journey-hermetic.spec.ts: real pages, middleware
 * and non-AI API routes over the fake; the AI routes mocked in the browser).
 * Signed-out pages make no Supabase requests either way, and the tests block
 * every request to another host unless a test allows it (tests/e2e/support.ts).
 * Built against any other Supabase URL, every other spec still runs; the
 * hermetic journey skips (and fails in CI, which must build as above).
 *
 * Environment:
 *   E2E_PORT      port for `next start` (default 3200)
 *   E2E_FAKE_SUPABASE_PORT  port for the fake Supabase (default 3201; the build's URL must match)
 *   E2E_BASE_URL  test an already-running deployment instead (no server is started)
 *   E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, E2E_USER_EMAIL, E2E_USER_PASSWORD
 *                 enable the optional journey against a staging project
 *                 (tests/e2e/journey.spec.ts); see that file for how to build for it.
 */

const PORT = Number(process.env.E2E_PORT || 3200);
const baseURL = (process.env.E2E_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const CI = !!process.env.CI;

const hasBuild = existsSync(path.join(__dirname, '.next', 'BUILD_ID'));
const startCommand = hasBuild
  ? `npx next start -p ${PORT}`
  : `node -e "console.error('No production build in .next. Run npm run build first (see playwright.config.ts).'); process.exit(1)"`;

/** Whether the build in .next was made against the fake Supabase (its CSP lets pages reach it). */
function builtForFakeSupabase(): boolean {
  try {
    const manifest = JSON.parse(readFileSync(path.join(__dirname, '.next', 'routes-manifest.json'), 'utf8')) as {
      headers?: { headers: { key: string; value: string }[] }[];
    };
    const csp = manifest.headers?.flatMap((rule) => rule.headers).find((h) => h.key.toLowerCase() === 'content-security-policy');
    return cspAllowsFakeSupabase(csp?.value);
  } catch {
    return false;
  }
}
const hermeticBuild = builtForFakeSupabase();

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: CI
    ? [['github'], ['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Tests opt into reduced motion where they need it; the default is the OS default (no preference).
    locale: 'en-US',
    timezoneId: 'America/New_York',
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      // Tests tagged @phone only make sense on the phone project.
      grepInvert: /@phone/,
    },
    {
      // A 375px-wide phone (iPhone X/11 Pro/12 mini/13 mini class) in Chromium:
      // mobile viewport rules, touch, and a phone user agent.
      name: 'mobile',
      use: {
        ...devices['Pixel 5'],
        browserName: 'chromium',
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 3,
      },
      // Long, costly flows (the signed-in journey) run once, on desktop.
      grepInvert: /@desktop-only/,
    },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          // In-memory stand-in for Supabase's auth and REST APIs (used by the hermetic journey).
          command: 'node tests/e2e/fake-supabase.mjs',
          url: `${FAKE_SUPABASE_URL}/__e2e/health`,
          reuseExistingServer: !CI,
          timeout: 15_000,
          stdout: 'ignore',
          stderr: 'pipe',
          env: { FAKE_SUPABASE_PORT: String(FAKE_SUPABASE_PORT), FAKE_SUPABASE_SERVICE_ROLE_KEY: FAKE_SERVICE_ROLE_KEY },
        },
        {
          command: startCommand,
          // A metadata route: answers without touching Supabase or rendering a page.
          url: `${baseURL}/robots.txt`,
          reuseExistingServer: !CI,
          timeout: 60_000,
          stdout: 'ignore',
          stderr: 'pipe',
          env: {
            NEXT_TELEMETRY_DISABLED: '1',
            // NEXT_PUBLIC_* values are inlined at build time; these only cover
            // server code that reads them at runtime. Real values win when set.
            NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || (hermeticBuild ? FAKE_SUPABASE_URL : 'https://example.supabase.co'),
            NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'ci-placeholder',
            // The non-AI API routes the journey calls (/api/profile, /api/feedback)
            // use the service role; against the fake, its key. Never set otherwise,
            // so a staging build keeps the key from its own environment.
            ...(hermeticBuild ? { SUPABASE_SERVICE_ROLE_KEY: FAKE_SERVICE_ROLE_KEY } : {}),
          },
        },
      ],
});
