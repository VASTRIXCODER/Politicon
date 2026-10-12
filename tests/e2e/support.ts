import { test as base, expect, type Page } from '@playwright/test';

/** Signed-out pages anyone can open, with the h1 each must show. */
export const PUBLIC_PAGES: { path: string; h1: RegExp }[] = [
  { path: '/', h1: /your money\. real bills\. crystal clear\./i },
  { path: '/explorer', h1: /public impact explorer/i },
  { path: '/help', h1: /^help$/i },
  { path: '/privacy', h1: /privacy policy/i },
  { path: '/terms', h1: /terms of service/i },
  { path: '/disclaimer', h1: /disclaimer/i },
  { path: '/auth/signin', h1: /welcome back/i },
  { path: '/auth/signup', h1: /get your impact report/i },
  { path: '/auth/forgot', h1: /reset your password/i },
];

/** Any path the app doesn't have; it must render the custom 404 page. */
export const MISSING_PATH = '/e2e-this-page-does-not-exist';
export const NOT_FOUND_H1 = /couldn.t find that page/i;

/** Pages that need a session (see PROTECTED_ROUTES in middleware.ts). */
export const PROTECTED_PATHS = ['/dashboard', '/policies', '/advisor', '/impact', '/settings', '/onboarding'];

/**
 * Uncaught errors that only say a network request failed. Third-party
 * requests (Supabase, Fontshare) are blocked in these tests, so a failed
 * fetch is expected and not a bug in the page.
 */
const NETWORK_FAILURE = /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_failed|err_blocked|err_internet_disconnected|authretryablefetcherror/i;

/** Console errors that point at a real bug even though nothing was thrown. */
const SERIOUS_CONSOLE = /content security policy|hydrat|minified react error|did not match/i;

type Fixtures = {
  /** Uncaught page errors and serious console errors seen so far in this test. */
  pageErrors: string[];
  /** Hosts besides the app itself that this test may reach (default: none). */
  allowedHosts: string[];
};

/**
 * The app's own origin is served by `next start`; every other request
 * (Supabase, Fontshare fonts, vercel.live) is aborted so the suite is
 * hermetic and runs with a placeholder Supabase project and no network.
 * Every test also fails if the page threw an uncaught error.
 */
export const test = base.extend<Fixtures>({
  allowedHosts: [[], { option: true }],

  pageErrors: [
    async ({ page, baseURL, allowedHosts }, use) => {
      const appHost = new URL(baseURL!).host;
      await page.context().route(
        (url) => url.host !== appHost && !allowedHosts.includes(url.host) && /^(https?|wss?):$/.test(url.protocol),
        (route) => route.abort('blockedbyclient'),
      );

      const errors: string[] = [];
      page.on('pageerror', (error) => {
        const text = `${error.name}: ${error.message}`;
        if (!NETWORK_FAILURE.test(text)) errors.push(text);
      });
      page.on('console', (msg) => {
        if (msg.type() === 'error' && SERIOUS_CONSOLE.test(msg.text())) errors.push(`console: ${msg.text()}`);
      });

      await use(errors);
      // A plain throw: a failing expect() in fixture teardown confuses the reporter.
      if (errors.length) throw new Error(`Uncaught page errors:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Waits until the page is visually settled: fonts are ready and every finite
 * animation (Framer Motion entrances, CSS transitions) has finished. Infinite
 * ones (pulses, the marquee) are ignored.
 */
export async function settle(page: Page) {
  await page.waitForLoadState('load');
  await page.evaluate(async () => {
    await document.fonts?.ready;
    const deadline = Date.now() + 5_000;
    for (;;) {
      const running = document.getAnimations().filter((a) => {
        const iterations = a.effect?.getComputedTiming().iterations;
        return a.playState === 'running' && iterations !== Infinity;
      });
      if (!running.length || Date.now() > deadline) break;
      await Promise.all(running.map((a) => a.finished.catch(() => undefined)));
    }
    // Two frames, so JS-driven (requestAnimationFrame) animations land too.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

/** Opens a path and waits for its h1 (client pages render after hydration). */
export async function openPage(page: Page, path: string, h1?: RegExp) {
  const response = await page.goto(path);
  if (h1) await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible();
  await settle(page);
  return response;
}

/**
 * How far the page can scroll sideways (in CSS px), and the elements that
 * stick out past the screen's right edge. On a phone, `overflow-x: clip` on
 * <body> doesn't stop this: the layout viewport grows to fit the content.
 */
export async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const screenWidth = window.visualViewport?.width ?? root.clientWidth;
    const overflow = Math.round(Math.max(root.scrollWidth, window.innerWidth) - screenWidth);
    const culprits: string[] = [];
    if (overflow > 0) {
      const clipped = (el: Element) => {
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          if (/hidden|clip/.test(getComputedStyle(a).overflowX)) return true;
        }
        return false;
      };
      for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
        const rect = el.getBoundingClientRect();
        const parentRight = el.parentElement?.getBoundingClientRect().right ?? 0;
        // Fixed elements stretch with the widened viewport: a symptom, not a cause.
        const fixed = getComputedStyle(el).position === 'fixed';
        if (rect.width && rect.right > screenWidth + 1 && rect.right > parentRight + 1 && !fixed && !clipped(el)) {
          const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
          culprits.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''} (right edge ${Math.round(rect.right)}px)`);
          if (culprits.length >= 5) break;
        }
      }
    }
    return { overflow, culprits };
  });
}
