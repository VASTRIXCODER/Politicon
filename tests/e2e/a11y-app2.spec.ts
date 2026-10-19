import AxeBuilder from '@axe-core/playwright';
import type { APIRequestContext, Locator, Page, Route, TestInfo } from '@playwright/test';
import { ANALYSIS_SCHEMA_VERSION, coerceFullAnalysis } from '@/lib/analysisSchema';
import { classifyGuardrail, GUARDRAIL_REPLIES } from '@/lib/guardrails';
import type { FullAnalysis } from '@/types';
import { ANALYSIS, FAKE_HOST, FEED, GUIDE_DOLLAR_LINE, GUIDE_SUMMARY, INSIGHT, POLICY, db, mockRealtime, type Db } from './hermetic-journey';
import { cspAllowsFakeSupabase, FAKE_SUPABASE_URL } from './hermetic';
import { signUp } from './journey-steps';
import { expect, horizontalOverflow, settle, test } from './support';

/**
 * The signed-in pages App II redesigned against WCAG 2.2 AA with axe-core,
 * in the light and the dark theme, and with no sideways scroll on a 375px
 * phone: the impact detail page ("The Transmission", every one of its six
 * tabs), My Impact (the policy receipt and the skyline, at every horizon,
 * and the cumulative tab) and the AI Policy Guide ("The Chamber", with a
 * model reply and a guardrail seal card in the conversation).
 *
 * Signed in hermetically, as a11y-app.spec.ts is: a fresh account on the
 * fake Supabase, the AI routes answered in the browser in their real shapes.
 * A finished profile and two analyses go straight into the fake database:
 * a gain whose analysis has every field the Transmission draws (categories
 * with a cost among them, a month-by-month year, vulnerability scores,
 * spending categories, 1/3/5-year projections) and a cost. Needs a build
 * against the fake (tests/e2e/hermetic.ts); otherwise it skips locally and
 * fails in CI.
 */

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const BLOCKING = new Set(['serious', 'critical']);
const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

/** The detail page's tabs, by their accessible names (app/impact/[policyId]/_components/detailModel.ts). */
const DETAIL_TABS = ['Overview', 'Financial breakdown', 'Timeline', 'Economic context', 'Deep dive', 'Things to consider'];

const [GAIN, COST] = FEED;

/** The gain's analysis, with every field the Transmission's views draw (the journey's own fixture leaves most empty). */
const RICH: FullAnalysis = coerceFullAnalysis(
  {
    ...ANALYSIS,
    netAnnualImpact: 1010,
    netMonthlyImpact: 84,
    categoryImpacts: { taxes: 1200, healthcare: -240, education: 50 },
    timeline: {
      monthly: [90, 185, 275, 230, 330, 430, 525, 620, 720, 815, 910, 1010].map((impact, i) => ({ month: i + 1, impact })),
      year1: 1010,
      year3: 3240,
      year5: 5600,
    },
    vulnerability: { incomeStability: 38, housingSecurity: 52, employmentRisk: 24, costOfLivingPressure: 71, investmentExposure: 18, debtBurden: 46 },
    spendingVelocity: [
      { category: 'Groceries', dollarImpact: 12 },
      { category: 'Childcare', dollarImpact: 60 },
      { category: 'Health insurance', dollarImpact: -20 },
      { category: 'Transport', dollarImpact: 0 },
      { category: 'Utilities', dollarImpact: -6 },
      { category: 'Housing', dollarImpact: 8 },
    ],
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
  } as unknown as Record<string, unknown>,
  POLICY,
);

const COST_ANALYSIS: FullAnalysis = coerceFullAnalysis(
  {
    ...ANALYSIS,
    plainEnglishSummary: 'Rents in your area could rise a little while new supply is built.',
    netAnnualImpact: -340,
    netMonthlyImpact: -28,
    direction: 'negative',
    categoryImpacts: { housing: -340 },
    timeline: { year1: -340, year3: -900, year5: -1300 },
    record: COST.record,
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
  } as unknown as Record<string, unknown>,
  { ...POLICY, id: COST.id, title: COST.title, category: COST.category, governingBody: COST.billNumber!, record: COST.record },
);

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

