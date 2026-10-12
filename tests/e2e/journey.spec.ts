import type { APIRequestContext } from '@playwright/test';
import { expect, test } from './support';
import {
  analyzeFromDashboard, askGuideAbout, cardTitle, completeOnboarding, expectDashboard, expectPrefilledQuestion, feedCard,
  openFullImpactAndReturn, signIn, signUp, waitForFeed, type Account,
} from './journey-steps';

/**
 * OPTIONAL signed-in journey against a real (staging) Supabase project and
 * the real model: sign up (or sign in) → onboarding → dashboard feed →
 * analyze a policy → its impact page → ask the AI Policy Guide about it.
 * CI runs the same steps hermetically instead (journey-hermetic.spec.ts);
 * this one checks a real deployment's wiring end to end.
 *
 * Skipped unless all of these are set:
 *   E2E_SUPABASE_URL       the staging project's URL (https://<ref>.supabase.co)
 *   E2E_SUPABASE_ANON_KEY  its anon key (used here only to check the test account)
 *   E2E_USER_EMAIL         a mailbox you control; the account is created on the first run
 *   E2E_USER_PASSWORD      its password (8+ characters)
 *
 * The app under test must be built and run against that same project, with
 * a working Anthropic key, since the feed, analysis and guide call Claude.
 * Either point the suite at a deployment:
 *
 *   E2E_BASE_URL=https://staging.example.com npx playwright test tests/e2e/journey.spec.ts --project=desktop
 *
 * or build and start one locally with the staging env (e.g. in .env.local:
 * NEXT_PUBLIC_SUPABASE_URL/ANON_KEY = the E2E values, SUPABASE_SERVICE_ROLE_KEY,
 * ANTHROPIC_API_KEY, RATE_LIMIT_SALT), then `npm run build && npx playwright test tests/e2e/journey.spec.ts --project=desktop`.
 *
 * If the project requires email confirmation, the first run stops at "Check
 * your inbox": confirm the address once and rerun; later runs sign in. Each
 * run may spend a few AI calls (feed, one analysis, one guide reply).
 */

const env = {
  supabaseUrl: process.env.E2E_SUPABASE_URL?.replace(/\/+$/, ''),
  anonKey: process.env.E2E_SUPABASE_ANON_KEY,
  email: process.env.E2E_USER_EMAIL,
  password: process.env.E2E_USER_PASSWORD,
};
const enabled = Boolean(env.supabaseUrl && env.anonKey && env.email && env.password);
const account: Account = { email: env.email ?? '', password: env.password ?? '' };

const FEED_TIMEOUT = 6 * 60_000; // feeds are built in the background (the dashboard polls for ~5 min)
const ANALYSIS_TIMEOUT = 7 * 60_000; // matches lib/analysisClient's wait
const REPLY_TIMEOUT = 3 * 60_000;

test.describe('signed-in journey (staging)', () => {
  test.skip(!enabled, 'Set E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, E2E_USER_EMAIL and E2E_USER_PASSWORD to run');
  test.use({ allowedHosts: enabled ? [new URL(env.supabaseUrl!).host] : [] });

  // Runs once, on desktop (it spends AI calls): the mobile project skips @desktop-only.
  test('sign up → onboarding → dashboard → analyze → guide', { tag: '@desktop-only' }, async ({ page, request }, testInfo) => {
    test.setTimeout(20 * 60_000);

    await test.step('the app is built against the E2E Supabase project', async () => {
      const csp = (await request.get('/robots.txt')).headers()['content-security-policy'] ?? '';
      expect(
        csp,
        `the app's CSP doesn't allow ${env.supabaseUrl}: build it with NEXT_PUBLIC_SUPABASE_URL=$E2E_SUPABASE_URL (see journey.spec.ts)`,
      ).toContain(new URL(env.supabaseUrl!).origin);
    });

    const existing = await test.step('check the test account', () => probeAccount(request));
    testInfo.annotations.push({ type: 'account', description: existing });

    if (existing === 'missing') {
      await test.step('sign up', () => signUp(page, account));
    } else {
      await test.step('sign in (the account already exists)', async () => {
        await signIn(page, account);
        await expect(page).toHaveURL(/\/(onboarding|dashboard)/, { timeout: 30_000 });
      });
    }

    if (new URL(page.url()).pathname.startsWith('/onboarding')) {
      await test.step('complete onboarding', () => completeOnboarding(page));
    } else {
      testInfo.annotations.push({ type: 'onboarding', description: 'already complete for this account; not repeated' });
    }

    await test.step('dashboard', () => expectDashboard(page));

    const card = await test.step('the policy feed loads', async () => {
      const cards = await waitForFeed(page, FEED_TIMEOUT);
      // Prefer a policy that hasn't been analyzed yet, so the analysis really runs.
      const fresh = cards.filter({ has: page.getByRole('button', { name: /analyze impact/i }) });
      return (await fresh.count()) ? fresh.first() : cards.first();
    });
    const title = await cardTitle(card);
    const sameCard = feedCard(page, title);

    await test.step(`analyze "${title}"`, () => analyzeFromDashboard(page, sameCard, ANALYSIS_TIMEOUT));
    await test.step('open the full impact page', () => openFullImpactAndReturn(page, sameCard, title));
    await test.step('ask the AI Policy Guide about it', () => askGuideAbout(page, sameCard, title, { feed: FEED_TIMEOUT, reply: REPLY_TIMEOUT }));
    await test.step('a question from the landing page is waiting in the composer', () => expectPrefilledQuestion(page));
  });
});

/** Whether the test account exists, using the Supabase auth API directly. */
async function probeAccount(request: APIRequestContext): Promise<'exists' | 'missing'> {
  const res = await request.post(`${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: env.anonKey!, 'content-type': 'application/json' },
    data: { email: env.email, password: env.password },
    failOnStatusCode: false,
  });
  if (res.ok()) return 'exists';
  const body = (await res.json().catch(() => ({}))) as { error_code?: string; msg?: string; error_description?: string };
  const code = body.error_code ?? '';
  if (code === 'email_not_confirmed') {
    throw new Error(`${env.email} is registered but not confirmed. Open the confirmation email once, then rerun.`);
  }
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(body.msg ?? body.error_description ?? '')) {
    return 'missing';
  }
  throw new Error(`Couldn't check the test account (${res.status()}): ${JSON.stringify(body)}`);
}
