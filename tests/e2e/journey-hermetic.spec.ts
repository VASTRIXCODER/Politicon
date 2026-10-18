import { cspAllowsFakeSupabase, FAKE_SUPABASE_URL } from './hermetic';
import {
  FAKE_HOST, FEED, GUIDE_DOLLAR_LINE, INSIGHT, TARGET, TIMEOUTS, db, mockAiRoutes, mockRealtime,
} from './hermetic-journey';
import {
  analyzeFromDashboard, askGuideAbout, completeOnboarding, expectDashboard, expectPrefilledQuestion, feedCard,
  openFullImpactAndReturn, signUp, until, waitForFeed, type Account,
} from './journey-steps';
import { expect, test } from './support';

/**
 * The signed-in journey, hermetically, on every CI run:
 * sign up → onboarding → dashboard feed → analyze a policy → its impact page
 * → ask the AI Policy Guide about it → rate the reply → a landing-page question.
 *
 * What is real: every page, the middleware's session and onboarding checks,
 * the browser's Supabase calls, and the non-AI API routes the journey uses
 * (/api/profile saves onboarding, /api/feedback stores the rating), all over
 * the in-memory fake Supabase (tests/e2e/fake-supabase.mjs). The steps also
 * check what those writes left in the database.
 *
 * What is mocked, in the browser: the AI routes (/api/policies/feed,
 * /api/analyze, /api/insight, /api/advisor, /api/cumulative-summary), with
 * responses in their real shapes. Like the server, the analysis mock writes
 * its row to the database, which the dashboard and impact page then read.
 * Any other /api call fails the test, so a new dependency can't slip by
 * unmocked. (The routes themselves are unit-tested against a fake Messages
 * API; journey.spec.ts runs the whole thing against staging and the real model.)
 *
 * The fixtures and mocks live in hermetic-journey.ts (the frame-rate probe
 * uses them too). Needs a build against the fake: see tests/e2e/hermetic.ts.
 */

// ---------------------------------------------------------------------------
// The journey
// ---------------------------------------------------------------------------

