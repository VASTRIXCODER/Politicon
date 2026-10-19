import type { Page } from '@playwright/test';
import { FAKE_HOST, db } from './hermetic-journey';
import { completeOnboarding } from './journey-steps';
import { mockAi, newAccount, requireHermeticBuild, seedProfileAndAnalyses } from './signed-in';
import { expect, settle, test } from './support';

/**
 * App I's paths that only run with motion allowed or through a pointer, which
 * a11y-app.spec.ts (all under reduced motion) never reaches: focus through
 * onboarding's finishing reveal, the household band docked in view on a
 * phone, the ledger's readout and its 3D column lighting the same slab, and
 * the docket handing focus on after a card is dismissed from the keyboard.
 * Signed in hermetically, as a11y-app.spec.ts is.
 */

test.use({ allowedHosts: [FAKE_HOST], contextOptions: { reducedMotion: 'no-preference' } });

test.beforeEach(async ({ request }) => {
  await requireHermeticBuild(request);
});

/** The household band lies wholly inside the viewport. */
async function expectHouseholdInView(page: Page, what: string) {
  const box = await page.locator('[data-household-stage]').boundingBox();
  const height = page.viewportSize()?.height ?? 0;
  expect(box, `${what}: the household is on the page`).toBeTruthy();
  expect(box!.y, `${what}: the household's top is on screen`).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, `${what}: the household's foot is on screen`).toBeLessThanOrEqual(height);
}

test('onboarding keeps focus on the question through the finishing reveal; the diorama has no controls to take it', async ({ page, request }) => {
  test.setTimeout(120_000);
  const unexpected = await mockAi(page);
  await newAccount(page, db(request));
  await completeOnboarding(page, 13);

  const title = page.locator('main#main').getByRole('heading', { level: 1 });
  await expect(title).toBeFocused();
  // The reveal (the camera pulling back, the lamplight) lasts under three seconds; focus stays put through it.
  await page.waitForTimeout(3_200);
  await expect(title).toBeFocused();
  await expect(page.getByRole('complementary', { name: 'Your household' }).locator('button, a[href], [tabindex]')).toHaveCount(0);
  expect(unexpected, 'API calls nothing answered').toEqual([]);
});

test('on a phone the household stays in view as pieces are added and through the reveal', async ({ page, request }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 375, height: 812 });
  const unexpected = await mockAi(page);
  await newAccount(page, db(request));

  // The debts question: the longest list, its last choices well below the fold.
  await completeOnboarding(page, 10);
  const main = page.locator('main#main');
  await expect(main.getByRole('heading', { level: 1 })).toContainText(/debt/i);
  await main.getByRole('button', { name: 'Business loan', exact: true }).click();
  await expectHouseholdInView(page, 'a debt just picked');
  await expect(page.getByRole('complementary', { name: 'Your household' }).locator('[aria-live="polite"]')).toContainText(/business loan/i);

  // On to the last question, where the reveal plays.
  await completeOnboarding(page, 13);
  await expectHouseholdInView(page, 'the last question');
  await settle(page);
  // The page itself never scrolls sideways or down: the questions scroll in their own pane under the band.
  expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(0);
  expect(unexpected, 'API calls nothing answered').toEqual([]);
});

test('the ledger readout and its 3D column light the same slab, by keyboard and by pointer', { tag: '@desktop-only' }, async ({ page, request }) => {
  test.setTimeout(180_000);
  const unexpected = await mockAi(page);
  const database = db(request);
  const userId = await newAccount(page, database);
  await seedProfileAndAnalyses(database, userId);

  // fx=1: the 3D scene on every device that can draw it (the test browser's software WebGL included).
  await page.goto('/dashboard?fx=1');
  await expect(page.getByRole('heading', { level: 1, name: /^good (morning|afternoon|evening)/i })).toBeVisible({ timeout: 30_000 });
  const rows = page.locator('button[data-ledger-slab]');
  const lit = page.locator('button[data-ledger-slab][data-lit]');
  await expect(rows).toHaveCount(2, { timeout: 30_000 });

  // Keyboard: each row lights as it takes focus, and only one at a time.
  await rows.first().focus();
  await expect(rows.first()).toHaveAttribute('data-lit', '');
  await rows.nth(1).focus();
  await expect(rows.nth(1)).toHaveAttribute('data-lit', '');
  await expect(lit).toHaveCount(1);
  await rows.nth(1).blur();
  await expect(lit).toHaveCount(0);

  // Pointer: sweeping down the 3D column lights a row; leaving the model lets go.
  const view = page.locator('figure[data-scene-night] [data-scene-view]');
  await view.scrollIntoViewIfNeeded();
  await expect(view).toHaveAttribute('data-scene-view', 'live', { timeout: 90_000 });
  const box = await view.boundingBox();
  expect(box).toBeTruthy();
  let found = false;
  for (let i = 0; i <= 40 && !found; i++) {
    await page.mouse.move(box!.x + box!.width * 0.52, box!.y + box!.height * (0.05 + (0.9 * i) / 40));
    await page.waitForTimeout(120);
    found = (await lit.count()) > 0;
  }
  expect(found, 'pointing at a slab lights its row in the readout').toBe(true);
  // Out to the page's left gutter, clear of the model and the readout.
  await page.mouse.move(Math.max(1, box!.x - 16), box!.y + box!.height / 2);
  await expect(lit).toHaveCount(0);
  expect(unexpected, 'API calls nothing answered').toEqual([]);
});

for (const path of ['/dashboard', '/policies']) {
  test(`dismissing a card from the keyboard on ${path} hands focus to the next card's title`, { tag: '@desktop-only' }, async ({ page, request }) => {
    test.setTimeout(120_000);
    const unexpected = await mockAi(page);
    const database = db(request);
    const userId = await newAccount(page, database);
    await seedProfileAndAnalyses(database, userId);

    await page.goto(`${path}?fx=0`);
    const cards = page.locator('[data-feed-card]');
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });
    await settle(page);
    const count = await cards.count();
    expect(count, 'a feed with a card after the first').toBeGreaterThan(1);
    const next = (await page.locator('[data-feed-card-title]').nth(1).innerText()).trim();

    await cards.first().getByRole('button', { name: /not relevant to me/i }).focus();
    await page.keyboard.press('Enter');
    await expect(cards).toHaveCount(count - 1, { timeout: 15_000 });
    const focused = page.locator(':focus');
    await expect(focused).toHaveAttribute('data-feed-card-title', '');
    await expect(focused).toHaveText(next, { useInnerText: true });
    expect(unexpected, 'API calls nothing answered').toEqual([]);
  });
}
