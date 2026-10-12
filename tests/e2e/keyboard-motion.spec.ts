import { PUBLIC_PAGES, expect, openPage, settle, test } from './support';

// Keyboard: the skip link is the first Tab stop on every public page, shows
// itself when focused, and moves focus to <main id="main">.
// Motion: with "reduce motion" on, the landing page shows its final content
// straight away (no entrance animations leaving text transparent).

const SKIP_LINK_PAGES = ['/', '/explorer', '/help', '/auth/signin', '/auth/signup', '/auth/forgot'];

for (const path of SKIP_LINK_PAGES) {
  test(`skip link on ${path}`, async ({ page }) => {
    const { h1 } = PUBLIC_PAGES.find((p) => p.path === path)!;
    await openPage(page, path, h1);

    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).not.toBeInViewport();

    await page.keyboard.press('Tab');
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport({ ratio: 1 });

    await page.keyboard.press('Enter');
    await expect(page.locator('main#main')).toBeFocused();
    await expect(page).toHaveURL(/#main$/);

    // The next Tab continues from inside main, not from the top of the page.
    await page.keyboard.press('Tab');
    const insideMain = await page.evaluate(() => !!document.activeElement?.closest('main#main'));
    expect(insideMain, 'focus continues inside main').toBe(true);
  });
}

test.describe('with reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('the landing page renders its final content at once', async ({ page }) => {
    await openPage(page, '/', PUBLIC_PAGES[0].h1);

    // Hydrated: the example card has read the motion preference and offers
    // "play", not "pause" (the server HTML says "pause"), so every effect of the
    // hydration pass, Reveal's included, has run.
    await expect(page.getByRole('button', { name: 'Play examples' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pause examples' })).toHaveCount(0);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

    // Before any scrolling: with reduced motion Reveal never hides anything,
    // so no element carries data-reveal at all. (Without the preference, every
    // section below the fold is data-reveal="hidden" at this point.) A plain
    // read, not a retrying assertion.
    const marked = await page.locator('[data-reveal]').count();
    expect(marked, 'elements Reveal hid or animated, with reduced motion on').toBe(0);

    // Scroll through the page as a reader would, so scroll-triggered effects get their chance to run.
    await page.evaluate(async () => {
      const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
      for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight / 2) {
        window.scrollTo(0, y);
        await frame();
        await frame();
      }
    });
    await settle(page);

    // Nothing was revealed by scrolling either: there was nothing to reveal.
    expect(await page.locator('[data-reveal="shown"]').count(), 'elements revealed on scroll').toBe(0);
    expect(await page.locator('[data-reveal="hidden"]').count(), 'elements still waiting to be revealed').toBe(0);

    // No visible text sits inside a transparent (or nearly) ancestor.
    const faded = await page.evaluate(() => {
      const out: string[] = [];
      const walker = document.createTreeWalker(document.querySelector('main')!, NodeFilter.SHOW_TEXT);
      const seen = new Set<Element>();
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement;
        if (!el || seen.has(el) || !node.textContent?.trim()) continue;
        seen.add(el);
        if (!el.getClientRects().length || el.closest('[aria-hidden="true"], .sr-only')) continue;
        let opacity = 1;
        for (let a: Element | null = el; a; a = a.parentElement) {
          opacity *= Number(getComputedStyle(a).opacity);
        }
        if (opacity < 0.5) out.push(`${el.tagName.toLowerCase()} "${node.textContent.trim().slice(0, 40)}" (opacity ${opacity.toFixed(2)})`);
      }
      return out;
    });
    expect(faded, 'text left transparent').toEqual([]);
  });

  test('the landing page shows its first screen without waiting for animations', async ({ page }) => {
    // From the first frame the page renders until well after hydration, sample
    // the effective opacity (the product of the element's and every ancestor's)
    // of the headline, the main CTA and the search form, and keep the lowest
    // seen. A fade on a wrapper counts as much as one on the element, and a
    // fade that has already finished by the time a test could look still shows up.
    await page.addInitScript(() => {
      type Sample = { lowest: number; frames: number };
      const w = window as unknown as { __firstScreen: Record<string, Sample>; __firstScreenStop?: boolean };
      const targets: Record<string, () => Element | null | undefined> = {
        heading: () => document.querySelector('main h1'),
        cta: () => Array.from(document.querySelectorAll('main a')).find((a) => /get my impact report/i.test(a.textContent ?? '')),
        search: () => document.querySelector('main [role="search"]'),
      };
      w.__firstScreen = Object.fromEntries(Object.keys(targets).map((k) => [k, { lowest: 1, frames: 0 }]));
      const effectiveOpacity = (el: Element) => {
        let o = 1;
        for (let a: Element | null = el; a; a = a.parentElement) o *= Number(getComputedStyle(a).opacity);
        return o;
      };
      const tick = () => {
        for (const [key, find] of Object.entries(targets)) {
          const el = find();
          if (!el || !el.getClientRects().length) continue;
          const sample = w.__firstScreen[key];
          sample.lowest = Math.min(sample.lowest, effectiveOpacity(el));
          sample.frames++;
        }
        if (!w.__firstScreenStop) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    await page.goto('/');
    // Hydrated (see above), then a further second for anything hydration starts.
    await expect(page.getByRole('button', { name: 'Play examples' })).toBeVisible();
    await page.waitForTimeout(1_000);

    const result = await page.evaluate(() => {
      const w = window as unknown as { __firstScreen: Record<string, { lowest: number; frames: number }>; __firstScreenStop?: boolean };
      w.__firstScreenStop = true;
      // Finite animations still running on the hero section, inside it, or on an element around it.
      const hero = document.querySelector('main h1')?.closest('section');
      const running = document
        .getAnimations()
        .filter((a) => {
          const target = (a.effect as KeyframeEffect | null)?.target;
          const finite = a.effect?.getComputedTiming().iterations !== Infinity;
          return finite && a.playState === 'running' && target instanceof Element && hero && (target.contains(hero) || hero.contains(target));
        })
        .map((a) => {
          const target = (a.effect as KeyframeEffect).target as Element;
          return `${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ''} (${a.constructor.name})`;
        });
      return { samples: w.__firstScreen, running };
    });

    for (const [name, { lowest, frames }] of Object.entries(result.samples)) {
      expect(frames, `${name} was on screen while sampling`).toBeGreaterThan(0);
      expect(lowest, `${name}: lowest effective opacity from first paint on`).toBe(1);
    }
    expect(result.running, 'finite animations on, in or around the hero').toEqual([]);

    for (const locator of [
      page.getByRole('heading', { level: 1 }),
      page.getByRole('link', { name: /get my impact report/i }),
      page.getByRole('search'),
    ]) {
      await expect(locator).toBeVisible();
    }
  });
});
