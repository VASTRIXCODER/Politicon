import type { Locator, Page } from '@playwright/test';
import { expect } from './support';

/**
 * Steps of the signed-in journey, shared by the hermetic run
 * (journey-hermetic.spec.ts: fake Supabase, mocked AI) and the optional
 * staging run (journey.spec.ts: a real project and real model calls). Each
 * drives the real UI by role and label; only the waits differ between the two.
 */

export interface Account {
  email: string;
  password: string;
  firstName?: string;
}

export interface JourneyTimeouts {
  /** Until the dashboard's policy feed shows cards. */
  feed: number;
  /** Until an analysis started from the dashboard finishes. */
  analysis: number;
  /** Until the guide replies to a message. */
  reply: number;
}

/**
 * Creates the account on /auth/signup. Ends on /onboarding; throws with an
 * explanation when the project wants an email confirmed first, or the address
 * is taken.
 */
export async function signUp(page: Page, account: Account) {
  await page.goto('/auth/signup');
  await expect(page.getByRole('heading', { level: 1, name: /get your impact report/i })).toBeVisible();
  await page.getByLabel('First name').fill(account.firstName ?? 'E2E');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByLabel('Year of birth').selectOption(String(new Date().getFullYear() - 35));
  await page.getByRole('checkbox', { name: /18 or older/i }).check();
  await page.getByRole('button', { name: 'Create free account' }).click();

  const inbox = page.getByRole('heading', { level: 1, name: 'Check your inbox' });
  await until('the sign-up result', 30_000, async () => {
    if (new URL(page.url()).pathname.startsWith('/onboarding')) return true;
    if (await inbox.count()) {
      throw new Error(`The project requires email confirmation: confirm ${account.email} from its inbox once, then rerun (later runs sign in).`);
    }
    const error = await alertText(page);
    if (/already exists/i.test(error)) throw new Error(`${account.email} already has an account, with a different password.`);
    if (error) throw new Error(`Sign-up failed: ${error}`);
  });
}

