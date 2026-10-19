import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { FAKE_HOST } from './hermetic-journey';
import { focusedVisibility, openSettings, requireHermeticBuild, settingsAccount, settingsReady } from './settings-support';
import { expect, horizontalOverflow, settle, test } from './support';

/**
 * Settings (R6a) against WCAG 2.2 AA with axe-core, in the light and the
 * dark theme, at rest and with the delete-account dialog open; no sideways
 * scroll on a 375px phone (nor at 320px, where the section bar's labels
 * still fit whole); keyboard focus never hidden under the bars that float
 * over the page (2.4.11, which axe doesn't test) while the profile has
 * unsaved changes; choices that stay visible in forced colours; and a
 * keyboard pass through the Experience section's controls (theme, visual
 * effects, pause motion, sound, reading mode), each reached with Tab,
 * changed with the keys its pattern uses, and shown with a focus ring.
 *
 * Signed in hermetically, as a11y-app.spec.ts is: a fresh account on the
 * fake Supabase with a finished profile written straight to its database,
 * so the household editor and its avatar have real answers to show. Needs
 * a build against the fake (tests/e2e/hermetic.ts); otherwise it skips
 * locally and fails in CI. The flows themselves (saving, discarding, the
 * notices, the account forms) are in settings-flows.spec.ts.
 */

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const BLOCKING = new Set(['serious', 'critical']);
const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

test.use({ allowedHosts: [FAKE_HOST], contextOptions: { reducedMotion: 'reduce' } });

async function useTheme(page: Page, theme: Theme) {
  if (theme === 'light') return;
  await page.addInitScript(() => {
    try {
      localStorage.setItem('pc-theme', 'dark');
    } catch {
      // Storage blocked: the page stays light and the theme check fails.
    }
  });
}

