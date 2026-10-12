import { MISSING_PATH, PUBLIC_PAGES, expect, test } from './support';

// Crawler-facing routes and robots rules: robots.txt, the sitemap, the share
// image and icon, and noindex on every page that isn't public content.

const robotsMeta = (html: string) => html.match(/<meta[^>]+name="robots"[^>]*>/i)?.[0] ?? '';

test('robots.txt allows the site, blocks the API and names the sitemap', async ({ request }) => {
  const res = await request.get('/robots.txt');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/^text\/plain/);
  const body = await res.text();
  expect(body).toMatch(/^User-Agent: \*$/m);
  expect(body).toMatch(/^Allow: \/$/m);
  expect(body).toMatch(/^Disallow: \/api\/$/m);
  expect(body).toMatch(/^Sitemap: https?:\/\/\S+\/sitemap\.xml$/m);
});

test('sitemap.xml lists exactly the public pages, and each one loads', async ({ request }) => {
  const res = await request.get('/sitemap.xml');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/xml/);
  const body = await res.text();
  expect(body).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

  const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]));
  const paths = locs.map((u) => u.pathname);
  const publicContent = PUBLIC_PAGES.map((p) => p.path).filter((p) => !p.startsWith('/auth/'));
  expect(paths.sort()).toEqual([...publicContent].sort());
  expect(new Set(locs.map((u) => u.origin)).size, 'one origin for every URL').toBe(1);

  for (const path of paths) {
    expect((await request.get(path)).status(), `${path} from the sitemap`).toBe(200);
  }
});

test('the share image is a 1200x630 PNG', async ({ request }) => {
  const res = await request.get('/opengraph-image');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('image/png');
  const png = await res.body();
  expect(png.subarray(0, 8).toString('hex'), 'PNG signature').toBe('89504e470d0a1a0a');
  // IHDR: width and height are the first two big-endian 32-bit fields after the chunk header.
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
});

test('the SVG icon is served', async ({ request }) => {
  const res = await request.get('/icon.svg');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/^image\/svg\+xml/);
  expect(await res.text()).toContain('<svg');
});

test('public pages are indexable and carry share metadata', async ({ request }) => {
  for (const { path } of PUBLIC_PAGES.filter((p) => !p.path.startsWith('/auth/'))) {
    const html = await (await request.get(path)).text();
    expect(robotsMeta(html), `${path} robots meta`).not.toMatch(/noindex/i);
    expect(html, `${path} og:image`).toMatch(/<meta[^>]+property="og:image"[^>]+content="[^"]*\/opengraph-image/);
    expect(html, `${path} description`).toMatch(/<meta[^>]+name="description"[^>]+content="[^"]+"/);
  }
});

test('pages link the SVG icon and an apple-touch-icon that loads', async ({ request }) => {
  const html = await (await request.get('/')).text();
  expect(html).toMatch(/<link[^>]+rel="icon"[^>]+href="\/icon\.svg/);
  const apple = html.match(/<link[^>]+rel="apple-touch-icon"[^>]+href="([^"]+)"/)?.[1];
  expect(apple, 'apple-touch-icon link').toBeTruthy();
  const res = await request.get(apple!.replace(/&amp;/g, '&'));
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('image/png');
});

const NOINDEX = [
  // Signed-out visits to app pages end on sign-in, which must not be indexed either.
  '/dashboard',
  '/advisor?q=hello',
  '/settings',
  '/auth/signin',
  '/auth/signup',
  '/auth/forgot',
  MISSING_PATH,
];

for (const path of NOINDEX) {
  test(`${path} is noindex`, async ({ page }) => {
    await page.goto(path);
    // Next adds its own noindex tag to the 404 page, so there may be more than one.
    const robots = await page.locator('meta[name="robots"]').evaluateAll((tags) => tags.map((t) => t.getAttribute('content') ?? ''));
    expect(robots.length, 'robots meta present').toBeGreaterThan(0);
    for (const content of robots) expect(content).toMatch(/noindex/);
  });
}
