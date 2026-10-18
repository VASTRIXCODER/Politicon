import type { Page } from '@playwright/test';
import { expect, test } from './support';

// The shared WebGL stage (components/three) never loads in the other specs:
// headless Chromium renders WebGL in software, which lib/three/tier.ts treats
// as tier 0, so every page shows its posters. Here a software GL backend is
// switched on and pages force a tier with ?fx= (honoured outside production).
//
// The support fixture only fails on serious console errors (CSP, hydration),
// and a failing kit piece only warns (it keeps its poster), so these tests
// listen for WebGL and three.js trouble themselves: a shader that doesn't
// compile, a GL error, a view or the stage giving up.
test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

const GL_TROUBLE =
  /THREE\.|GL_INVALID|INVALID_(?:OPERATION|VALUE|ENUM|FRAMEBUFFER_OPERATION)|Shader Error|WebGL: |CONTEXT_LOST|context could not be created|Politicon: (?:a 3D view failed|the 3D stage stopped)/;

/** Library deprecation notices (three.js's own Clock, used by R3F): not a fault in the page. */
const DEPRECATION = /deprecated/i;

/** Console errors and warnings that say the 3D layer is broken, collected for the whole test. */
function watchGl(page: Page): string[] {
  const trouble: string[] = [];
  page.on('console', (msg) => {
    if ((msg.type() === 'error' || msg.type() === 'warning') && GL_TROUBLE.test(msg.text()) && !DEPRECATION.test(msg.text())) {
      trouble.push(`${msg.type()}: ${msg.text().slice(0, 300)}`);
    }
  });
  return trouble;
}

/** Long enough for the GPU probe and the idle-time load to have happened if they were going to. */
async function pastIdle(page: Page) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(4_500);
}

for (const fx of [1, 2] as const) {
  // Tier 1 is the phone path (coarse pointer, high DPR), so it runs on both projects.
  test(`/lab draws every 3D view at tier ${fx}${fx === 2 ? ' @desktop-only' : ''}`, async ({ page }) => {
    // Two dozen views, each compiled and drawn in software, sharing the CPU with the other worker.
    test.setTimeout(360_000);
    const trouble = watchGl(page);
    const response = await page.goto(`/lab?fx=${fx}`);
    test.skip(response?.status() === 404, '/lab is not served on the production deployment');
    await expect(page.getByRole('heading', { level: 1, name: /^lab$/i })).toBeVisible();

    // The canvas is in and faded up: <html data-stage="ready">.
    await expect(page.locator('html')).toHaveAttribute('data-stage', 'ready', { timeout: 45_000 });
    const canvas = page.locator('canvas');
    await expect(canvas).toHaveCount(1);
    // Decorative: hidden from assistive tech, and behind the page content.
    await expect(page.locator('[aria-hidden="true"][data-decorative]').filter({ has: canvas })).toHaveCount(1);

    // Every scene, scrolled into view, draws, and its poster steps aside.
    const views = page.locator('[data-scene-view]');
    const count = await views.count();
    expect(count).toBeGreaterThanOrEqual(8);
    for (let i = 0; i < count; i++) {
      const view = views.nth(i);
      await view.scrollIntoViewIfNeeded();
      const name = (await view.getAttribute('aria-label')) ?? `view ${i + 1}`;
      await expect(view, name).toHaveAttribute('data-scene-view', 'live', { timeout: 45_000 });
    }

    // The night section: once the field paints the Chamber behind it, its own
    // background steps aside so the view inside shows through.
    const night = page.locator('[data-scene-night]');
    await night.scrollIntoViewIfNeeded();
    await expect(night).toHaveAttribute('data-scene-night-live', '', { timeout: 15_000 });
    await expect(night).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

    // Nothing knocked the stage over on the way.
    await expect(page.locator('html')).toHaveAttribute('data-stage', 'ready');
    expect(trouble, 'WebGL or three.js errors').toEqual([]);
  });
}

test('pages with nothing 3D on them never load the stage', async ({ page }) => {
  test.slow();
  const trouble = watchGl(page);
  // /help has no scene and no drift (a reading page); the tier is forced to 2.
  await page.goto('/help?fx=2');
  await expect(page.getByRole('heading', { level: 1, name: /^help$/i })).toBeVisible();
  await pastIdle(page);
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-stage', /.*/);
  expect(trouble).toEqual([]);
});

test('the landing hero draws its 3D Capitol on one canvas, on phones too', async ({ page, isMobile }) => {
  test.slow();
  const trouble = watchGl(page);
  // Tier 1 is the phone path; desktops run tier 2. Since R1 the landing page
  // has real scenes (the hero's Capitol, the film), so a touch screen loads
  // the stage for them too; only the ambient light's drift needs a mouse.
  await page.goto(`/?fx=${isMobile ? 1 : 2}`);
  await expect(page.getByRole('heading', { level: 1, name: /your money\. real bills\. crystal clear\./i })).toBeVisible();
  // The hero's first frame compiles its shaders in software here (and shares
  // the CPU with the other worker): allow more than /lab's single views.
  await expect(page.locator('html')).toHaveAttribute('data-stage', 'ready', { timeout: 90_000 });
  await expect(page.locator('canvas')).toHaveCount(1);
  // The hero's scene view draws once it's on screen (a band above the
  // headline on a phone), and its poster steps aside.
  const hero = page.locator('[data-scene-section="hero"] [data-scene-view]').first();
  await hero.scrollIntoViewIfNeeded();
  await expect(hero).toHaveAttribute('data-scene-view', 'live', { timeout: 45_000 });
  expect(trouble).toEqual([]);
});
