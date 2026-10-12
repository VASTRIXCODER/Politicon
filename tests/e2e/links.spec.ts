import { PUBLIC_PAGES, expect, openPage, test } from './support';

// Every internal link on the public pages leads somewhere: following
// redirects, it answers with a status below 400. App pages redirect a
// signed-out visitor to sign-in, which counts as working. API routes are
// skipped (they aren't pages, and some act on GET).

/** Final status per URL, shared by the tests in this worker so each link is fetched once. */
const checked = new Map<string, Promise<number>>();

for (const { path, h1 } of PUBLIC_PAGES) {
  test(`links on ${path} resolve`, async ({ page, baseURL }) => {
    await openPage(page, path, h1);
    const origin = new URL(baseURL!).origin;

    const hrefs = await page.locator('a[href]').evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href));
    const targets = [
      ...new Set(
        hrefs
          .map((href) => new URL(href))
          .filter((url) => url.origin === origin && !url.pathname.startsWith('/api/'))
          .map((url) => `${url.pathname}${url.search}`),
      ),
    ];
    expect(targets.length, 'internal links found').toBeGreaterThan(0);

    const broken: string[] = [];
    await Promise.all(
      targets.map(async (target) => {
        if (!checked.has(target)) {
          checked.set(
            target,
            page.request.get(target, { maxRedirects: 10 }).then(
              (res) => res.status(),
              () => 0,
            ),
          );
        }
        const status = await checked.get(target)!;
        if (status === 0 || status >= 400) broken.push(`${target} -> ${status || 'request failed'}`);
      }),
    );
    expect(broken, `broken links on ${path}`).toEqual([]);
  });
}

test('fragment links on the landing page point at real sections', async ({ page }) => {
  await openPage(page, '/', PUBLIC_PAGES[0].h1);
  const fragments = await page
    .locator('a[href*="#"]')
    .evaluateAll((links) => [...new Set(links.map((a) => new URL((a as HTMLAnchorElement).href)).filter((u) => u.pathname === '/' && u.hash).map((u) => u.hash.slice(1)))]);
  for (const id of fragments) {
    await expect(page.locator(`[id="${id}"]`), `#${id} exists`).toHaveCount(1);
  }
});
