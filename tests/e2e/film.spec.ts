import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { PUBLIC_PAGES, expect, horizontalOverflow, test } from './support';

// The pinned landing film (components/landing/film/FilmStage). Every other
// spec sees the static five-panel sequence: headless Chromium renders WebGL
// in software, which lib/three/tier.ts treats as tier 0. Here a software GL
// backend is switched on and the page forces tier 1 with ?fx=1 (honoured
// outside production; the lighter tier, since every frame is drawn on the
// CPU), so the film pins. Its words, the rail, focus, layout and contrast
// are checked at every shot's resting point; the 3D scene itself is
// stage.spec's business (here it may still be loading).
test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const STEP_TITLES = [/it starts with a real bill/i, /legal text, in plain words/i, /then it meets your household/i, /it resolves into your number/i, /and then, you decide/i];
/** Where each shot comes to rest (filmShots STILL_PROGRESS, which the rail jumps to). */
const REST = [0.12, 0.35, 0.5, 0.755, 0.985];

async function openFilm(page: Page) {
  await page.goto('/?fx=1');
  await expect(page.getByRole('heading', { level: 1, name: PUBLIC_PAGES[0].h1 })).toBeVisible();
  // The film's code loads once the tier is known (idle time, after hydration).
  await expect(page.locator('[data-film-mode="film"]')).toHaveCount(1, { timeout: 60_000 });
}

/** Scrolls straight to a shot's resting point, and waits for its caption to be the one up. */
async function scrollFilm(page: Page, shot: number) {
  await page.evaluate((p) => {
    const track = document.querySelector<HTMLElement>('[data-film-mode="film"] [style*="--film-shots"]');
    const stage = track?.firstElementChild as HTMLElement | null;
    if (!track || !stage) throw new Error('no film track');
    const top = track.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top + p * (track.offsetHeight - stage.offsetHeight));
  }, REST[shot]);
  // The page renders on a CPU shared with the software-drawn scene: give it time.
  await expect(page.locator(`#how-it-works [data-film-step="${shot}"] > [data-state="active"]`)).toHaveCount(1, { timeout: 30_000 });
  await page.waitForTimeout(700);
}

/** The step caption that is on screen (not inert, not hidden). */
const activeCaption = (page: Page) => page.locator('#how-it-works [data-film-step] > [data-state="active"]');

function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('not rendered');
  return b;
}

