import type { Page } from '@playwright/test';
import { FAKE_HOST, FEED, db } from './hermetic-journey';
import { cardTitle, completeOnboarding, waitForFeed } from './journey-steps';
import { mockAi, newAccount, requireHermeticBuild, seedProfileAndAnalyses } from './signed-in';
import { MISSING_PATH, NOT_FOUND_H1, PUBLIC_PAGES, expect, test } from './support';

/**
 * Every page holds still for a visitor who asked it to (WCAG 2.3.3, 2.2.2):
 * with the OS "reduce motion" setting, and separately with the site's own
 * "Pause motion" control on (stored in localStorage, applied to <html
 * data-motion="paused"> before first paint; lib/motionScript.ts). For each
 * page, one second after its content is in:
 *
 *   - no finite animation is still running (an entrance, a reveal, a
 *     page-enter rise, a docket fan-in), and no infinite one is either;
 *   - no visible text sits inside a transparent (or nearly) ancestor, so
 *     nothing an animation would have faded in is left invisible.
 *
 * keyboard-motion.spec.ts holds the landing page to the same rule (and its
 * first frame); this spec covers the rest of the public pages and every
 * signed-in page, signed in hermetically as a11y-app.spec.ts is: a fresh
 * account on the fake Supabase, the AI routes answered in the browser. The
 * impact detail page is opened from a docket card's "View full impact", so
 * this also checks that the client-side page entrance and the card-to-hero
 * morph stand aside in both modes (app-interactions.spec.ts checks, with
 * motion allowed, that they finish clean). Needs a build against the fake
 * (tests/e2e/hermetic.ts) for the signed-in half; otherwise that half skips
 * locally and fails in CI.
 */

const MODES = ['reduce', 'pause'] as const;
type Mode = (typeof MODES)[number];

/** Public pages besides '/' (keyboard-motion.spec.ts), the reset page without a recovery session and the 404. */
const PUBLIC = [
  ...PUBLIC_PAGES.filter((p) => p.path !== '/'),
  { path: '/auth/reset', h1: /link expired/i },
  { path: MISSING_PATH, h1: NOT_FOUND_H1 },
];

async function useMode(page: Page, mode: Mode) {
  if (mode === 'reduce') {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    return;
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('pc-motion', 'paused');
    } catch {
      // Storage blocked: the attribute check below fails and says so.
    }
  });
}