/**
 * The AI routes these pages call, answered at once in their real shapes; any
 * other /api call is recorded. The guide answers a guardrail question with
 * its fixed reply, as the server does (lib/guardrails), and anything else
 * with a saved, ratable model reply.
 */
async function mockAi(page: Page): Promise<string[]> {
  const unexpected: string[] = [];
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const key = `${request.method()} ${url.pathname}`;
      if (url.pathname === '/api/profile' || url.pathname === '/api/feedback') return route.fallback();
      if (key === 'GET /api/policies/feed') return json(route, { policies: FEED, updatedAt: new Date().toISOString(), cached: true, failed: false });
      if (key === 'POST /api/insight') return json(route, { insight: INSIGHT, cached: false });
      if (key === 'POST /api/cumulative-summary') return json(route, { summary: 'Together, these policies are a small net gain.' });
      if (key === 'POST /api/advisor') {
        const body = request.postDataJSON() as { messages: { role: string; content: string }[]; policyId?: string };
        const last = body.messages[body.messages.length - 1]?.content ?? '';
        const guardrail = classifyGuardrail(last);
        if (guardrail) return json(route, { response: GUARDRAIL_REPLIES[guardrail], hasFullAnalysis: false, guardrail });
        return json(route, {
          response: `${GUIDE_SUMMARY}\n\n${GUIDE_DOLLAR_LINE}`, summary: GUIDE_SUMMARY, dollarLine: GUIDE_DOLLAR_LINE,
          policyId: GAIN.id, policyTitle: GAIN.title, category: GAIN.category, hasFullAnalysis: true,
        });
      }
      unexpected.push(key);
      return json(route, { error: { code: 'e2e_unmocked', message: `${key} is not mocked in a11y-app2.spec.ts` } }, 501);
    },
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

/** A fresh account, signed in, with a finished profile and the two analyses. Returns its user id. */
async function signedInWithAnalyses(page: Page, database: Db): Promise<string> {
  const email = `e2e-a11y2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  await signUp(page, { email, password: 'correct-horse-battery-staple', firstName: 'Avery' });
  const [profile] = await database.select<{ id: string }>('user_profiles', `select=id&email=eq.${encodeURIComponent(email)}`);
  expect(profile, 'a profile row was created for the new account').toBeTruthy();
  const now = new Date().toISOString();
  await database.update('user_profiles', `id=eq.${profile.id}`, {
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
  for (const [policy, analysis] of [[GAIN, RICH], [COST, COST_ANALYSIS]] as const) {
    await database.insert('analyzed_policies', {
      user_id: profile.id, policy_id: policy.id, policy_title: policy.title, category: policy.category, status: policy.status,
      bill_number: analysis.billNumber, direction: analysis.direction, confidence_score: analysis.confidenceScore,
      net_annual_impact: analysis.netAnnualImpact, net_monthly_impact: analysis.netMonthlyImpact, analysis,
      // Made after the profile was last changed, so the page doesn't call it out of date.
      profile_version: now, generation_status: 'ready',
    });
  }
  return profile.id;
}

/**
 * Waits until what's on screen is the real content: settle() only waits for
 * CSS and Web Animations, not for a code-split chart's chunk, so without this
 * axe and the overflow check would often audit the "Loading chart…"
 * skeletons instead of the charts.
 */
async function contentReady(page: Page) {
  await expect(page.getByText('Loading chart…')).toHaveCount(0, { timeout: 30_000 });
  await settle(page);
}

async function expectNoSeriousViolations(page: Page, testInfo: TestInfo, where: string) {
  const results = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    // Pure decoration (aria-hidden and marked data-decorative) is exempt from contrast (WCAG 1.4.3).
    .exclude('[aria-hidden="true"][data-decorative]')
    .options({ preload: false })
    .analyze();
  const minor = results.violations.filter((v) => !BLOCKING.has(v.impact ?? ''));
  if (minor.length) await testInfo.attach(`axe-minor-${where.replace(/\W+/g, '-')}.json`, { body: JSON.stringify(minor, null, 2), contentType: 'application/json' });
  const blocking = results.violations.filter((v) => BLOCKING.has(v.impact ?? ''));
  const summary = blocking.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help} ${v.helpUrl}\n` +
      v.nodes
        .slice(0, 5)
        .map((n) => `    ${n.target.join(' ')}: ${n.failureSummary?.split('\n').slice(1).join(' ').trim()}`)
        .join('\n'),
  );
  expect(blocking.map((v) => v.id), `${where}:\n${summary.join('\n')}`).toEqual([]);
}

