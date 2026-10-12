/**
 * Settings for the hermetic signed-in journey (journey-hermetic.spec.ts):
 * the in-memory fake Supabase that playwright.config.ts starts next to the
 * app (tests/e2e/fake-supabase.mjs). The app has to be built against it,
 * because NEXT_PUBLIC_SUPABASE_URL is inlined at build time:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3201 NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder npm run build
 *
 * CI builds that way. A build against any other URL (the README's
 * https://example.supabase.co placeholder, a staging project) runs every
 * other spec as usual; the hermetic journey then skips locally and fails in CI.
 */

export const FAKE_SUPABASE_PORT = Number(process.env.E2E_FAKE_SUPABASE_PORT || 3201);
export const FAKE_SUPABASE_URL = `http://127.0.0.1:${FAKE_SUPABASE_PORT}`;
/** The fake treats this bearer token as the service role; any other non-JWT key is anon. */
export const FAKE_SERVICE_ROLE_KEY = 'e2e-service-role-key';

/** Whether a Content-Security-Policy's connect-src lets the page reach the fake (i.e. the build targets it). */
export function cspAllowsFakeSupabase(csp: string | undefined): boolean {
  const connect = /(?:^|;)\s*connect-src([^;]*)/i.exec(csp ?? '')?.[1] ?? '';
  return connect.split(/\s+/).includes(FAKE_SUPABASE_URL);
}
