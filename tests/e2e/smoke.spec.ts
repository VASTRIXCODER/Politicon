import { MISSING_PATH, NOT_FOUND_H1, PUBLIC_PAGES, expect, horizontalOverflow, openPage, test } from './support';

// Every public page renders its heading from a production build with no
// uncaught errors (checked by the shared fixture), and fits a 375px phone
// screen without sideways scrolling.

interface KnownOverflow {
  /** CSS selector for the elements allowed to stick out; nothing else on the page is. */
  selector: string;
  /** What's wrong and where, for whoever fixes it. */
  why: string;
}

/**
 * Known sideways-scroll bugs, by path. The page is still checked: the listed
 * elements are put back in place (their transform removed) and the page must
 * then fit, so any other overflow fails. Once the bug is fixed the test fails
 * until the entry is deleted, so the bug can't come back unnoticed.
 */
const KNOWN_OVERFLOW: Record<string, KnownOverflow> = {};

const PAGES = [...PUBLIC_PAGES, { path: MISSING_PATH, h1: NOT_FOUND_H1 }];

for (const { path, h1 } of PAGES) {
  const expectedStatus = path === MISSING_PATH ? 404 : 200;
  const name = path === MISSING_PATH ? 'the 404 page' : path;

  test(`${name} renders`, async ({ page }) => {
    const response = await openPage(page, path, h1);
    expect(response?.status(), 'HTTP status').toBe(expectedStatus);

    await expect(page.locator('h1'), 'exactly one h1').toHaveCount(1);
    await expect(page).toHaveTitle(/Politicon/);
    await expect(page.locator('main#main'), 'skip-link target').toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  // Runs on the 375px "mobile" project only (desktop skips @phone).
  test(`${name} fits a 375px screen`, { tag: '@phone' }, async ({ page }, testInfo) => {
    await openPage(page, path, h1);
    const known = KNOWN_OVERFLOW[path];
    if (known) {
      testInfo.annotations.push({ type: 'fixme', description: known.why });
      const before = await horizontalOverflow(page);
      const listed = await page.locator(known.selector).count();
      expect(
        before.overflow > 0 && listed > 0,
        `KNOWN_OVERFLOW['${path}'] is stale (overflow ${before.overflow}px, ${listed} listed elements): delete the entry`,
      ).toBe(true);
      // Put only the known culprits back in place; anything else that sticks out still fails below.
      await page.addStyleTag({ content: `${known.selector} { transform: none !important; translate: none !important; }` });
    }

    const { overflow, culprits } = await horizontalOverflow(page);
    expect(overflow, `page scrolls ${overflow}px sideways; sticking out: ${culprits.join(', ') || 'unknown'}`).toBeLessThanOrEqual(0);
  });
}

test('the 404 page links home', async ({ page }) => {
  await openPage(page, MISSING_PATH, NOT_FOUND_H1);
  await expect(page.getByRole('main').getByRole('link', { name: /home page/i })).toHaveAttribute('href', '/');
});

test('the landing page offers sign-up, the explorer and the guide search', async ({ page }) => {
  await openPage(page, '/', PUBLIC_PAGES[0].h1);
  const main = page.getByRole('main');
  await expect(main.getByRole('link', { name: /get my impact report/i })).toHaveAttribute('href', '/auth/signup');
  await expect(main.getByRole('link', { name: /try the explorer/i }).first()).toHaveAttribute('href', '/explorer');
  await expect(page.getByRole('search').getByRole('textbox', { name: /ask about a policy/i })).toBeVisible();
});
