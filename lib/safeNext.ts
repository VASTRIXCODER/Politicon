const BASE = 'http://politicon.invalid';

/**
 * Only same-origin relative paths may be used as a post-login destination.
 * The value is resolved with the real URL parser (which strips tabs/newlines
 * and treats backslashes as slashes), so tricks like "/\t/evil.com" or
 * "/\\evil.com" can't escape to another site.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/')) return null;
  try {
    const url = new URL(value, BASE);
    if (url.origin !== BASE) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/**
 * A validated destination for after onboarding: not onboarding itself, an
 * auth page (both would loop) or the dashboard (the default anyway).
 */
export function afterOnboardingPath(value: string | null | undefined): string | null {
  const next = safeNextPath(value);
  if (!next) return null;
  const path = next.split(/[?#]/)[0];
  const loops = ['/onboarding', '/auth', '/dashboard'].some((r) => path === r || path.startsWith(`${r}/`));
  return loops ? null : next;
}

/** The onboarding page, carrying `next` so a new member ends up where they were heading. */
export function onboardingPath(value: string | null | undefined): string {
  const next = afterOnboardingPath(value);
  return next ? `/onboarding?next=${encodeURIComponent(next)}` : '/onboarding';
}
