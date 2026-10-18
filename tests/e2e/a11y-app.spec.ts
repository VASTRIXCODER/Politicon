import AxeBuilder from '@axe-core/playwright';
import type { APIRequestContext, Page, Route, TestInfo } from '@playwright/test';
import { ANALYSIS, FAKE_HOST, FEED, INSIGHT, db, mockRealtime, type Db } from './hermetic-journey';
import { cspAllowsFakeSupabase, FAKE_SUPABASE_URL } from './hermetic';
import { completeOnboarding, signUp, waitForFeed } from './journey-steps';
import { expect, horizontalOverflow, settle, test } from './support';

/**
 * The signed-in pages App I redesigned (onboarding, the dashboard, /policies)
 * against WCAG 2.2 AA with axe-core, in the light and the dark theme, and
 * with no sideways scroll on a 375px phone. a11y.spec.ts covers the public
 * pages the same way.
 *
 * Signed in hermetically, as the journey is (journey-hermetic.spec.ts): a
 * fresh account on the fake Supabase, the AI routes answered in the browser.
 * The dashboard and /policies get a finished profile and two analyses
 * written straight to the fake database, so the household avatar, the ledger
 * and the docket all have real rows to draw. Needs a build against the fake
 * (tests/e2e/hermetic.ts); otherwise it skips locally and fails in CI.
 */

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const BLOCKING = new Set(['serious', 'critical']);
const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

test.use({ allowedHosts: [FAKE_HOST], contextOptions: { reducedMotion: 'reduce' } });

/** Skips (locally) or fails (in CI) when the app isn't built against the fake Supabase. */
async function requireHermeticBuild(request: APIRequestContext) {
  const csp = (await request.get('/robots.txt')).headers()['content-security-policy'];
  if (!cspAllowsFakeSupabase(csp)) {
    const how = `build with NEXT_PUBLIC_SUPABASE_URL=${FAKE_SUPABASE_URL} (see tests/e2e/hermetic.ts)`;
    if (process.env.CI) throw new Error(`The app under test isn't built against the fake Supabase: ${how}.`);
    test.skip(true, `Not built against the fake Supabase: ${how}`);
  }
  expect((await request.get(`${FAKE_SUPABASE_URL}/__e2e/health`)).ok(), 'the fake Supabase is up').toBe(true);
}

/** The AI routes these pages call, answered at once (the feed is ready); any other /api call is recorded. */
async function mockAi(page: Page): Promise<string[]> {
  const unexpected: string[] = [];
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url());
      const key = `${route.request().method()} ${url.pathname}`;
      if (url.pathname === '/api/profile' || url.pathname === '/api/feedback') return route.fallback();
      if (key === 'GET /api/policies/feed') return json(route, { policies: FEED, updatedAt: new Date().toISOString(), cached: true, failed: false });
      if (key === 'POST /api/insight') return json(route, { insight: INSIGHT, cached: false });
      unexpected.push(key);
      return json(route, { error: { code: 'e2e_unmocked', message: `${key} is not mocked in a11y-app.spec.ts` } }, 501);
    }
  );
  await mockRealtime(page);
  return unexpected;
}

async function useTheme(page: Page, theme: Theme) {
  if (theme === 'light') return;
  await page.addInitScript(() => {
    try {
      localStorage.setItem('pc-theme', 'dark');
    } catch {
      // Storage blocked: the page stays light and the theme check fails.
    }
  });
}

/** A fresh account, signed in (ends on /onboarding). Returns its user id. */
async function newAccount(page: Page, database: Db): Promise<string> {
  const email = `e2e-a11y-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  await signUp(page, { email, password: 'correct-horse-battery-staple', firstName: 'Avery' });
  const [profile] = await database.select<{ id: string }>('user_profiles', `select=id&email=eq.${encodeURIComponent(email)}`);
  expect(profile, 'a profile row was created for the new account').toBeTruthy();
  return profile.id;
}

/** A finished profile (a household the avatar can draw) and two analyses (one gain, one cost) for the ledger. */
async function seedProfileAndAnalyses(database: Db, userId: string) {
  const now = new Date().toISOString();
  await database.update('user_profiles', `id=eq.${userId}`, {
    has_completed_onboarding: true,
    onboarding_completed_at: now,
    financial_updated_at: now,
    state: 'Ohio',
    age_range: '35_44',
    income_range: '50k_75k',
    filing_status: 'married_joint',
    housing_situation: 'own_mortgage',
    has_dependents: true,
    dependents_count: 2,
    dependent_age_bands: ['5_12'],
    debt_types: ['mortgage', 'student_loans'],
    top_financial_concerns: ['cost_of_living'],
  });
  const [gain, cost] = FEED;
  await database.insert('analyzed_policies', {
    user_id: userId, policy_id: gain.id, policy_title: gain.title, category: gain.category, status: gain.status,
    net_annual_impact: 1200, net_monthly_impact: 100, direction: 'positive', analysis: ANALYSIS, generation_status: 'ready',
  });
  await database.insert('analyzed_policies', {
    user_id: userId, policy_id: cost.id, policy_title: cost.title, category: cost.category, status: cost.status,
    net_annual_impact: -340, net_monthly_impact: -28, direction: 'negative', analysis: { ...ANALYSIS, netAnnualImpact: -340 }, generation_status: 'ready',
  });
}

async function expectNoSeriousViolations(page: Page, testInfo: TestInfo) {
  const results = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    // Pure decoration (aria-hidden and marked data-decorative) is exempt from contrast (WCAG 1.4.3).
    .exclude('[aria-hidden="true"][data-decorative]')
    .options({ preload: false })
    .analyze();
  const minor = results.violations.filter((v) => !BLOCKING.has(v.impact ?? ''));
  if (minor.length) await testInfo.attach('axe-minor-violations.json', { body: JSON.stringify(minor, null, 2), contentType: 'application/json' });
  const blocking = results.violations.filter((v) => BLOCKING.has(v.impact ?? ''));
  const summary = blocking.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help} ${v.helpUrl}\n` +
      v.nodes
        .slice(0, 5)
        .map((n) => `    ${n.target.join(' ')}: ${n.failureSummary?.split('\n').slice(1).join(' ').trim()}`)
        .join('\n')
  );
  expect(blocking.map((v) => v.id), summary.join('\n')).toEqual([]);
}

