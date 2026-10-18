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

/** The /lab section with the landing film's own pieces (app/lab/FilmLab.tsx). */
const FILM_LAB = 'section[aria-labelledby="lab-film"]';

/**
 * The film's five still frames on /lab are the same LandingFilm scene as its
 * film view (every piece mounted and compiled), at other progress values.
 * Their still path is checked where it ships instead, on the landing page
 * under reduced motion (below), which saves minutes of software rendering.
 */
const LAB_STILLS = /^Shot \d:/;

/** Opens /lab at a tier and waits for the stage (skips where /lab isn't served). */
async function openLab(page: Page, fx: 1 | 2) {
  const response = await page.goto(`/lab?fx=${fx}`);
  test.skip(response?.status() === 404, '/lab is not served on the production deployment');
  await expect(page.getByRole('heading', { level: 1, name: /^lab$/i })).toBeVisible();
  // The canvas is in and faded up: <html data-stage="ready">.
  await expect(page.locator('html')).toHaveAttribute('data-stage', 'ready', { timeout: 45_000 });
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveCount(1);
  // Decorative: hidden from assistive tech, and behind the page content.
  await expect(page.locator('[aria-hidden="true"][data-decorative]').filter({ has: canvas })).toHaveCount(1);
}

/**
 * Scrolls each chosen view into sight and waits for it to draw (its poster
 * steps aside: data-scene-view="live"). Returns the names it checked.
 */
async function drawEach(page: Page, pick: (view: { name: string; inFilmLab: boolean }) => boolean): Promise<string[]> {
  const views = page.locator('[data-scene-view]');
  const all = await views.evaluateAll(
    (els, filmLab) => els.map((el, i) => ({ name: el.getAttribute('aria-label') ?? `view ${i + 1}`, inFilmLab: !!el.closest(filmLab) })),
    FILM_LAB
  );
  const checked: string[] = [];
  for (let i = 0; i < all.length; i++) {
    if (!pick(all[i])) continue;
    const view = views.nth(i);
    await view.scrollIntoViewIfNeeded();
    // The first heavy view on a page compiles its programs from cold (beside its neighbours, on a shared CPU).
    await expect(view, all[i].name).toHaveAttribute('data-scene-view', 'live', { timeout: 90_000 });
    checked.push(all[i].name);
  }
  return checked;
}

// One run per tier, each on the project it is for: tier 1 is the phone path
// (coarse pointer, high DPR), tier 2 the desktop one. The kit and the
// landing film's pieces are separate tests, so the two halves of /lab draw
// on both workers at once.
for (const fx of [1, 2] as const) {
  const tag = fx === 2 ? '@desktop-only' : '@phone';

  test(`/lab draws every kit view at tier ${fx} ${tag}`, async ({ page }) => {
    // A dozen views, each compiled and drawn in software, sharing the CPU with the other worker.
    test.setTimeout(fx === 2 ? 240_000 : 150_000);
    const trouble = watchGl(page);
    await openLab(page, fx);
    const checked = await drawEach(page, (v) => !v.inFilmLab);
    expect(checked.length).toBeGreaterThanOrEqual(8);

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

  test(`/lab draws the landing film's pieces at tier ${fx} ${tag}`, async ({ page }) => {
    test.setTimeout(fx === 2 ? 240_000 : 150_000);
    const trouble = watchGl(page);
    await openLab(page, fx);
    // The hero vignette, the film itself (every piece of it, compiled before
    // its first frame), and the household, ledger and plinth on their own.
    const checked = await drawEach(page, (v) => v.inFilmLab && !LAB_STILLS.test(v.name));
    expect(checked.length).toBeGreaterThanOrEqual(5);
    expect(checked.some((name) => /landing film/i.test(name)), 'the film view is checked').toBe(true);

    await expect(page.locator('html')).toHaveAttribute('data-stage', 'ready');
    expect(trouble, 'WebGL or three.js errors').toEqual([]);
  });
}

test('the landing film’s still frames draw under reduced motion, dusk included', async ({ page, isMobile }) => {
  test.setTimeout(180_000);
  const trouble = watchGl(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/?fx=${isMobile ? 1 : 2}`);
  await expect(page.getByRole('heading', { level: 1, name: /your money\. real bills\. crystal clear\./i })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-stage', 'ready', { timeout: 90_000 });
  // Reduced motion keeps the five panels; on a device that runs 3D each
  // drawing becomes a composed frame of the real scene (FilmStill). The
  // dusk panel is a night pane, so its frame uses the night palette.
  await expect(page.locator('#how-it-works [data-film-mode="static"]')).toHaveCount(1);
  const dusk = page.locator('#how-it-works [data-scene-night] [data-scene-view]');
  await expect(dusk).toHaveCount(1, { timeout: 60_000 });
  await dusk.scrollIntoViewIfNeeded();
  await expect(dusk).toHaveAttribute('data-scene-view', 'live', { timeout: 90_000 });
  await expect(page.locator('html')).toHaveAttribute('data-stage', 'ready');
  expect(trouble, 'WebGL or three.js errors').toEqual([]);
});

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