test.describe('the pinned film', () => {
  test.slow();

  test('reads every step to assistive tech, one caption on screen at a time', async ({ page }) => {
    await openFilm(page);
    const section = page.locator('#how-it-works');
    for (const shot of REST.keys()) {
      await scrollFilm(page, shot);
      // One caption up; the other four hidden from sight, focus and the accessibility tree.
      await expect(activeCaption(page)).toHaveCount(1);
      await expect(page.locator('#how-it-works [data-film-step] > [data-state]:not([inert])')).toHaveCount(1);
      await expect(page.locator(`#how-it-works [data-film-step="${shot}"] > [data-state="active"]`)).toBeVisible();
      // …and all five steps still read in order, each a heading: the four off
      // screen as text in their place.
      const tree = await section.ariaSnapshot();
      let at = -1;
      for (const title of STEP_TITLES) {
        const next = tree.search(title);
        expect(next, `${title} in the film's reading order at shot ${shot + 1}`).toBeGreaterThan(at);
        at = next;
      }
      await expect(section.getByRole('heading', { level: 3 })).toHaveCount(STEP_TITLES.length);
      // The single sign-up link of its kind stays the hero's.
      await expect(page.getByRole('link', { name: /get my impact report/i })).toHaveCount(1);
    }
  });

  test('jumps with the rail from the keyboard, and focus follows to the step', async ({ page }) => {
    await openFilm(page);
    await scrollFilm(page, 0);
    const rail = page.getByRole('navigation', { name: 'Jump to a step' });
    // The rail comes before the captions in the reading order.
    const railFirst = await page.evaluate(() => {
      const nav = document.querySelector('#how-it-works nav');
      const list = document.querySelector('#how-it-works ol');
      return !!nav && !!list && !!(nav.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(railFirst, 'rail before the captions').toBe(true);

    const last = rail.getByRole('button', { name: 'You decide' });
    await last.focus();
    await page.keyboard.press('Enter');
    await expect(last).toHaveAttribute('aria-current', 'step', { timeout: 30_000 });
    // Focus lands on the step it jumped to (its title is read out)…
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.closest('[data-film-step]')?.getAttribute('data-film-step') ?? null), { timeout: 30_000 })
      .toBe('4');
    // …so the next Tab reaches that step's links, not the next section.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Start your free report' })).toBeFocused();
  });

  test('keeps each caption clear of the navigation and the rail on a phone', { tag: '@phone' }, async ({ page }) => {
    for (const size of [
      { width: 375, height: 667 },
      { width: 375, height: 812 },
    ]) {
      await page.setViewportSize(size);
      await openFilm(page);
      const nav = page.locator('nav[aria-label="Main"] .glass-nav');
      const rail = page.getByRole('navigation', { name: 'Jump to a step' });
      for (const shot of REST.keys()) {
        await scrollFilm(page, shot);
        const caption = await box(activeCaption(page).locator('article'));
        expect(overlaps(caption, await box(nav)), `shot ${shot + 1} caption under the navigation at ${size.width}×${size.height}`).toBe(false);
        expect(overlaps(caption, await box(rail)), `shot ${shot + 1} caption under the rail at ${size.width}×${size.height}`).toBe(false);
        const { overflow, culprits } = await horizontalOverflow(page);
        expect(overflow, `scrolls sideways at shot ${shot + 1}: ${culprits.join(', ')}`).toBeLessThanOrEqual(0);
      }
    }
  });

  test('keeps the static sequence on a phone held sideways', { tag: '@phone' }, async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await page.goto('/?fx=1');
    await expect(page.getByRole('heading', { level: 1, name: PUBLIC_PAGES[0].h1 })).toBeVisible();
    await page.waitForTimeout(4_000);
    await expect(page.locator('[data-film-mode="static"]')).toHaveCount(1);
    // Turned upright, the film pins (the same switch as any other).
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('[data-film-mode="film"]')).toHaveCount(1, { timeout: 30_000 });
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`passes WCAG 2.2 AA at every shot, navigation included (${theme} theme) @desktop-only`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.addInitScript((t) => {
        try {
          localStorage.setItem('pc-theme', t);
        } catch {
          /* the theme check below fails instead */
        }
      }, theme);
      await openFilm(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const nav = page.locator('nav[aria-label="Main"]');
      for (const shot of REST.keys()) {
        await scrollFilm(page, shot);
        // Over the film at dusk the navigation turns to night glass with it,
        // once the picture (drawn slowly here, in software) has reached its night.
        if (shot === REST.length - 1) await expect(nav).toHaveAttribute('data-night', '', { timeout: 90_000 });
        const results = await new AxeBuilder({ page })
          .withTags(WCAG_TAGS)
          .include('#how-it-works')
          .include('nav[aria-label="Main"]')
          .exclude('[aria-hidden="true"][data-decorative]')
          .options({ preload: false })
          .analyze();
        const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        expect(
          serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join(', ')}`),
          `shot ${shot + 1}`
        ).toEqual([]);
      }
      // Past the film, over the closing call to action (a night section).
      await page.locator('#how-it-works ~ section[data-night], main section[data-night]').last().scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      const closing = await page.evaluate(() => {
        const bar = document.querySelector('nav[aria-label="Main"] .glass-nav')?.getBoundingClientRect();
        const night = [...document.querySelectorAll('main section[data-night]')].pop()?.getBoundingClientRect();
        return !!bar && !!night && night.top <= bar.top + bar.height / 2 && night.bottom >= bar.top + bar.height / 2;
      });
      if (closing) await expect(nav).toHaveAttribute('data-night', '');
    });
  }

  test('stops when the visitor pauses motion, and stays stopped', async ({ page }) => {
    await openFilm(page);
    const pause = page.getByRole('button', { name: 'Pause motion' });
    await expect(pause).toHaveAttribute('aria-pressed', 'false');
    await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'paused');
    // The film becomes its still sequence (as with the OS setting).
    await expect(page.locator('[data-film-mode="static"]')).toHaveCount(1);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'paused');
    await expect(page.getByRole('button', { name: 'Pause motion' })).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(4_000);
    await expect(page.locator('[data-film-mode="static"]')).toHaveCount(1);
    // And back.
    await page.getByRole('button', { name: 'Pause motion' }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-motion', /.*/);
    await expect(page.locator('[data-film-mode="film"]')).toHaveCount(1, { timeout: 30_000 });
  });
});
