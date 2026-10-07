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
