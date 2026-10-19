import type { Page } from '@playwright/test';
import { FAKE_HOST } from './hermetic-journey';
import { PASSWORD, focusedVisibility, openSettings, requireHermeticBuild, saveBar, settingsAccount } from './settings-support';
import { expect, test } from './support';

/**
 * What Settings (R6a) does, end to end against the fake Supabase: the
 * financial profile saved (PUT /api/profile, the toast, the row), discarded
 * and refused while incomplete, with focus kept where the person is and the
 * save bar in view; the notices email links land with; the first name and
 * password forms; and the delete dialog's safety catch. Settings' own routes
 * run for real; anything else under /api is refused (settings-support.ts).
 *
 * Needs a build against the fake (tests/e2e/hermetic.ts); otherwise it
 * skips locally and fails in CI. The flows run once, on desktop; the save
 * bar's place after a save or a discard is checked on the phone too.
 */

const SAVED = 'Saved. Your policy feed will rebuild from your updated profile.';
const INCOMPLETE = 'Please answer every required field before saving.';

test.use({ allowedHosts: [FAKE_HOST], contextOptions: { reducedMotion: 'reduce' } });

test.beforeEach(async ({ request }) => {
  await requireHermeticBuild(request);
});

const main = (page: Page) => page.locator('main#main');
/** The page's toast announcements: successes politely (status), errors assertively (alert). */
const announced = (page: Page, role: 'status' | 'alert') => page.locator(`[data-settings-toast] [role="${role}"]`);
const income = (page: Page) => main(page).getByRole('radiogroup', { name: 'Annual Household Income' });

/** The focused element is `name`, its centre on screen and not under a bar or the toast. */
async function expectFocusInView(page: Page, name: string | RegExp) {
  const v = await focusedVisibility(page);
  expect(v.name).toMatch(name);
  expect(v.inView, `"${v.name}" is on screen (${v.top}-${v.bottom})`).toBe(true);
  expect(v.uncovered, `"${v.name}" is not covered (by ${v.cover})`).toBe(true);
}

/** The visible toast and the save bar don't overlap. */
async function expectToastClearOfBar(page: Page) {
  const toast = page.locator('[data-settings-toast] > .fixed');
  await expect(toast).toBeVisible();
  const [t, b] = await Promise.all([toast.boundingBox(), saveBar(page).boundingBox()]);
  expect(t && b, 'both are on screen').toBeTruthy();
  const overlap = t!.x < b!.x + b!.width && t!.x + t!.width > b!.x && t!.y < b!.y + b!.height && t!.y + t!.height > b!.y;
  expect(overlap, `toast ${JSON.stringify(t)} clear of the save bar ${JSON.stringify(b)}`).toBe(false);
}

test('saves the profile with the keyboard: the PUT, the toast, the row, and focus kept on Save in view @desktop-only', async ({ page, request }) => {
  test.setTimeout(120_000);
  const { unexpected, database, userId } = await settingsAccount(page, request);
  await openSettings(page);

  await income(page).getByRole('radio', { name: '$100,000 – $150,000' }).click();
  await expect(main(page).getByText('Unsaved changes', { exact: true })).toBeVisible();
  const save = main(page).getByRole('button', { name: 'Save Financial Profile' });
  await save.focus();
  const put = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/profile' && r.request().method() === 'PUT');
  await page.keyboard.press('Enter');
  expect((await put).status()).toBe(200);
  await expect(announced(page, 'status')).toContainText(SAVED);
  await expect(main(page).getByText('No unsaved changes')).toBeVisible();

  // Focus stays on the button (busy, not disabled, while saving), and the bar stays where it was.
  await expect(save).toBeFocused();
  await expectFocusInView(page, /^Save Financial Profile$/);
  await expectToastClearOfBar(page);

  const [row] = await database.select<{ income_range: string; filing_status: string }>('user_profiles', `select=income_range,filing_status&id=eq.${userId}`);
  expect(row).toMatchObject({ income_range: '100k_150k', filing_status: 'married_joint' });

  // Moving on lets the bar go back to its place under the form.
  await page.keyboard.press('Tab');
  await expect.poll(() => saveBar(page).evaluate((el) => getComputedStyle(el).position)).not.toBe('sticky');
  expect(unexpected, 'API calls nothing answered').toEqual([]);
});