/** Waits a second, then lists what still moves and what text is left transparent. */
async function expectStill(page: Page, mode: Mode, where: string) {
  if (mode === 'pause') await expect(page.locator('html'), `${where}: "Pause motion" applied`).toHaveAttribute('data-motion', 'paused');
  // Bounded like settle(): a font request that never answers must not hold the test.
  await page.evaluate(() =>
    Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 5_000))]),
  );
  await page.waitForTimeout(1_000);
  const { running, faded } = await page.evaluate(() => {
    const label = (el: Element) => {
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}`;
    };
    const running = document
      .getAnimations()
      .filter((a) => a.playState === 'running')
      .map((a) => {
        const target = (a.effect as KeyframeEffect | null)?.target;
        const kind =
          typeof CSSAnimation !== 'undefined' && a instanceof CSSAnimation
            ? `animation ${a.animationName}`
            : typeof CSSTransition !== 'undefined' && a instanceof CSSTransition
              ? `transition ${a.transitionProperty}`
              : 'script';
        const infinite = a.effect?.getComputedTiming().iterations === Infinity ? ', infinite' : '';
        return `${target ? label(target) : '?'} (${kind}${infinite})`;
      });

    // Visible text whose effective opacity (its own times every ancestor's) is under a half.
    const faded: string[] = [];
    const seen = new Set<Element>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || seen.has(el) || !node.textContent?.trim()) continue;
      seen.add(el);
      if (!el.getClientRects().length || getComputedStyle(el).visibility !== 'visible') continue;
      // Hidden on purpose: from everyone, from sight (screen-reader text), or a dimmed control that is off.
      if (el.closest('[aria-hidden="true"], .sr-only, [inert], [hidden], script, style, noscript, :disabled, [aria-disabled="true"]')) continue;
      let opacity = 1;
      for (let a: Element | null = el; a; a = a.parentElement) opacity *= Number(getComputedStyle(a).opacity);
      if (opacity < 0.5) faded.push(`${label(el)} "${node.textContent.trim().slice(0, 40)}" (opacity ${opacity.toFixed(2)})`);
    }
    return { running, faded };
  });
  expect(running, `${where}: animations still running a second after load`).toEqual([]);
  expect(faded, `${where}: text left transparent`).toEqual([]);
}

for (const mode of MODES) {
  const how = mode === 'reduce' ? 'with reduced motion' : 'with "Pause motion" on';

  test.describe(`motion audit ${how}`, () => {
    test(`every public page holds still ${how}`, async ({ page }) => {
      test.setTimeout(120_000);
      await useMode(page, mode);
      for (const { path, h1 } of PUBLIC) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible();
        await page.waitForLoadState('load');
        await expectStill(page, mode, path);
      }
    });

    test.describe('signed in', () => {
      test.use({ allowedHosts: [FAKE_HOST] });

      test.beforeEach(async ({ request }) => {
        await requireHermeticBuild(request);
      });

      test(`every signed-in page holds still ${how}`, async ({ page, request }) => {
        test.setTimeout(240_000);
        await useMode(page, mode);
        const unexpected = await mockAi(page);
        // My Impact asks for a summary of the analyses too (registered last, so it answers first).
        await page.route('**/api/cumulative-summary', (route) => route.fulfill({ json: { summary: 'Together, these policies are a small net gain.' } }));
        const database = db(request);
        const userId = await newAccount(page, database);

        // Onboarding, a few questions in (each question swaps in with its own entrance).
        await completeOnboarding(page, 4);
        await expect(page.getByRole('progressbar', { name: 'Profile setup progress' })).toHaveAttribute('aria-valuenow', '4');
        await expectStill(page, mode, '/onboarding (question 4)');

        await seedProfileAndAnalyses(database, userId);

        await page.goto('/dashboard');
        await expect(page.getByRole('heading', { level: 1, name: /^good (morning|afternoon|evening)/i })).toBeVisible({ timeout: 30_000 });
        await expect(await waitForFeed(page, 30_000)).toHaveCount(FEED.length);
        await expect(page.getByText('Loading your ledger…')).toHaveCount(0, { timeout: 30_000 });
        await expectStill(page, mode, '/dashboard');

        // The detail page by a client-side navigation from a card: no page entrance, no morph.
        const analyzed = page.locator('[data-feed-card]').filter({ has: page.getByRole('link', { name: /view full impact/i }) }).first();
        const title = await cardTitle(analyzed);
        await analyzed.getByRole('link', { name: /view full impact/i }).click();
        await expect(page).toHaveURL(/\/impact\/[^/]+$/);
        await expect(page.getByRole('heading', { level: 1 })).toContainText(title, { timeout: 30_000 });
        await expectStill(page, mode, '/impact/[id]');
        const tabs = page.getByRole('tablist', { name: 'Analysis sections' });
        const count = await tabs.getByRole('tab').count();
        for (let i = 1; i < count; i++) {
          const tab = tabs.getByRole('tab').nth(i);
          await tab.click();
          await expect(tab).toHaveAttribute('aria-selected', 'true');
          await expect(page.getByText('Loading chart…')).toHaveCount(0, { timeout: 30_000 });
          await expectStill(page, mode, `/impact/[id] ${(await tab.innerText()).trim()} tab`);
        }

        await page.goto('/policies');
        await expect(page.getByRole('heading', { level: 1, name: /your policies/i })).toBeVisible({ timeout: 30_000 });
        await expect(page.locator('[data-feed-card]')).toHaveCount(FEED.length, { timeout: 30_000 });
        await expectStill(page, mode, '/policies');

        await page.goto('/impact');
        await expect(page.getByRole('heading', { level: 1, name: /what it all adds up to/i })).toBeVisible({ timeout: 30_000 });
        await expect(page.locator('[data-receipt-line]')).toHaveCount(2, { timeout: 30_000 });
        await expect(page.getByText('Loading chart…')).toHaveCount(0, { timeout: 30_000 });
        await expectStill(page, mode, '/impact');

        await page.goto('/advisor');
        await expect(page.getByRole('heading', { level: 1, name: 'AI Policy Guide' })).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole('textbox', { name: 'Message the Policy Guide' })).toBeEditable({ timeout: 30_000 });
        await expectStill(page, mode, '/advisor');

        await page.goto('/settings');
        await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible({ timeout: 30_000 });
        await expect(page.locator('main#main [role="img"][aria-label^="Your household: "]')).toBeVisible({ timeout: 30_000 });
        await expectStill(page, mode, '/settings');

        expect(unexpected, 'API calls nothing answered').toEqual([]);
      });
    });
  });
}