export async function signIn(page: Page, account: Account) {
  await page.goto('/auth/signin');
  await expect(page.getByRole('heading', { level: 1, name: /welcome back/i })).toBeVisible();
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

/**
 * Answers the onboarding question on screen, if it isn't answered yet: the
 * first option of any unanswered single or multiple choice, the first state,
 * and the optional city left blank. Returns its heading's text.
 */
export async function answerOnboardingStep(page: Page): Promise<string> {
  const main = page.locator('main#main');
  const heading = main.getByRole('heading', { level: 1 });
  await expect(heading).toHaveCount(1);
  const select = main.locator('select');
  for (let i = 0; i < (await select.count()); i++) {
    if (!(await select.nth(i).inputValue())) await select.nth(i).selectOption({ index: 1 });
  }
  const radiogroups = main.getByRole('radiogroup');
  for (let i = 0; i < (await radiogroups.count()); i++) {
    const group = radiogroups.nth(i);
    if (!(await group.locator('[aria-checked="true"]').count())) await group.getByRole('radio').first().click();
  }
  const groups = main.getByRole('group');
  for (let i = 0; i < (await groups.count()); i++) {
    const toggles = groups.nth(i).locator('button[aria-pressed]');
    if ((await toggles.count()) && !(await groups.nth(i).locator('button[aria-pressed="true"]').count())) {
      await groups.nth(i).locator('button[aria-pressed]:enabled').first().click();
    }
  }
  return (await heading.innerText()).trim();
}

/** The onboarding step's forward button (Continue, Skip, or the last step's). */
export const onboardingNext = (page: Page) =>
  page.locator('main#main').getByRole('button', { name: /^(continue|skip|see my impact|skip and see my impact)$/i });

/**
 * Answers onboarding questions until the progress bar reads `stop` (1-based),
 * or every question when `stop` is omitted. Every question ends on the
 * dashboard; a `stop` leaves that question on screen, unanswered.
 */
export async function completeOnboarding(page: Page, stop?: number) {
  const main = page.locator('main#main');
  const progress = page.getByRole('progressbar', { name: 'Profile setup progress' });
  await expect(progress).toBeVisible({ timeout: 30_000 });
  const total = Number(await progress.getAttribute('aria-valuemax'));

  let previous = '';
  for (let guard = 0; guard < total + 2; guard++) {
    const step = Number(await progress.getAttribute('aria-valuenow'));
    // Questions swap with an exit animation: wait until the new one has replaced the old.
    const heading = main.getByRole('heading', { level: 1 });
    await expect(heading).toHaveCount(1);
    if (previous) await expect(heading).not.toHaveText(previous);
    if (stop !== undefined && step >= stop) return;
    previous = await answerOnboardingStep(page);

    const next = onboardingNext(page);
    await expect(next).toBeEnabled();
    const last = step === total;
    await next.click();
    if (last) break;
    await expect(progress).toHaveAttribute('aria-valuenow', String(step + 1));
  }

  await expect(page.getByRole('status').filter({ hasText: 'Profile saved' })).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

/** The dashboard greets the user and shows the Policy Feed section. */
export async function expectDashboard(page: Page, firstName?: string) {
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  const greeting = page.getByRole('heading', { level: 1, name: /^good (morning|afternoon|evening)/i });
  await expect(greeting).toBeVisible({ timeout: 30_000 });
  if (firstName) await expect(greeting).toContainText(firstName);
  await expect(page.getByRole('heading', { level: 2, name: 'Policy Feed' })).toBeVisible();
}

/** Waits for the feed's cards; returns all of them. */
export async function waitForFeed(page: Page, timeout: number): Promise<Locator> {
  const cards = page.locator('[data-feed-card]');
  await until('the policy feed', timeout, async () => ((await cards.count()) ? true : feedProblem(page)));
  return cards;
}

/** The card whose title is `title` (titles are unique within a feed). */
export function feedCard(page: Page, title: string): Locator {
  return page.locator('[data-feed-card]').filter({ has: page.locator('[data-feed-card-title]', { hasText: title }) });
}

export async function cardTitle(card: Locator): Promise<string> {
  // The title starts with the bill number when there is one; the policy's own title follows it.
  const heading = card.locator('[data-feed-card-title]');
  const bill = await heading.locator('span').first().innerText().catch(() => '');
  return (await heading.innerText()).replace(bill, '').trim();
}

/** Starts the card's analysis (unless it's already done) and waits for "View full impact". */
export async function analyzeFromDashboard(page: Page, card: Locator, timeout: number) {
  const analyze = card.getByRole('button', { name: /analyze impact/i });
  if (await analyze.count()) {
    await analyze.click();
    await expect(card.getByRole('button', { name: /analyzing/i })).toBeVisible();
  }
  const viewImpact = card.getByRole('link', { name: /view full impact/i });
  await until('the analysis', timeout, async () => {
    if (await viewImpact.count()) return true;
    const error = await alertText(page);
    if (error) throw new Error(`Analysis failed: ${error}`);
  });
}

/** Opens the card's full impact page, checks it shows an analysis, and comes back to the dashboard. */
export async function openFullImpactAndReturn(page: Page, card: Locator, title: string) {
  await card.getByRole('link', { name: /view full impact/i }).click();
  await expect(page).toHaveURL(/\/impact\/[^/]+$/);
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toBeVisible({ timeout: 60_000 });
  await expect(h1).not.toHaveText(/no analysis yet|update this analysis/i);
  await expect(h1).toContainText(title);
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard/);
}

/**
 * "Ask the guide" on the card: the guide opens with the policy question in the
 * composer (not sent), the user sends it and a saved, ratable reply comes back.
 */
export async function askGuideAbout(page: Page, card: Locator, title: string, timeouts: Pick<JourneyTimeouts, 'feed' | 'reply'>) {
  await card.getByRole('button', { name: /ask the guide/i }).click();
  await expect(page).toHaveURL(/\/advisor\?policyId=/);
  await expect(page.getByRole('heading', { level: 1, name: 'AI Policy Guide' })).toBeVisible();

  const composer = page.getByRole('textbox', { name: 'Message the Policy Guide' });
  // Filled in (not sent) once the guide's copy of the feed has loaded.
  await expect(composer).toHaveValue(`Tell me about the financial impact of ${title}`, { timeout: timeouts.feed });

  const log = page.getByRole('log', { name: 'Conversation' });
  const replies = log.getByText('Policy Guide said:');
  const before = await replies.count();
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(log.getByText('You said:')).toHaveCount(1);
  await expect(replies).toHaveCount(before + 1, { timeout: timeouts.reply });
  await expect(log.getByText('The Policy Guide is typing…')).toHaveCount(0);
  await expect(log.getByRole('button', { name: 'Try again' }), 'the reply is not an error').toHaveCount(0);
  // Only a real model reply in a saved conversation gets rating buttons.
  await expect(log.getByRole('button', { name: 'Helpful' }).first(), 'a saved model reply').toBeVisible({ timeout: 30_000 });
  return log;
}

/** A question from the landing page's search waits in the composer, unsent. */
export async function expectPrefilledQuestion(page: Page) {
  await page.goto('/advisor?q=How%20would%20a%20minimum%20wage%20increase%20affect%20me%3F');
  await expect(page.getByRole('textbox', { name: 'Message the Policy Guide' })).toHaveValue(
    'How would a minimum wage increase affect me?',
  );
  await expect(page.getByRole('log', { name: 'Conversation' }).getByText('You said:')).toHaveCount(0);
}

/** Throws if the dashboard shows a feed error instead of cards. */
export async function feedProblem(page: Page): Promise<undefined> {
  const error = page.getByText(/couldn.t load your feed/i);
  if (await error.count()) throw new Error(`Feed failed: ${(await page.locator('[role="alert"]').allInnerTexts()).join(' ')}`);
  if (await page.getByText('Finish your profile first').count()) throw new Error('The dashboard says the profile is incomplete');
  return undefined;
}

/**
 * Text announced through the page's own role="alert" regions (form errors,
 * error toasts). Queried in the light DOM on purpose: Next's route announcer,
 * also an alert, lives in a shadow root and reads out page titles.
 */
export async function alertText(page: Page): Promise<string> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="alert"]'))
      .map((el) => el.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' | '),
  );
}

/** Polls `check` until it returns a value; it may throw to stop early. */
export async function until<T>(what: string, timeout: number, check: () => Promise<T | undefined>, intervalMs = 500): Promise<T> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`Timed out after ${Math.round(timeout / 1000)}s waiting for ${what}`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