test('discards unsaved changes: the answer reverts, and focus lands on Save, still in view', async ({ page, request }) => {
  test.setTimeout(120_000);
  const { unexpected } = await settingsAccount(page, request);
  await openSettings(page);

  const chosen = income(page).getByRole('radio', { name: '$50,000 – $75,000' });
  const other = income(page).getByRole('radio', { name: '$150,000 – $250,000' });
  await other.click();
  await expect(other).toHaveAttribute('aria-checked', 'true');
  const discard = main(page).getByRole('button', { name: 'Discard changes' });
  await discard.focus();
  await page.keyboard.press('Enter');

  await expect(chosen).toHaveAttribute('aria-checked', 'true');
  await expect(other).toHaveAttribute('aria-checked', 'false');
  await expect(main(page).getByText('No unsaved changes')).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Save Financial Profile' })).toBeFocused();
  await expectFocusInView(page, /^Save Financial Profile$/);
  expect(unexpected, 'API calls nothing answered').toEqual([]);
});

test('keeps the toast clear of the save bar while there are unsaved changes', async ({ page, request }) => {
  test.setTimeout(120_000);
  const { unexpected } = await settingsAccount(page, request);
  await openSettings(page);

  // Save, then change another answer while the success toast is still up.
  await income(page).getByRole('radio', { name: '$100,000 – $150,000' }).click();
  await main(page).getByRole('button', { name: 'Save Financial Profile' }).click();
  await expect(announced(page, 'status')).toContainText(SAVED);
  await income(page).getByRole('radio', { name: '$75,000 – $100,000' }).click();
  await expect(main(page).getByText('Unsaved changes', { exact: true })).toBeVisible();
  const discard = main(page).getByRole('button', { name: 'Discard changes' });
  await discard.focus();
  await expectFocusInView(page, /Discard changes/);
  await expectToastClearOfBar(page);
  expect(unexpected, 'API calls nothing answered').toEqual([]);
});

test('refuses an incomplete profile: no PUT, the toast, and focus on the first missing answer @desktop-only', async ({ page, request }) => {
  test.setTimeout(120_000);
  const { unexpected } = await settingsAccount(page, request, { top_financial_concerns: [] });
  const puts: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PUT' && new URL(r.url()).pathname === '/api/profile') puts.push(r.url());
  });
  await openSettings(page, '', { complete: false });

  await expect(saveBar(page)).toContainText('1 answer needed: Top Financial Concerns');
  await main(page).getByRole('button', { name: 'Save Financial Profile' }).click();
  await expect(announced(page, 'alert')).toHaveText(INCOMPLETE);
  const concerns = main(page).locator('[data-field="topFinancialConcerns"]');
  await expect(concerns.getByRole('button').first()).toBeFocused();
  await expectFocusInView(page, /Rising cost of living/);
  expect(puts, 'nothing was sent').toEqual([]);
  expect(unexpected, 'API calls nothing answered').toEqual([]);
});

test('shows an email link’s notice, cleans it from the address and lands on Account @desktop-only', async ({ page, request }) => {
  test.setTimeout(120_000);
  const { unexpected } = await settingsAccount(page, request);
  await openSettings(page, '?notice=link_invalid#account');

  await expect(announced(page, 'alert')).toHaveText('That link is invalid or has expired. You’re still signed in.');
  await expect(page.locator('[data-settings-toast] > .fixed')).toContainText('That link is invalid or has expired.');
  expect(new URL(page.url()).search).toBe('');
  expect(new URL(page.url()).hash).toBe('#account');
  await expect(page.locator('#settings-account-title')).toBeFocused();
  await expect(page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: /account/i })).toHaveAttribute('aria-current', 'location');
  expect(unexpected, 'API calls nothing answered').toEqual([]);
});

