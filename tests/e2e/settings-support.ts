import type { APIRequestContext, Page, Route } from '@playwright/test';
import { db, mockRealtime, type Db } from './hermetic-journey';
import { cspAllowsFakeSupabase, FAKE_SUPABASE_URL } from './hermetic';
import { signUp } from './journey-steps';
import { expect, settle, test } from './support';

/**
 * What the settings specs share (a11y-settings.spec.ts, settings-flows.spec.ts):
 * a fresh account on the fake Supabase with a finished profile written
 * straight to its database, Settings' own routes run for real against it,
 * and a wait for the page to be ready.
 */

export const PASSWORD = 'correct-horse-battery-staple';

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

/** Settings' own routes run for real (against the fake); any other /api call is recorded and refused. */
export async function mockApi(page: Page): Promise<string[]> {
  const unexpected: string[] = [];
  const REAL = new Set(['/api/profile', '/api/account/export', '/api/account/delete']);
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route: Route) => {
      const url = new URL(route.request().url());
      if (REAL.has(url.pathname)) return route.fallback();
      const key = `${route.request().method()} ${url.pathname}`;
      unexpected.push(key);
      return route.fulfill({
        status: 501,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'e2e_unmocked', message: `${key} is not mocked in the settings specs` } }),
      });
    }
  );
  await mockRealtime(page);
  return unexpected;
}

/** A fresh account, signed in (ends on /onboarding). Returns its user id. */
export async function newAccount(page: Page, database: Db): Promise<string> {
  const email = `e2e-settings-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  await signUp(page, { email, password: PASSWORD, firstName: 'Avery' });
  const [profile] = await database.select<{ id: string }>('user_profiles', `select=id&email=eq.${encodeURIComponent(email)}`);
  expect(profile, 'a profile row was created for the new account').toBeTruthy();
  return profile.id;
}

/** A finished profile: every required answer, a homeowner with two dependents (the follow-up questions show). */
export async function seedProfile(database: Db, userId: string, over: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  await database.update('user_profiles', `id=eq.${userId}`, {
    has_completed_onboarding: true,
    onboarding_completed_at: now,
    financial_updated_at: now,
    state: 'Ohio',
    city: 'Columbus',
    age_range: '35_44',
    education_stage: 'some_college',
    employment_status: 'employed_full',
    occupation_category: 'healthcare',
    income_range: '50k_75k',
    filing_status: 'married_joint',
    housing_situation: 'own_mortgage',
    has_dependents: true,
    dependents_count: 2,
    dependent_age_bands: ['5_12'],
    debt_types: ['mortgage', 'student_loans'],
    top_financial_concerns: ['cost_of_living'],
    ...over,
  });
}

/** Signs a fresh account up, with the finished profile (plus `over`) in its row. */
export async function settingsAccount(page: Page, request: APIRequestContext, over: Record<string, unknown> = {}) {
  const unexpected = await mockApi(page);
  const database = db(request);
  const userId = await newAccount(page, database);
  await seedProfile(database, userId, over);
  return { unexpected, database, userId };
}

/** Opens /settings (or a section of it) and waits until every section, the avatar included, has rendered. */
export async function openSettings(page: Page, path = '', { complete = true } = {}) {
  await page.goto(`/settings${path}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible({ timeout: 30_000 });
  await settingsReady(page, { complete });
}

export async function settingsReady(page: Page, { complete = true } = {}) {
  const main = page.locator('main#main');
  for (const name of [/your household/i, /your experience/i, /your account/i]) {
    await expect(main.getByRole('heading', { level: 2, name })).toBeVisible();
  }
  // The household drawing (hidden from screen readers, who hear the caption) has loaded, and its caption is up.
  await expect(main.locator('[role="img"][aria-label^="Your household: "]')).toBeVisible();
  await expect(main.locator('p[aria-live="polite"]')).toHaveText(/\S/);
  // The saved profile is complete and unchanged.
  if (complete) await expect(main.getByText('No unsaved changes')).toBeVisible();
  await settle(page);
}

/** The save bar (glass, holding "Save Financial Profile"). */
export const saveBar = (page: Page) => page.locator('main#main [data-settings-overlay]');

/**
 * Where the focused element stands: whether its centre is on screen and is
 * the element itself (not a bar or toast drawn over it, WCAG 2.2 2.4.11), with
 * what covers it otherwise. Read two frames after the key, once scrolling has
 * settled.
 */
export async function focusedVisibility(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ name: string; inView: boolean; uncovered: boolean; cover: string; top: number; bottom: number }>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const el = document.activeElement as HTMLElement | null;
            if (!el || el === document.body) {
              resolve({ name: 'BODY', inView: false, uncovered: false, cover: '', top: 0, bottom: 0 });
              return;
            }
            const r = el.getBoundingClientRect();
            const x = r.left + r.width / 2;
            const y = r.top + r.height / 2;
            const inView = x >= 0 && y >= 0 && x < innerWidth && y < innerHeight;
            const hit = inView ? document.elementFromPoint(x, y) : null;
            const uncovered = !!hit && (hit === el || el.contains(hit));
            const cover = uncovered || !hit ? '' : `${hit.tagName.toLowerCase()}${hit.closest('nav')?.getAttribute('aria-label') ? ` in nav ${hit.closest('nav')!.getAttribute('aria-label')}` : ''}${hit.closest('[data-settings-overlay]') ? ' in the save bar' : ''}`;
            const name = (el.getAttribute('aria-label') || el.textContent || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 40);
            resolve({ name, inView, uncovered, cover, top: Math.round(r.top), bottom: Math.round(r.bottom) });
          })
        )
      )
  );
}