/** Narrows to a 375px phone, unless the project already is one. */
async function at375(page: Page) {
  const viewport = page.viewportSize();
  if (viewport && viewport.width !== 375) await page.setViewportSize({ width: 375, height: 812 });
}

async function expectNoOverflow(page: Page, where: string) {
  const { overflow, culprits } = await horizontalOverflow(page);
  expect(overflow, `${where} scrolls sideways at 375px: ${culprits.join(', ')}`).toBe(0);
}

for (const theme of THEMES) {
  const suffix = theme === 'dark' ? ' (dark theme)' : '';

  test.describe(`App II pages${suffix}`, () => {
    test.beforeEach(async ({ request }) => {
      await requireHermeticBuild(request);
    });

    test(`the impact detail page, every tab, has no serious WCAG 2.2 AA violations and fits 375px${suffix}`, async ({ page, request }, testInfo) => {
      test.setTimeout(180_000);
      await useTheme(page, theme);
      const unexpected = await mockAi(page);
      await signedInWithAnalyses(page, db(request));

      await page.goto(`/impact/${encodeURIComponent(GAIN.id)}`);
      const h1 = page.getByRole('heading', { level: 1 });
      await expect(h1).toContainText(GAIN.title, { timeout: 30_000 });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const tabs = page.getByRole('tablist', { name: 'Analysis sections' });
      await expect(tabs.getByRole('tab')).toHaveCount(DETAIL_TABS.length);

      const eachTab = async (check: (name: string) => Promise<void>) => {
        for (const name of DETAIL_TABS) {
          const tab = tabs.getByRole('tab', { name });
          await tab.click();
          await expect(tab).toHaveAttribute('aria-selected', 'true');
          await expect(page.getByRole('tabpanel', { name })).toBeVisible();
          await contentReady(page);
          await check(name);
        }
      };

      // The hero says the net in words, with its sign, beside the 3D view.
      await expect(page.getByText('+$1,010 per year, saves you', { exact: false }).first()).toBeAttached();
      await eachTab((name) => expectNoSeriousViolations(page, testInfo, `/impact/[id] ${name}`));
      await at375(page);
      await eachTab((name) => expectNoOverflow(page, `/impact/[id] ${name}`));
      expect(unexpected, 'API calls nothing answered').toEqual([]);
    });

    test(`My Impact (receipt and skyline) has no serious WCAG 2.2 AA violations and fits 375px${suffix}`, async ({ page, request }, testInfo) => {
      test.setTimeout(150_000);
      await useTheme(page, theme);
      const unexpected = await mockAi(page);
      await signedInWithAnalyses(page, db(request));

      await page.goto('/impact');
      await expect(page.getByRole('heading', { level: 1, name: /what it all adds up to/i })).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const ready = async () => {
        await expect(page.locator('[data-receipt-line]')).toHaveCount(2, { timeout: 30_000 });
        await expect(page.getByRole('heading', { level: 2, name: /your policy receipt/i })).toBeVisible();
        await expect(page.getByRole('radiogroup', { name: 'Projection horizon' })).toBeVisible({ timeout: 30_000 });
        await contentReady(page);
      };
      await ready();

      const horizons = page.getByRole('radiogroup', { name: 'Projection horizon' });
      for (const horizon of ['1 year', '3 years', '5 years']) {
        await horizons.getByRole('radio', { name: horizon }).click();
        await expect(horizons.getByRole('radio', { name: horizon })).toHaveAttribute('aria-checked', 'true');
        await contentReady(page);
        await expectNoSeriousViolations(page, testInfo, `/impact skyline at ${horizon}`);
      }
      // A line's details open in place.
      await page.locator('[data-receipt-line]').first().getByRole('button', { name: /details/i }).click();
      await contentReady(page);
      await expectNoSeriousViolations(page, testInfo, '/impact with a line open');

      await at375(page);
      await ready();
      await expectNoOverflow(page, '/impact');

      // The cumulative tab.
      await page.getByRole('tab', { name: 'Cumulative analysis' }).click();
      await expect(page.getByRole('tabpanel', { name: 'Cumulative analysis' })).toBeVisible();
      await expect(page.getByText('Together, these policies are a small net gain.')).toBeVisible({ timeout: 30_000 });
      await contentReady(page);
      await expectNoOverflow(page, '/impact cumulative');
      await page.setViewportSize(testInfo.project.name === 'mobile' ? { width: 375, height: 812 } : { width: 1280, height: 800 });
      await contentReady(page);
      await expectNoSeriousViolations(page, testInfo, '/impact cumulative');
      expect(unexpected, 'API calls nothing answered').toEqual([]);
    });

    test(`the AI Policy Guide has no serious WCAG 2.2 AA violations and fits 375px${suffix}`, async ({ page, request }, testInfo) => {
      test.setTimeout(150_000);
      await useTheme(page, theme);
      const unexpected = await mockAi(page);
      await signedInWithAnalyses(page, db(request));

      await page.goto('/advisor');
      await expect(page.getByRole('heading', { level: 1, name: 'AI Policy Guide' })).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const composer = page.getByRole('textbox', { name: 'Message the Policy Guide' });
      const log = page.getByRole('log', { name: 'Conversation' });
      await expect(composer).toBeEditable({ timeout: 30_000 });
      await contentReady(page);
      await expectNoSeriousViolations(page, testInfo, '/advisor, new conversation');

      // A model reply (saved, so it can be rated) and a guardrail question's fixed reply.
      // The greeting is the guide's too, so count from what's there.
      const replies = log.getByText('Policy Guide said:');
      const before = await replies.count();
      await composer.fill(`Tell me about the financial impact of ${GAIN.title}`);
      await page.getByRole('button', { name: 'Send message' }).click();
      await expect(replies).toHaveCount(before + 1, { timeout: 15_000 });
      await expect(log.getByRole('button', { name: 'Helpful' }).first()).toBeVisible({ timeout: 30_000 });
      await composer.fill('Who should I vote for?');
      await page.getByRole('button', { name: 'Send message' }).click();
      await expect(replies).toHaveCount(before + 2, { timeout: 15_000 });
      await expect(log.getByText('The Policy Guide is typing…')).toHaveCount(0);
      await expect(log.getByRole('button', { name: 'Try again' })).toHaveCount(0);
      // Each of the two questions is in the log once (the greeting is the guide's own).
      await expect(log.getByText('You said:')).toHaveCount(2);
      await expect(log.getByText(GUARDRAIL_REPLIES.vote_advice.slice(0, 40), { exact: false })).toBeVisible();
      await contentReady(page);
      await expectNoSeriousViolations(page, testInfo, '/advisor, with replies');

      await at375(page);
      await contentReady(page);
      await expectNoOverflow(page, '/advisor');
      expect(unexpected, 'API calls nothing answered').toEqual([]);
    });
  });
}

