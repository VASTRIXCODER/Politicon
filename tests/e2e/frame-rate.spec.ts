import type { Page } from '@playwright/test';
import { cspAllowsFakeSupabase, FAKE_SUPABASE_URL } from './hermetic';
import { FAKE_HOST, TARGET, TIMEOUTS, db, mockAiRoutes, mockRealtime } from './hermetic-journey';
import { analyzeFromDashboard, completeOnboarding, feedCard, signUp, waitForFeed, type Account } from './journey-steps';
import { expect, settle, test } from './support';

/**
 * The frame-rate probe every redesign phase is checked with: on a CPU slowed
 * 4×, the 95th-percentile frame time over 5 s must stay at or under 33 ms
 * (30 fps) on a tier-1 device, here the phone project (touch, DPR 3). It runs
 * on the landing page while it scrolls, on an impact page (the hermetic
 * journey's analysis, over the fake Supabase), and on /lab with the 3D stage
 * forced to tier 1 (WebGL in software, so this measures the main thread).
 *
 * It takes a few minutes and depends on the machine, so it runs on demand:
 *   E2E_PERF=1 npx playwright test frame-rate --project=mobile
 * Each result is printed and attached to the report as an annotation.
 */

const P95_BUDGET_MS = 33;
const PROBE_MS = 5_000;
/** CPU slowdown (E2E_PERF_CPU overrides it, e.g. 1 to see the machine's own baseline). */
const CPU_RATE = Number(process.env.E2E_PERF_CPU || 4);

test.skip(!process.env.E2E_PERF, 'On demand: E2E_PERF=1 npx playwright test frame-rate --project=mobile');
test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

/** Frame times (ms) over PROBE_MS at CPU_RATE× slowdown; `scroll` px are scrolled each frame. */
async function probe(page: Page, label: string, scroll = 0): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_RATE });
  let frames: number[];
  try {
    frames = await page.evaluate(
      ({ ms, step }) =>
        new Promise<number[]>((resolve) => {
          const out: number[] = [];
          let last = performance.now();
          const end = last + ms;
          const tick = (now: number) => {
            out.push(now - last);
            last = now;
            if (step) window.scrollBy(0, step);
            if (now < end) requestAnimationFrame(tick);
            else resolve(out);
          };
          requestAnimationFrame(tick);
        }),
      { ms: PROBE_MS, step: scroll },
    );
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
  const sorted = [...frames].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const summary = `${label} at ${CPU_RATE}× CPU: p95 ${p95.toFixed(1)} ms, median ${sorted[Math.floor(sorted.length / 2)].toFixed(1)} ms, ${frames.length} frames`;
  console.log(`frame-rate ${summary}`);
  test.info().annotations.push({ type: 'frame-rate', description: summary });
  return p95;
}

test('landing page, scrolling', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?fx=1');
  await expect(page.getByRole('heading', { level: 1, name: /your money\. real bills\. crystal clear\./i })).toBeVisible();
  await settle(page);
  expect(await probe(page, '/ (scrolling)', 6)).toBeLessThanOrEqual(P95_BUDGET_MS);
});

test('/lab with the 3D stage at tier 1', async ({ page }) => {
  test.setTimeout(180_000);
  const response = await page.goto('/lab?fx=1');
  test.skip(response?.status() === 404, '/lab is not served on the production deployment');
  await expect(page.locator('html')).toHaveAttribute('data-stage', 'ready', { timeout: 45_000 });
  // The night section: a dome, particles and the field's night mask, all live. (The lab has a
  // night pane in several sections now; this is the section of its own, as stage.spec.ts finds it.)
  const night = page.locator('section[aria-labelledby="lab-night"][data-scene-night]');
  await night.scrollIntoViewIfNeeded();
  await expect(night.locator('[data-scene-view]')).toHaveAttribute('data-scene-view', 'live', { timeout: 45_000 });
  expect(await probe(page, '/lab night section (tier 1)')).toBeLessThanOrEqual(P95_BUDGET_MS);
});

test.describe('signed in', () => {
  test.use({ allowedHosts: [FAKE_HOST] });

  test('an impact page', async ({ page, request }) => {
    test.setTimeout(4 * 60_000);
    const csp = (await request.get('/robots.txt')).headers()['content-security-policy'];
    test.skip(!cspAllowsFakeSupabase(csp), `Needs a build with NEXT_PUBLIC_SUPABASE_URL=${FAKE_SUPABASE_URL} (see tests/e2e/hermetic.ts)`);

    const database = db(request);
    const account: Account = {
      email: `e2e-perf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`,
      password: 'correct-horse-battery-staple',
      firstName: 'Avery',
    };
    let userId = '';
    await mockAiRoutes(page, database, () => userId);
    await mockRealtime(page);

    await signUp(page, account);
    const [profile] = await database.select<{ id: string }>('user_profiles', `select=id&email=eq.${encodeURIComponent(account.email)}`);
    userId = profile.id;
    await completeOnboarding(page);
    await waitForFeed(page, TIMEOUTS.feed);
    await analyzeFromDashboard(page, feedCard(page, TARGET.title), TIMEOUTS.analysis);

    await page.goto(`/impact/${encodeURIComponent(TARGET.id)}?fx=1`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(TARGET.title, { timeout: 60_000 });
    await settle(page);
    expect(await probe(page, '/impact/[policyId] (scrolling)', 4)).toBeLessThanOrEqual(P95_BUDGET_MS);
  });
});
