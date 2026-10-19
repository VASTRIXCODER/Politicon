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

/**
 * Until the page has gone idle three times over: the tier's GPU probe and
 * the stage's own load (StageLoader: each at idle time, the load capped at
 * 2.5s) have both had their turn, so a stage that was going to load has
 * started to. The app's own trigger, not a fixed sleep: on a slow runner it
 * simply comes later.
 */
async function pastIdle(page: Page) {
  await page.waitForLoadState('load');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const ric = window.requestIdleCallback?.bind(window) as ((cb: () => void, options?: { timeout: number }) => number) | undefined;
        const idle = (cb: () => void) => (ric ? ric(cb, { timeout: 3_000 }) : window.setTimeout(cb, 1_500));
        idle(() => idle(() => idle(resolve)));
      })
  );
}

/** The /lab section with the landing film's own pieces (app/lab/FilmLab.tsx). */
const FILM_LAB = 'section[aria-labelledby="lab-film"]';
/** The /lab section with the signed-in app's scenes: household diorama, avatar, ledger (app/lab/AppLab.tsx). */
const APP_LAB = 'section[aria-labelledby="lab-app"]';
/** The /lab half with App II's scenes: the Transmission, the skyline, the guide's orb (app/lab/AppTwoLab.tsx). */
const APP_TWO_LAB = '[data-lab-section="app-two"]';

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
  await expect(page.locator('html')).toHaveAttribute('data-stage', 'ready', { timeout: 60_000 });
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveCount(1);
  // Decorative: hidden from assistive tech, and behind the page content.
  await expect(page.locator('[aria-hidden="true"][data-decorative]').filter({ has: canvas })).toHaveCount(1);
}

/**
 * Scrolls each chosen view into sight and waits for it to draw (its poster
 * steps aside: data-scene-view="live"). Returns the names it checked.
 */
async function drawEach(
  page: Page,
  pick: (view: { name: string; inFilmLab: boolean; inAppLab: boolean; inAppTwoLab: boolean }) => boolean
): Promise<string[]> {
  const views = page.locator('[data-scene-view]');
  const all = await views.evaluateAll(
    (els, [filmLab, appLab, appTwoLab]) =>
      els.map((el, i) => ({
        name: el.getAttribute('aria-label') ?? `view ${i + 1}`,
        inFilmLab: !!el.closest(filmLab),
        inAppLab: !!el.closest(appLab),
        inAppTwoLab: !!el.closest(appTwoLab),
      })),
    [FILM_LAB, APP_LAB, APP_TWO_LAB] as const
  );
  const checked: string[] = [];
  for (let i = 0; i < all.length; i++) {
    if (!pick(all[i])) continue;
    const view = views.nth(i);
    await view.scrollIntoViewIfNeeded();
    // The first heavy view on a page compiles its programs from cold (on a CPU shared with the other worker).
    await expect(view, all[i].name).toHaveAttribute('data-scene-view', 'live', { timeout: 60_000 });
    checked.push(all[i].name);
  }
  return checked;
}

// Every view on /lab, at tier 1: the tier CI can afford to draw in software
// (lighter glass, no effect pass, DPR <= 1.5). The kit runs on the phone
// project (tier 1 is the phone path: coarse pointer, high DPR) and the
// landing film's pieces on the desktop one, so each half is drawn once and
// the two share the workers. The tier-1-beside-tier-2 glass specimen on
// /lab compiles the transmission glass either way; what only tier 2 adds
// (the effect pass) has its own short test below.
test('/lab draws every kit view at tier 1', { tag: '@phone' }, async ({ page }) => {
  // A dozen views, each compiled and drawn in software.
  test.setTimeout(180_000);
  const trouble = watchGl(page);
  await openLab(page, 1);
  const checked = await drawEach(page, (v) => !v.inFilmLab && !v.inAppLab && !v.inAppTwoLab);
  expect(checked.length).toBeGreaterThanOrEqual(8);

  // The night section: once the field paints the Chamber behind it, its own
  // background steps aside so the view inside shows through.
  const night = page.locator('section[aria-labelledby="lab-night"][data-scene-night]');
  await night.scrollIntoViewIfNeeded();
  await expect(night).toHaveAttribute('data-scene-night-live', '', { timeout: 15_000 });
  await expect(night).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  // Nothing knocked the stage over on the way.
  await expect(page.locator('html')).toHaveAttribute('data-stage', 'ready');
  expect(trouble, 'WebGL or three.js errors').toEqual([]);
});

test("/lab draws the landing film's pieces at tier 1 @desktop-only", async ({ page }) => {
  test.setTimeout(150_000);
  const trouble = watchGl(page);
  await openLab(page, 1);
  // The hero vignette, the film itself (every piece of it, compiled before
  // its first frame), and the household, ledger and plinth on their own.
  const checked = await drawEach(page, (v) => v.inFilmLab && !LAB_STILLS.test(v.name));
  expect(checked.length).toBeGreaterThanOrEqual(5);
  expect(checked.some((name) => /landing film/i.test(name)), 'the film view is checked').toBe(true);

  await expect(page.locator('html')).toHaveAttribute('data-stage', 'ready');
  expect(trouble, 'WebGL or three.js errors').toEqual([]);
});