test('saves the first name to the header and the profile, focus kept on the button @desktop-only', async ({ page, request }) => {
  test.setTimeout(120_000);
  const { unexpected, database, userId } = await settingsAccount(page, request);
  await openSettings(page, '#account');

  await main(page).getByLabel('First Name').fill('Robin');
  const button = main(page).getByRole('button', { name: 'Save Changes' });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(announced(page, 'status')).toContainText('Profile updated successfully');
  await expect(button).toBeFocused();
  // The header's chip says whose settings these are.
  await expect(main(page).getByText('Signed in as').locator('..')).toContainText('Robin');
  const [row] = await database.select<{ first_name: string }>('user_profiles', `select=first_name&id=eq.${userId}`);
  expect(row.first_name).toBe('Robin');
  expect(unexpected, 'API calls nothing answered').toEqual([]);
});

test('changes the password after the current one checks out, then focus goes back to the emptied form @desktop-only', async ({ page, request }) => {
  test.setTimeout(120_000);
  const { unexpected } = await settingsAccount(page, request);
  await openSettings(page, '#account');

  const update = main(page).getByRole('button', { name: 'Update Password' });
  await expect(update).toBeDisabled();
  await main(page).getByLabel('Current Password').fill(PASSWORD);
  await main(page).getByLabel('New Password', { exact: true }).fill('N3w-horse-battery!');
  await main(page).getByLabel('Confirm New Password').fill('N3w-horse-battery!');
  await expect(main(page).getByText('Password strength: Strong')).toBeVisible();
  await update.focus();
  await page.keyboard.press('Enter');
  await expect(announced(page, 'status')).toContainText('Password updated. Other devices have been signed out.');
  await expect(main(page).getByLabel('Current Password')).toBeFocused();
  await expect(main(page).getByLabel('New Password', { exact: true })).toHaveValue('');
  await expect(update).toBeDisabled();
  expect(unexpected, 'API calls nothing answered').toEqual([]);
});

test('the delete dialog’s safety catch: the typed DELETE, a wrong password, and Cancel clearing both @desktop-only', async ({ page, request }) => {
  test.setTimeout(120_000);
  const { unexpected, database, userId } = await settingsAccount(page, request);
  await openSettings(page, '#account');

  const trigger = main(page).getByRole('button', { name: 'Delete Account', exact: true });
  await trigger.click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete your account?' });
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByLabel('Type DELETE to confirm');
  const password = dialog.getByLabel('Your password');
  const go = dialog.getByRole('button', { name: 'Permanently Delete My Account' });

  // Nothing typed: the reason shows beside the field, which takes focus.
  await go.click();
  await expect(dialog.getByRole('alert')).toHaveText('Type DELETE to confirm');
  await expect(confirm).toBeFocused();
  await expect(confirm).toHaveAttribute('aria-invalid', 'true');

  // The wrong password: the route refuses it, and the password field is selected to retype.
  await confirm.fill('DELETE');
  await password.fill('not-my-password');
  const del = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/account/delete');
  await go.click();
  expect((await del).status()).toBe(403);
  await expect(dialog.getByRole('alert')).toHaveText('That password is incorrect.');
  await expect(password).toBeFocused();
  await expect(password).toHaveAttribute('aria-invalid', 'true');

  // Cancel closes it, the account untouched, and empties it for next time.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  const rows = await database.select<{ id: string }>('user_profiles', `select=id&id=eq.${userId}`);
  expect(rows).toHaveLength(1);
  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(confirm).toHaveValue('');
  await expect(password).toHaveValue('');
  await expect(dialog.getByRole('alert')).toHaveText('');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(unexpected, 'API calls nothing answered').toEqual([]);
});