/** No sideways scroll at 375px (the phone project is already that wide; the desktop one narrows to it). */
async function expectNoOverflowAt375(page: Page, ready: () => Promise<void>) {
  const viewport = page.viewportSize();
  if (viewport && viewport.width !== 375) {
    await page.setViewportSize({ width: 375, height: 812 });
    await ready();
  }
  const { overflow, culprits } = await horizontalOverflow(page);
  expect(overflow, `scrolls sideways at 375px: ${culprits.join(', ')}`).toBe(0);
}

for (const theme of THEMES) {
  const suffix = theme === 'dark' ? ' (dark theme)' : '';

  test.describe(`signed-in pages${suffix}`, () => {
    test.beforeEach(async ({ request }) => {
      await requireHermeticBuild(request);
    });

    test(`onboarding, mid-way, has no serious WCAG 2.2 AA violations and fits 375px${suffix}`, async ({ page, request }, testInfo) => {
      test.setTimeout(120_000);
      await useTheme(page, theme);
      const unexpected = await mockAi(page);
      await newAccount(page, db(request));
      await expect(page).toHaveURL((url) => url.pathname === '/onboarding');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      // Up to the dependents question (housing and debts answered: the diorama has a building, people and objects),
      // with "Yes" picked so its count and age choices show too.
      await completeOnboarding(page, 11);
      const main = page.locator('main#main');
      await expect(main.getByRole('heading', { level: 1 })).toContainText(/dependents/i);
      await main.getByRole('radiogroup').first().getByRole('radio', { name: 'Yes' }).click();
      await expect(main.getByRole('group')).toHaveCount(1);
      const ready = async () => {
        await settle(page);
        await expect(page.getByRole('progressbar', { name: 'Profile setup progress' })).toHaveAttribute('aria-valuenow', '11');
      };
      await ready();

      await expectNoSeriousViolations(page, testInfo);
      await expectNoOverflowAt375(page, ready);
      expect(unexpected, 'API calls nothing answered').toEqual([]);
    });

    test(`the dashboard has no serious WCAG 2.2 AA violations and fits 375px${suffix}`, async ({ page, request }, testInfo) => {
      test.setTimeout(120_000);
      await useTheme(page, theme);
      const unexpected = await mockAi(page);
      const database = db(request);
      const userId = await newAccount(page, database);
      await seedProfileAndAnalyses(database, userId);

      await page.goto('/dashboard');
      await expect(page.getByRole('heading', { level: 1, name: /^good (morning|afternoon|evening)/i })).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const ready = async () => {
        await expect(await waitForFeed(page, 30_000)).toHaveCount(FEED.length);
        // The ledger, with both analyses in it, and the household avatar beside the greeting.
        await expect(page.getByRole('heading', { level: 2, name: /your ledger/i })).toBeVisible();
        await expect(page.getByText('Loading your ledger…')).toHaveCount(0);
        await expect(page.getByRole('img', { name: /^your household: /i })).toBeVisible();
        await expect(page.getByText(INSIGHT).first()).toBeVisible();
        await settle(page);
      };
      await ready();

      await expectNoSeriousViolations(page, testInfo);
      await expectNoOverflowAt375(page, ready);
      expect(unexpected, 'API calls nothing answered').toEqual([]);
    });

    test(`/policies has no serious WCAG 2.2 AA violations and fits 375px${suffix}`, async ({ page, request }, testInfo) => {
      test.setTimeout(120_000);
      await useTheme(page, theme);
      const unexpected = await mockAi(page);
      const database = db(request);
      const userId = await newAccount(page, database);
      await seedProfileAndAnalyses(database, userId);

      await page.goto('/policies');
      await expect(page.getByRole('heading', { level: 1, name: /your policies/i })).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const ready = async () => {
        await expect(page.locator('[data-feed-card]')).toHaveCount(FEED.length, { timeout: 30_000 });
        await settle(page);
      };
      await ready();

      await expectNoSeriousViolations(page, testInfo);
      await expectNoOverflowAt375(page, ready);
      expect(unexpected, 'API calls nothing answered').toEqual([]);
    });
  });
}
