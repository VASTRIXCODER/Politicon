import type { APIRequestContext, Page, Route } from '@playwright/test';
import { ANALYSIS, FEED, INSIGHT, mockRealtime, type Db } from './hermetic-journey';
import { cspAllowsFakeSupabase, FAKE_SUPABASE_URL } from './hermetic';
import { signUp } from './journey-steps';
import { expect, test } from './support';

/*
 * Shared by the specs that sign in hermetically to the pages App I
 * redesigned (a11y-app.spec.ts, app-interactions.spec.ts): the build check,
 * the AI routes answered in the browser, a fresh account, and a finished
 * profile with two analyses written straight to the fake database.
 */

/** Skips (locally) or fails (in CI) when the app isn't built against the fake Supabase. */
export async function requireHermeticBuild(request: APIRequestContext) {
  const csp = (await request.get('/robots.txt')).headers()['content-security-policy'];
  if (!cspAllowsFakeSupabase(csp)) {
    const how = `build with NEXT_PUBLIC_SUPABASE_URL=${FAKE_SUPABASE_URL} (see tests/e2e/hermetic.ts)`;
    if (process.env.CI) throw new Error(`The app under test isn't built against the fake Supabase: ${how}.`);
    test.skip(true, `Not built against the fake Supabase: ${how}`);
  }
  expect((await request.get(`${FAKE_SUPABASE_URL}/__e2e/health`)).ok(), 'the fake Supabase is up').toBe(true);
}

/** The AI routes these pages call, answered at once (the feed is ready); any other /api call is recorded. */
export async function mockAi(page: Page): Promise<string[]> {
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
      return json(route, { error: { code: 'e2e_unmocked', message: `${key} is not mocked for this spec` } }, 501);
    }
  );
  await mockRealtime(page);
  return unexpected;
}

/** A fresh account, signed in (ends on /onboarding). Returns its user id. */
export async function newAccount(page: Page, database: Db): Promise<string> {
  const email = `e2e-a11y-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  await signUp(page, { email, password: 'correct-horse-battery-staple', firstName: 'Avery' });
  const [profile] = await database.select<{ id: string }>('user_profiles', `select=id&email=eq.${encodeURIComponent(email)}`);
  expect(profile, 'a profile row was created for the new account').toBeTruthy();
  return profile.id;
}

/** A finished profile (a household the avatar can draw) and two analyses (one gain, one cost) for the ledger. */
export async function seedProfileAndAnalyses(database: Db, userId: string) {
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
