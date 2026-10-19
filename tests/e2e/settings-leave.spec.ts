import type { Page } from '@playwright/test';
import { FAKE_HOST } from './hermetic-journey';
import { openSettings, requireHermeticBuild, settingsAccount } from './settings-support';
import { expect, test } from './support';

/**
 * The leave-page warning on Settings (app/settings/_components/LeaveGuard.tsx):
 * with unsaved changes, a link to another page of the app asks first (keep
 * editing, or leave without saving), and closing or reloading the tab gets
 * the browser's own prompt; links within the page, and a page with nothing
 * unsaved, go straight through. The browser's Back and Forward buttons are
 * out of its scope (LeaveGuard's comment says why).
 *
 * Needs a build against the fake Supabase (tests/e2e/hermetic.ts), like the
 * other settings specs. Desktop only: the navbar's links are in a menu on phones.
 */

test.use({ allowedHosts: [FAKE_HOST], contextOptions: { reducedMotion: 'reduce' } });

test.beforeEach(async ({ request }) => {
  await requireHermeticBuild(request);
});

const main = (page: Page) => page.locator('main#main');
const income = (page: Page) => main(page).getByRole('radiogroup', { name: 'Annual household income' });
const dashboardLink = (page: Page) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Dashboard', exact: true });
const leaveDialog = (page: Page) => page.getByRole('alertdialog', { name: 'Leave without saving?' });

/** Whether closing or reloading the tab would be held (the page cancels beforeunload). */
const unloadHeld = (page: Page) =>
  page.evaluate(() => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });

test('asks before a link leaves unsaved changes, and keeps editing or leaves as chosen @desktop-only', async ({ page, request }) => {
  test.setTimeout(120_000);
  await settingsAccount(page, request);
  await openSettings(page);
  await expect.poll(() => unloadHeld(page), { message: 'nothing unsaved yet' }).toBe(false);

  const changed = income(page).getByRole('radio', { name: '$100,000 – $150,000' });
  await changed.click();
  await expect(main(page).getByText('Unsaved changes', { exact: true })).toBeVisible();
  await expect.poll(() => unloadHeld(page), { message: 'closing the tab asks first' }).toBe(true);

  // A jump within the page isn't held.
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: /account/i }).click();
  await expect(page.locator('#settings-account-title')).toBeFocused();
  await expect(leaveDialog(page)).toHaveCount(0);

  // A link to another page is: "Keep editing" (where focus starts) stays, change and all.
  await dashboardLink(page).click();
  await expect(leaveDialog(page)).toBeVisible();
  const keep = leaveDialog(page).getByRole('button', { name: 'Keep editing' });
  await expect(keep).toBeFocused();
  await keep.click();
  await expect(leaveDialog(page)).toBeHidden();
  await expect(page).toHaveURL(/\/settings(?:[?#]|$)/);
  await expect(changed).toHaveAttribute('aria-checked', 'true');

  // Escape keeps editing too.
  await dashboardLink(page).click();
  await expect(leaveDialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(leaveDialog(page)).toBeHidden();
  await expect(page).toHaveURL(/\/settings(?:[?#]|$)/);

  // "Leave without saving" goes where the link pointed, without the browser asking again.
  await dashboardLink(page).click();
  await leaveDialog(page).getByRole('button', { name: 'Leave without saving' }).click();
  await expect(page).toHaveURL(/\/dashboard(?:[?#]|$)/);
});

test('saving lets links through again @desktop-only', async ({ page, request }) => {
  test.setTimeout(120_000);
  await settingsAccount(page, request);
  await openSettings(page);

  await income(page).getByRole('radio', { name: '$100,000 – $150,000' }).click();
  await expect(main(page).getByText('Unsaved changes', { exact: true })).toBeVisible();
  const put = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/profile' && r.request().method() === 'PUT');
  await main(page).getByRole('button', { name: 'Save financial profile' }).click();
  expect((await put).status()).toBe(200);
  await expect(main(page).getByText('No unsaved changes')).toBeVisible();
  await expect.poll(() => unloadHeld(page)).toBe(false);

  await dashboardLink(page).click();
  await expect(page).toHaveURL(/\/dashboard(?:[?#]|$)/);
  await expect(leaveDialog(page)).toHaveCount(0);
});

test('a first name typed but not saved counts as unsaved; putting it back does not @desktop-only', async ({ page, request }) => {
  test.setTimeout(120_000);
  await settingsAccount(page, request);
  await openSettings(page, '#account');

  const name = main(page).getByLabel('First name');
  const saved = await name.inputValue();
  await name.fill(`${saved} Jo`);
  await expect.poll(() => unloadHeld(page)).toBe(true);
  await name.fill(saved);
  await expect.poll(() => unloadHeld(page)).toBe(false);
});