/**
 * The Chamber on short screens (WCAG 1.4.10 Reflow, 1.4.4 Resize text): it
 * is fixed to the screen, with only the conversation scrolling, only when
 * the screen is tall enough. Held sideways, a phone keeps a real stretch of
 * conversation (not a sliver), and at 1280px zoomed to 400% (a 320×256
 * viewport) the page scrolls, by the wheel too, so the composer and the AI
 * disclaimer are always in reach.
 */
test.describe('App II: the Chamber reflows', () => {
  test.beforeEach(async ({ request }) => {
    await requireHermeticBuild(request);
  });

  test('keeps the conversation readable sideways and the composer in reach at 400% zoom @desktop-only', async ({ page, request }) => {
    test.setTimeout(120_000);
    const unexpected = await mockAi(page);
    await signedInWithAnalyses(page, db(request));

    await page.setViewportSize({ width: 812, height: 375 });
    await page.goto('/advisor');
    const composer = page.getByRole('textbox', { name: 'Message the Policy Guide' });
    const log = page.getByRole('log', { name: 'Conversation' });
    await expect(composer).toBeEditable({ timeout: 30_000 });
    await settle(page);
    const logHeight = await log.evaluate((el) => el.getBoundingClientRect().height);
    expect(logHeight, 'the conversation at 812×375').toBeGreaterThanOrEqual(375 * 0.4);
    // Scrolled to its foot, the page shows the conversation's end, the composer and the disclaimer together.
    await page.mouse.move(406, 30);
    await page.mouse.wheel(0, 2000);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    for (const [name, el] of [['composer', composer], ['log', log]] as const) {
      const box = await el.boundingBox();
      expect(box, name).not.toBeNull();
      expect(box!.y + box!.height, `${name} bottom at 812×375`).toBeLessThanOrEqual(375 + 1);
    }

    await page.setViewportSize({ width: 320, height: 256 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page);
    await page.mouse.move(160, 30);
    await page.mouse.wheel(0, 4000);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    const box = await composer.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y, 'composer top at 320×256').toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height, 'composer bottom at 320×256').toBeLessThanOrEqual(256 + 1);
    await expect(page.getByText('AI-generated estimate for education', { exact: false }).last()).toBeInViewport();
    await expectNoOverflow(page, '/advisor at 320×256');
    expect(unexpected, 'API calls nothing answered').toEqual([]);
  });
});