test("/lab draws the signed-in app's scenes at tier 1", { tag: '@phone' }, async ({ page }) => {
  // The onboarding diorama, three avatars and two ledgers (App I), each
  // compiled and drawn in software.
  test.setTimeout(150_000);
  const trouble = watchGl(page);
  await openLab(page, 1);
  const checked = await drawEach(page, (v) => v.inAppLab);
  expect(checked.length).toBeGreaterThanOrEqual(6);
  expect(checked.some((name) => /^example: your ledger/i.test(name)), 'the example ledger is checked').toBe(true);
  expect(checked.some((name) => /^your household: /i.test(name)), 'an avatar is checked').toBe(true);

  await expect(page.locator('html')).toHaveAttribute('data-stage', 'ready');
  expect(trouble, 'WebGL or three.js errors').toEqual([]);
});

test("/lab draws App II's scenes at tier 1 @desktop-only", async ({ page }) => {
  // The policy detail page's five Transmission scenes (over an example
  // analysis, then each with no data), the hero's other cases, My Impact's
  // skyline twice and the guide's orb: about sixteen views, all drawn in
  // software. On the desktop project, so the phone's kit and App I tests
  // share the other worker.
  test.setTimeout(240_000);
  const trouble = watchGl(page);
  await openLab(page, 1);
  await expect(page.locator(APP_TWO_LAB)).toHaveCount(1, { timeout: 30_000 });
  const checked = await drawEach(page, (v) => v.inAppTwoLab);
  expect(checked.length).toBeGreaterThanOrEqual(14);
  for (const scene of [/as a sheet of glass/i, /^light flows from the bill/i, /glass ribbon/i, /violet crystal/i, /terrain of/i, /skyline/i]) {
    expect(checked.some((name) => scene.test(name)), `a view matching ${scene} is checked`).toBe(true);
  }

  await expect(page.locator('html')).toHaveAttribute('data-stage', 'ready');
  expect(trouble, 'WebGL or three.js errors').toEqual([]);
});

test('tier 2 compiles its own programs: transmission glass and the effect pass @desktop-only', async ({ page }) => {
  // Desktop-class devices run tier 2. What only tier 2 adds is two kinds of
  // program, not views: transmission glass and the effect pass (bloom and
  // vignette). /lab's first view has both, so drawing it compiles them;
  // drawing every view again at tier 2 would mostly repeat tier 1's work, in
  // software, for minutes.
  test.setTimeout(150_000);
  const trouble = watchGl(page);
  await openLab(page, 2);
  const mark = page.locator('[data-scene-view]').first();
  await expect(mark).toHaveAttribute('aria-label', /aperture dome, in violet glass/i);
  // A view draws once it is on screen.
  await mark.scrollIntoViewIfNeeded();
  await expect(mark).toHaveAttribute('data-scene-view', 'live', { timeout: 90_000 });
  await expect(page.locator('html')).toHaveAttribute('data-stage', 'ready');
  expect(trouble, 'WebGL or three.js errors').toEqual([]);
});

test('the landing film’s still frames draw under reduced motion, dusk included', async ({ page }) => {
  test.setTimeout(120_000);
  const trouble = watchGl(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?fx=1');
  await expect(page.getByRole('heading', { level: 1, name: /your money\. real bills\. crystal clear\./i })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-stage', 'ready', { timeout: 60_000 });
  // Reduced motion keeps the five panels; on a device that runs 3D each
  // drawing becomes a composed frame of the real scene (FilmStill). The
  // dusk panel is a night pane, so its frame uses the night palette.
  await expect(page.locator('#how-it-works [data-film-mode="static"]')).toHaveCount(1);
  const dusk = page.locator('#how-it-works [data-scene-night] [data-scene-view]');
  await expect(dusk).toHaveCount(1, { timeout: 30_000 });
  await dusk.scrollIntoViewIfNeeded();
  await expect(dusk).toHaveAttribute('data-scene-view', 'live', { timeout: 60_000 });
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

test('the landing hero draws its 3D Capitol on one canvas, on phones too', async ({ page }) => {
  test.setTimeout(120_000);
  const trouble = watchGl(page);
  // At tier 1, the tier CI can draw in software (tier 2's own programs have
  // their test above). Since R1 the landing page has real scenes (the
  // hero's Capitol, the film), so a touch screen loads the stage for them
  // too; only the ambient light's drift needs a mouse.
  await page.goto('/?fx=1');
  await expect(page.getByRole('heading', { level: 1, name: /your money\. real bills\. crystal clear\./i })).toBeVisible();
  // The hero's first frame compiles its shaders in software here (on a CPU
  // shared with the other worker).
  await expect(page.locator('html')).toHaveAttribute('data-stage', 'ready', { timeout: 60_000 });
  await expect(page.locator('canvas')).toHaveCount(1);
  // The hero's scene view draws once it's on screen (a band above the
  // headline on a phone), and its poster steps aside.
  const hero = page.locator('[data-scene-section="hero"] [data-scene-view]').first();
  await hero.scrollIntoViewIfNeeded();
  await expect(hero).toHaveAttribute('data-scene-view', 'live', { timeout: 45_000 });
  expect(trouble).toEqual([]);
});
