import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import { FAKE_HOST, FEED, INSIGHT, db } from './hermetic-journey';
import { completeOnboarding, waitForFeed } from './journey-steps';
import { mockAi, newAccount, requireHermeticBuild, seedProfileAndAnalyses } from './signed-in';
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

/**
 * Tabs through the whole page, forward and then back (backward is where a
 * control lands at the top of the viewport), and lists every focused control
 * the floating bar covers (WCAG 2.4.11, Focus Not Obscured): any point of it
 * where the bar's pill, not the control, is what's on top. Something drawn
 * over the bar (the skip link) isn't covered. A control taller than the room
 * under the bar only needs to show below it.
 */
async function focusUnderTheBar(page: Page): Promise<string[]> {
  const hidden: string[] = [];
  const check = async (key: 'Tab' | 'Shift+Tab', step: number) => {
    await page.keyboard.press(key);
    const r = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      const bar = document.querySelector('nav[aria-label="Main"] > div');
      if (!el || el === document.body || !bar || el.closest('nav')) return null;
      const box = el.getBoundingClientRect();
      const pill = bar.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return null;
      const name = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 60);
      const where = `${name} [${Math.round(box.top)}–${Math.round(box.bottom)} under a bar ending at ${Math.round(pill.bottom)}]`;
      if (box.height > window.innerHeight - pill.bottom - 16) return box.bottom > pill.bottom + 8 ? null : where;
      // Where the control and the pill overlap, is the pill on top anywhere?
      const x0 = Math.max(box.left, pill.left) + 1;
      const x1 = Math.min(box.right, pill.right) - 1;
      const y0 = Math.max(box.top, pill.top) + 1;
      const y1 = Math.min(box.bottom, pill.bottom) - 1;
      if (x1 < x0 || y1 < y0) return null;
      for (let i = 0; i <= 4; i++) {
        for (let j = 0; j <= 2; j++) {
          const hit = document.elementFromPoint(x0 + ((x1 - x0) * i) / 4, y0 + ((y1 - y0) * j) / 2);
          if (hit && bar.contains(hit) && !el.contains(hit)) return where;
        }
      }
      return null;
    });
    if (r) hidden.push(`${key} #${step}: ${r}`);
  };
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    (document.activeElement as HTMLElement | null)?.blur();
  });
  let steps = 0;
  for (; steps < 160; steps++) {
    await check('Tab', steps);
    if (await page.evaluate(() => document.activeElement === document.body)) break;
  }
  for (let i = 0; i < steps; i++) await check('Shift+Tab', i);
  return hidden;
}

test.describe('keyboard focus and the floating bar', () => {
  test.beforeEach(async ({ request }) => {
    await requireHermeticBuild(request);
  });

  for (const path of ['/dashboard', '/policies']) {
    test(`focus on ${path} never lands under the floating bar`, { tag: '@desktop-only' }, async ({ page, request }) => {
      test.setTimeout(150_000);
      const unexpected = await mockAi(page);
      const database = db(request);
      const userId = await newAccount(page, database);
      await seedProfileAndAnalyses(database, userId);
      await page.goto(`${path}?fx=0`);
      await expect(page.locator('[data-feed-card]')).toHaveCount(FEED.length, { timeout: 30_000 });
      await settle(page);
      // Short pages fit one screen: make room to scroll, so the walk has to.
      await page.setViewportSize({ width: 1280, height: 560 });
      expect(await focusUnderTheBar(page)).toEqual([]);
      expect(unexpected, 'API calls nothing answered').toEqual([]);
    });
  }
});

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
