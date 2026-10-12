import { PROTECTED_PATHS, PUBLIC_PAGES, expect, openPage, test } from './support';

// Signed-out visitors to app pages are sent to sign-in, and the place they
// were heading (path and query) travels along in ?next so they land there
// after signing in. The landing page's search hands its question to the AI
// Policy Guide the same way.

/** The ?next value on the current sign-in URL, parsed against the app origin. */
function nextTarget(url: string) {
  const current = new URL(url);
  expect(current.pathname, 'redirected to sign-in').toBe('/auth/signin');
  const next = current.searchParams.get('next');
  expect(next, '?next is set').toBeTruthy();
  expect(next!.startsWith('/') && !next!.startsWith('//'), 'next is a same-site path').toBe(true);
  return new URL(next!, current.origin);
}

test('/dashboard sends a signed-out visitor to sign-in with next=/dashboard', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/auth\/signin\?/);
  const next = nextTarget(page.url());
  expect(`${next.pathname}${next.search}`).toBe('/dashboard');
  await expect(page.getByRole('heading', { level: 1, name: PUBLIC_PAGES.find((p) => p.path === '/auth/signin')!.h1 })).toBeVisible();
});

test('/advisor?q=hello keeps the question through sign-in', async ({ page }) => {
  await page.goto('/advisor?q=hello');
  await expect(page).toHaveURL(/\/auth\/signin\?/);
  const next = nextTarget(page.url());
  expect(next.pathname).toBe('/advisor');
  expect(next.searchParams.get('q')).toBe('hello');

  // "Sign up free" carries the same destination to the sign-up page.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const signup = new URL((await page.getByRole('link', { name: /sign up free/i }).getAttribute('href'))!, page.url());
  expect(signup.pathname).toBe('/auth/signup');
  expect(signup.searchParams.get('next')).toBe('/advisor?q=hello');
});

for (const path of PROTECTED_PATHS) {
  test(`${path} answers signed-out requests with a redirect to sign-in`, async ({ request }) => {
    const res = await request.get(`${path}?from=e2e`, { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    const location = new URL(res.headers()['location'], 'http://placeholder.invalid');
    expect(location.pathname).toBe('/auth/signin');
    expect(location.searchParams.get('next')).toBe(`${path}?from=e2e`);
  });
}

test('the hero search opens the AI Policy Guide with the question, via sign-in', async ({ page }) => {
  await openPage(page, '/', PUBLIC_PAGES[0].h1);
  const search = page.getByRole('search');
  await search.getByRole('textbox', { name: /ask about a policy/i }).fill('minimum wage');
  await search.getByRole('button', { name: 'Ask' }).click();

  await expect(page).toHaveURL(/\/auth\/signin\?/);
  const next = nextTarget(page.url());
  expect(next.pathname).toBe('/advisor');
  expect(next.searchParams.get('q')).toBe('minimum wage');
});

test('the hero search submits with Enter too', async ({ page }) => {
  await openPage(page, '/', PUBLIC_PAGES[0].h1);
  const box = page.getByRole('search').getByRole('textbox', { name: /ask about a policy/i });
  await box.fill('housing tax credit');
  await box.press('Enter');

  await expect(page).toHaveURL(/\/auth\/signin\?/);
  expect(nextTarget(page.url()).searchParams.get('q')).toBe('housing tax credit');
});

test('the hero search needs a question', async ({ page }) => {
  await openPage(page, '/', PUBLIC_PAGES[0].h1);

  // A submission is a request for /advisor?q=… (a document load or next/form's
  // RSC fetch); links elsewhere on the page never carry ?q.
  const submissions: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/advisor' && url.searchParams.has('q')) submissions.push(request.url());
  });
  // Settles to true if the page leaves the landing page within the window, false otherwise.
  const navigated = page
    .waitForURL((url) => url.pathname !== '/', { timeout: 2_000 })
    .then(() => true, () => false);

  await page.getByRole('search').getByRole('button', { name: 'Ask' }).click();

  expect(await navigated, 'the empty question navigated away').toBe(false);
  expect(submissions, 'requests made for the empty question').toEqual([]);
  expect(new URL(page.url()).pathname).toBe('/');
  const valid = await page.getByRole('search').getByRole('textbox').evaluate((el) => (el as HTMLInputElement).validity.valid);
  expect(valid, 'empty question is invalid').toBe(false);
});

test('a sign-in link with an off-site next is ignored', async ({ page }) => {
  await page.goto('/auth/signin?next=//evil.example/steal');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const signup = await page.getByRole('link', { name: /sign up free/i }).getAttribute('href');
  expect(signup).toBe('/auth/signup');
});