/**
 * Forced colours (Windows High Contrast) draw every border in the text
 * colour and drop the raised pill, so the violet rim no longer marks the
 * selected tab or the chosen reading level. There they take a 2px Highlight
 * rim and an underline (components/ui/Tabs.tsx TAB_FORCED_COLORS,
 * ReadingModeToggle), and the others don't.
 */
test.describe('App II in forced colours', () => {
  test.beforeEach(async ({ request }) => {
    await requireHermeticBuild(request);
  });

  test('the selected tab and the chosen reading level stand out from the rest @desktop-only', async ({ page, request }) => {
    test.setTimeout(120_000);
    const unexpected = await mockAi(page);
    await signedInWithAnalyses(page, db(request));
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    /** The rim's width and the text's decoration: "2px underline" marks the selected one. */
    const mark = (el: Locator) => el.evaluate((e) => `${getComputedStyle(e).borderTopWidth} ${getComputedStyle(e).textDecorationLine}`);

    await page.goto(`/impact/${encodeURIComponent(GAIN.id)}?fx=0`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(GAIN.title, { timeout: 30_000 });
    const sections = page.getByRole('tablist', { name: 'Analysis sections' });
    expect(await mark(sections.getByRole('tab', { selected: true }))).toBe('2px underline');
    expect(await mark(sections.getByRole('tab', { selected: false }).first())).toBe('1px none');
    const level = page.getByRole('group', { name: 'Reading level' }).first();
    expect(await mark(level.getByRole('button', { pressed: true }))).toBe('2px underline');
    expect(await mark(level.getByRole('button', { pressed: false }))).toBe('1px none');

    await page.goto('/impact?fx=0');
    await expect(page.getByRole('heading', { level: 1, name: /what it all adds up to/i })).toBeVisible({ timeout: 30_000 });
    const views = page.getByRole('tablist', { name: 'Impact views' });
    expect(await mark(views.getByRole('tab', { selected: true }))).toBe('2px underline');
    expect(await mark(views.getByRole('tab', { selected: false }))).toBe('1px none');
    expect(unexpected, 'API calls nothing answered').toEqual([]);
  });
});