async function expectNoSeriousViolations(page: Page, testInfo: TestInfo, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    // Pure decoration (aria-hidden and marked data-decorative) is exempt from contrast (WCAG 1.4.3).
    .exclude('[aria-hidden="true"][data-decorative]')
    .options({ preload: false })
    .analyze();
  const minor = results.violations.filter((v) => !BLOCKING.has(v.impact ?? ''));
  if (minor.length) await testInfo.attach(`axe-minor-violations-${name}.json`, { body: JSON.stringify(minor, null, 2), contentType: 'application/json' });
  const blocking = results.violations.filter((v) => BLOCKING.has(v.impact ?? ''));
  const summary = blocking.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help} ${v.helpUrl}\n` +
      v.nodes
        .slice(0, 5)
        .map((n) => `    ${n.target.join(' ')}: ${n.failureSummary?.split('\n').slice(1).join(' ').trim()}`)
        .join('\n')
  );
  expect(blocking.map((v) => v.id), `${name}:\n${summary.join('\n')}`).toEqual([]);
}

/** No sideways scroll at 375px (the phone project is already that wide; the desktop one narrows to it). */
async function expectNoOverflowAt375(page: Page) {
  const viewport = page.viewportSize();
  if (viewport && viewport.width !== 375) {
    await page.setViewportSize({ width: 375, height: 812 });
    await settingsReady(page);
  }
  const { overflow, culprits } = await horizontalOverflow(page);
  expect(overflow, `scrolls sideways at 375px: ${culprits.join(', ')}`).toBe(0);
}

/** At 320px (or 400% zoom on a 1280px screen): no sideways scroll, and the section bar's labels fit whole. */
async function expectReflowAt320(page: Page) {
  await page.setViewportSize({ width: 320, height: 700 });
  await settingsReady(page);
  const { overflow, culprits } = await horizontalOverflow(page);
  expect(overflow, `scrolls sideways at 320px: ${culprits.join(', ')}`).toBe(0);
  const clipped = await page
    .getByRole('navigation', { name: 'Settings sections' })
    .locator('a > span > span:first-child')
    .evaluateAll((spans) => spans.filter((s) => s.scrollWidth > s.clientWidth + 1).map((s) => s.textContent));
  expect(clipped, 'section labels cut short at 320px').toEqual([]);
}

/** The focused element is `target`, and it shows the focus ring (keyboard focus, :focus-visible). */
async function expectFocusRing(target: Locator) {
  await expect(target).toBeFocused();
  const ring = await target.evaluate((el) => {
    const style = getComputedStyle(el);
    return { visible: el.matches(':focus-visible'), outline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0, shadow: style.boxShadow !== 'none' };
  });
  expect(ring.visible, 'keyboard focus matches :focus-visible').toBe(true);
  expect(ring.outline || ring.shadow, 'a focus ring is drawn').toBe(true);
}

for (const theme of THEMES) {
  const suffix = theme === 'dark' ? ' (dark theme)' : '';

  test.describe(`settings${suffix}`, () => {
    test.beforeEach(async ({ request }) => {
      await requireHermeticBuild(request);
    });

    test(`/settings has no serious WCAG 2.2 AA violations, fits 375px, and its delete dialog passes too${suffix}`, async ({ page, request }, testInfo) => {
      test.setTimeout(120_000);
      await useTheme(page, theme);
      const { unexpected } = await settingsAccount(page, request);

      await openSettings(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expectNoSeriousViolations(page, testInfo, 'settings');
      // With unsaved changes too: the save bar follows the screen.
      await page.locator('main#main').getByRole('radiogroup', { name: 'Annual household income' }).getByRole('radio', { name: '$75,000 – $100,000' }).click();
      await expect(page.locator('main#main').getByText('Unsaved changes', { exact: true })).toBeVisible();
      await settle(page);
      await expectNoSeriousViolations(page, testInfo, 'settings-unsaved');
      await page.locator('main#main').getByRole('button', { name: 'Discard changes' }).click();
      await expect(page.locator('main#main').getByText('No unsaved changes')).toBeVisible();
      await expectNoOverflowAt375(page);

      // The irreversible step, in its dialog: starts in the typed confirmation, and Escape gives focus back.
      const trigger = page.getByRole('button', { name: 'Delete account', exact: true });
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
      const dialog = page.getByRole('alertdialog', { name: 'Delete your account?' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel('Type DELETE to confirm')).toBeFocused();
      await expect(dialog.getByLabel('Your password')).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Permanently delete my account' })).toBeVisible();
      await settle(page);
      await expectNoSeriousViolations(page, testInfo, 'delete-dialog');
      const { overflow, culprits } = await horizontalOverflow(page);
      expect(overflow, `scrolls sideways at 375px with the dialog open: ${culprits.join(', ')}`).toBe(0);

      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();

      await expectReflowAt320(page);
      expect(unexpected, 'API calls nothing answered').toEqual([]);
    });
  });
}

/**
 * Tabs through the profile, forward from State to the end of the section and
 * back again, and returns every stop whose centre was off screen or under
 * something else (the navbar, the section bar, the save bar, a toast).
 */
async function hiddenFocusStops(page: Page) {
  const state = await page.locator('main#main').getByLabel('State', { exact: true }).elementHandle();
  const hidden: string[] = [];
  const where = () =>
    page.evaluate((s) => (document.activeElement === s ? 'state' : document.activeElement?.closest('section#profile') ? 'profile' : 'out'), state);
  const step = async (key: 'Tab' | 'Shift+Tab') => {
    await page.keyboard.press(key);
    const at = await where();
    if (at !== 'out') {
      const v = await focusedVisibility(page);
      if (!v.inView || !v.uncovered) hidden.push(`${key} "${v.name}" [${v.top}-${v.bottom}] ${v.inView ? `under ${v.cover}` : 'off screen'}`);
    }
    return at;
  };
  await state!.focus();
  let stops = 0;
  // Forward to the first stop after the profile (the Experience section)…
  while ((await step('Tab')) !== 'out') if (++stops > 80) throw new Error('Tab never left the profile');
  // …and back up to State.
  while ((await step('Shift+Tab')) !== 'state') if (++stops > 160) throw new Error('Shift+Tab never got back to State');
  expect(stops, 'the walk passed through the whole profile').toBeGreaterThan(40);
  return hidden;
}

test.describe('settings focus, never hidden', () => {
  test.beforeEach(async ({ request }) => {
    await requireHermeticBuild(request);
  });

  test('keyboard focus stays clear of the navbar, the section bar and the save bar while the profile has unsaved changes (2.4.11)', async ({ page, request }) => {
    test.setTimeout(150_000);
    const { unexpected } = await settingsAccount(page, request);
    await openSettings(page);
    const main = page.locator('main#main');
    // Unsaved changes: the save bar follows the screen.
    await main.getByRole('radiogroup', { name: 'Annual household income' }).getByRole('radio', { name: '$75,000 – $100,000' }).click();
    await expect(main.getByText('Unsaved changes', { exact: true })).toBeVisible();
    await expect(saveBarPosition(page)).resolves.toBe('sticky');

    const hidden = await hiddenFocusStops(page);
    expect(hidden, 'focus stops hidden from view').toEqual([]);
    expect(unexpected, 'API calls nothing answered').toEqual([]);
  });

  test('a choice stays visible in forced colours (Windows High Contrast) @desktop-only', async ({ page, request }) => {
    test.setTimeout(120_000);
    await settingsAccount(page, request);
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await openSettings(page);
    const main = page.locator('main#main');
    // The chosen tile takes a Highlight rim, and its dot is drawn again in the text colour.
    const income = main.getByRole('radiogroup', { name: 'Annual household income' });
    const chosen = income.getByRole('radio', { name: '$50,000 – $75,000' });
    const other = income.getByRole('radio', { name: '$75,000 – $100,000' });
    const rim = (tile: Locator) => tile.evaluate((el) => getComputedStyle(el).borderTopWidth);
    expect(await rim(chosen)).toBe('2px');
    expect(await rim(other)).toBe('1px');
    const drawnMarks = (tile: Locator) => tile.locator('span.hidden').evaluateAll((els) => els.filter((e) => getComputedStyle(e).display === 'flex').length);
    expect(await drawnMarks(chosen)).toBe(1);
    expect(await drawnMarks(other)).toBe(0);
    // A pressed toggle (a debt) too.
    const mortgage = main.getByRole('button', { name: 'Mortgage', pressed: true });
    expect(await rim(mortgage)).toBe('2px');
    // Its own check (onboarding's mark, which onboarding shows alone) stands out from its box
    // whichever way the contrast theme leans against the page's light theme: a dark contrast
    // theme over a light page once drew it black on the black box.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce', colorScheme });
      const [stroke, box] = await mortgage.evaluate((el) => {
        const check = el.querySelector('svg');
        return check?.parentElement ? [getComputedStyle(check).stroke, getComputedStyle(check.parentElement).backgroundColor] : ['no check', ''];
      });
      expect(stroke, `the check on its box, under a ${colorScheme} contrast theme`).not.toBe(box);
      expect(stroke).not.toBe('no check');
    }
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce', colorScheme: 'light' });
    // The current section is underlined in the section nav.
    const current = page.getByRole('navigation', { name: 'Settings sections' }).locator('a[aria-current="location"] span.block').first();
    expect(await current.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('underline');
  });
});

async function saveBarPosition(page: Page) {
  return page.locator('main#main [data-settings-overlay]').evaluate((el) => getComputedStyle(el).position);
}

test.describe('settings by keyboard', () => {
  test.beforeEach(async ({ request }) => {
    await requireHermeticBuild(request);
  });

  test('every Experience control is reached with Tab and changed with its keys @desktop-only', async ({ page, request }) => {
    test.setTimeout(120_000);
    const { unexpected, database, userId } = await settingsAccount(page, request);

    // A link to the section lands on it, with its heading focused (the next Tab starts there).
    await openSettings(page, '#experience');
    const html = page.locator('html');
    const experience = page.locator('section#experience');
    await expect(page.locator('#settings-experience-title')).toBeFocused();
    await expect(page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: /experience/i })).toHaveAttribute('aria-current', 'location');

    // Theme: one Tab stop on the current choice (Light, the default); arrows move and choose, wrapping at the end.
    const theme = experience.getByRole('radiogroup', { name: 'Theme' });
    await page.keyboard.press('Tab');
    await expectFocusRing(theme.getByRole('radio', { name: 'Light' }));
    await expect(theme.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(theme.getByRole('radio', { name: 'Dark' })).toBeFocused();
    await expect(theme.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    await expect(html).toHaveAttribute('data-theme', 'dark');
    // System follows the device, which is light here.
    await page.keyboard.press('ArrowRight');
    await expect(theme.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');
    await expect(html).toHaveAttribute('data-theme', 'light');
    await page.keyboard.press('ArrowRight');
    await expect(theme.getByRole('radio', { name: 'Light' })).toBeFocused();
    await expect(theme.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
    expect(await page.evaluate(() => localStorage.getItem('pc-theme'))).toBe('light');

    // Visual effects: the same pattern, saved on this device.
    const effects = experience.getByRole('radiogroup', { name: 'Visual effects' });
    await page.keyboard.press('Tab');
    await expectFocusRing(effects.getByRole('radio', { name: 'Full' }));
    await page.keyboard.press('ArrowRight');
    await expect(effects.getByRole('radio', { name: 'Reduced' })).toHaveAttribute('aria-checked', 'true');
    expect(await page.evaluate(() => localStorage.getItem('pc-fx'))).toBe('reduced');
    await page.keyboard.press('ArrowLeft');
    await expect(effects.getByRole('radio', { name: 'Full' })).toHaveAttribute('aria-checked', 'true');

    // Pause motion: a switch, toggled with Space and Enter, that holds the whole page still.
    const pause = experience.getByRole('switch', { name: 'Pause motion' });
    await page.keyboard.press('Tab');
    await expectFocusRing(pause);
    await expect(pause).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Space');
    await expect(pause).toHaveAttribute('aria-checked', 'true');
    await expect(html).toHaveAttribute('data-motion', 'paused');
    await page.keyboard.press('Enter');
    await expect(pause).toHaveAttribute('aria-checked', 'false');
    await expect(html).not.toHaveAttribute('data-motion', 'paused');

    // Sound effects: off until asked for.
    const sound = experience.getByRole('switch', { name: 'Sound effects' });
    await page.keyboard.press('Tab');
    await expectFocusRing(sound);
    await expect(sound).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Space');
    await expect(sound).toHaveAttribute('aria-checked', 'true');
    expect(await page.evaluate(() => localStorage.getItem('pc-sound'))).toBe('on');
    await page.keyboard.press('Space');
    await expect(sound).toHaveAttribute('aria-checked', 'false');

    // Reading mode: a radio group too, and saved to the account (it follows the user across devices).
    const reading = experience.getByRole('radiogroup', { name: 'Reading mode' });
    await page.keyboard.press('Tab');
    await expectFocusRing(reading.getByRole('radio', { name: /^Expert Mode/ }));
    await expect(reading.getByRole('radio', { name: /^Expert Mode/ })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(reading.getByRole('radio', { name: /^Simple Mode/ })).toBeFocused();
    await expect(reading.getByRole('radio', { name: /^Simple Mode/ })).toHaveAttribute('aria-checked', 'true');
    await expect
      .poll(async () => (await database.select<{ reading_mode: string }>('user_profiles', `select=reading_mode&id=eq.${userId}`))[0]?.reading_mode, {
        message: 'reading mode saved to the account',
        timeout: 10_000,
      })
      .toBe('simple');

    // The next Tab leaves Experience for Account, in page order.
    await page.keyboard.press('Tab');
    const next = await page.evaluate(() => document.activeElement?.closest('section')?.id ?? null);
    expect(next, 'focus moves on into the Account section').toBe('account');
    expect(unexpected, 'API calls nothing answered').toEqual([]);
  });
});