test.describe('signed-in journey (hermetic)', () => {
  test.use({ allowedHosts: [FAKE_HOST] });

  // The mobile project skips @desktop-only: one run of the long flow is enough.
  test('sign up → onboarding → dashboard → analyze → impact → guide', { tag: '@desktop-only' }, async ({ page, request }) => {
    test.setTimeout(3 * 60_000);

    await test.step('the app is built against the fake Supabase', async () => {
      const csp = (await request.get('/robots.txt')).headers()['content-security-policy'];
      if (!cspAllowsFakeSupabase(csp)) {
        const how = `build with NEXT_PUBLIC_SUPABASE_URL=${FAKE_SUPABASE_URL} (see tests/e2e/hermetic.ts)`;
        // CI must run this journey; locally a build for another project just skips it.
        if (process.env.CI) throw new Error(`The app under test isn't built against the fake Supabase: ${how}.`);
        test.skip(true, `Not built against the fake Supabase: ${how}`);
      }
      expect((await request.get(`${FAKE_SUPABASE_URL}/__e2e/health`)).ok(), 'the fake Supabase is up').toBe(true);
    });

    const database = db(request);
    const account: Account = {
      email: `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`,
      password: 'correct-horse-battery-staple',
      firstName: 'Avery',
    };
    let userId = '';
    const ai = await mockAiRoutes(page, database, () => userId);
    await mockRealtime(page);

    await test.step('sign up', async () => {
      await signUp(page, account);
      const [profile] = await database.select<{ id: string; first_name: string; has_completed_onboarding: boolean; terms_version: string | null }>(
        'user_profiles',
        `select=id,first_name,has_completed_onboarding,terms_version&email=eq.${encodeURIComponent(account.email)}`,
      );
      expect(profile, 'a profile row was created for the new account').toBeTruthy();
      expect(profile).toMatchObject({ first_name: 'Avery', has_completed_onboarding: false });
      expect(profile.terms_version, 'the accepted terms version is recorded').toBeTruthy();
      userId = profile.id;
    });

    await test.step('signed in, the middleware sends app pages to onboarding first (not to sign-in)', async () => {
      await page.goto('/dashboard');
      await expect(page).toHaveURL((url) => url.pathname === '/onboarding');
    });

    await test.step('complete onboarding (saved through /api/profile)', async () => {
      await completeOnboarding(page);
      const [saved] = await database.select<Record<string, unknown>>(
        'user_profiles',
        `select=has_completed_onboarding,onboarding_completed_at,financial_updated_at,state,income_range,filing_status,top_financial_concerns&id=eq.${userId}`,
      );
      expect(saved.has_completed_onboarding).toBe(true);
      expect(saved.onboarding_completed_at).toBeTruthy();
      expect(saved.financial_updated_at).toBeTruthy();
      for (const field of ['state', 'income_range', 'filing_status']) expect(saved[field], field).toBeTruthy();
      expect(Array.isArray(saved.top_financial_concerns) && saved.top_financial_concerns.length > 0, 'concerns saved').toBe(true);
    });

    await test.step('dashboard', () => expectDashboard(page, account.firstName));

    await test.step('the policy feed loads (built in the background first)', async () => {
      const cards = await waitForFeed(page, TIMEOUTS.feed);
      await expect(cards).toHaveCount(FEED.length);
      expect(ai.feed, 'the dashboard polled while the feed was being built').toBeGreaterThanOrEqual(2);
    });

    const card = feedCard(page, TARGET.title);

    await test.step(`analyze "${TARGET.title}"`, async () => {
      await analyzeFromDashboard(page, card, TIMEOUTS.analysis);
      expect(ai.analyzeStart).toEqual([TARGET.id]);
      // Read back from the database through the policy_analyses view: the card shows the user's own figure.
      await expect(card.getByText('+$1,200/yr for you')).toBeVisible();
      await expect(card.getByText('Analyzed')).toBeVisible();
    });

    await test.step('open the full impact page', async () => {
      await openFullImpactAndReturn(page, card, TARGET.title);
      expect(ai.unexpected).toEqual([]);
    });

    await test.step('the dashboard totals and insight include the analysis', async () => {
      await expect(page.getByText(INSIGHT).first()).toBeVisible();
      expect(ai.insight).toBeGreaterThanOrEqual(1);
    });

    await test.step('ask the AI Policy Guide about it, and rate the reply', async () => {
      const log = await askGuideAbout(page, card, TARGET.title, TIMEOUTS);
      expect(ai.advisor).toEqual([{ policyId: TARGET.id, lastMessage: `Tell me about the financial impact of ${TARGET.title}` }]);
      await expect(log.getByText(GUIDE_DOLLAR_LINE)).toBeVisible();

      // The conversation was saved for this user.
      const sessions = await until('the saved conversation', 10_000, async () => {
        const found = await database.select<{ title: string; messages: { role: string }[] }>(
          'chat_sessions', `select=title,messages&user_id=eq.${userId}`,
        );
        return found.length && found[0].messages.length === 2 ? found : undefined;
      });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].title).toBe(TARGET.title);

      // Rating it goes through the real /api/feedback route.
      await log.getByRole('button', { name: 'Helpful' }).first().click();
      await expect(log.getByText(/thanks/i).first()).toBeVisible();
      const feedback = await database.select<{ target_type: string; rating: string }>(
        'ai_feedback', `select=target_type,rating&user_id=eq.${userId}`,
      );
      expect(feedback).toEqual([{ target_type: 'chat_reply', rating: 'up' }]);
    });

    await test.step('a question from the landing page is waiting in the composer', () => expectPrefilledQuestion(page));

    expect(ai.unexpected, 'API calls nothing answered').toEqual([]);
  });
});
