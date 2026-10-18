/**
 * Public identity of the site, used for absolute URLs in metadata, the OG
 * image, robots.txt and the sitemap. SITE_URL also reads Vercel's server-side
 * system variables, so use it from server code (metadata routes and layouts);
 * the name, copy and brand constants are safe anywhere.
 */

import { BRAND_COLORS, THEMES } from '@/lib/design/tokens';

export const SITE_NAME = 'Politicon';

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Normalises a base URL to an origin (plus any path) with no trailing slash.
 * Accepts a bare host ("getpoliticon.app", as Vercel's variables give it) and
 * returns null when the value is missing or isn't a valid http(s) URL.
 */
export function normaliseSiteUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(value);
  try {
    const url = new URL(hasScheme ? value : `https://${value}`);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/** True for localhost and loopback addresses, which no visitor or crawler can reach. */
export function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host.endsWith('.localhost') || /^127\./.test(host) || host === '[::1]' || host === '0.0.0.0';
  } catch {
    return false;
  }
}

/**
 * The site's public base URL. Nothing is guessed; the first of these wins:
 *  1. NEXT_PUBLIC_APP_URL, this deployment's own setting. A localhost value
 *     (the .env.example default) is ignored on Vercel.
 *  2. On a Vercel preview, that preview's branch or deployment URL.
 *  3. The Vercel project's production domain (VERCEL_PROJECT_PRODUCTION_URL),
 *     then this deployment's own URL (VERCEL_URL).
 *  4. http://localhost:PORT, for local development.
 * Steps 2 and 3 match Next's own metadataBase fallback, which an explicit
 * metadataBase would otherwise switch off.
 */
export function resolveSiteUrl(env: Env = process.env): string {
  const configured = normaliseSiteUrl(env.NEXT_PUBLIC_APP_URL);
  if (configured && !(env.VERCEL && isLoopbackUrl(configured))) return configured;
  const preview = env.VERCEL_ENV === 'preview';
  for (const candidate of [
    preview ? env.VERCEL_BRANCH_URL : undefined,
    preview ? env.VERCEL_URL : undefined,
    env.VERCEL_PROJECT_PRODUCTION_URL,
    env.VERCEL_URL,
  ]) {
    const url = normaliseSiteUrl(candidate);
    if (url) return url;
  }
  return `http://localhost:${env.PORT || 3000}`;
}

/** Absolute base URL of the deployed site, without a trailing slash. */
export const SITE_URL = resolveSiteUrl();

if (process.env.NODE_ENV === 'production' && isLoopbackUrl(SITE_URL)) {
  console.warn(
    `[site] No public URL is configured, so link previews, robots.txt and sitemap.xml point at ${SITE_URL}. ` +
      'Set NEXT_PUBLIC_APP_URL to this site\'s public URL (for example https://www.example.com) before building.'
  );
}

export const SITE_TAGLINE = 'See what real bills could mean for your money.';

/** Default meta description: what the product is, stated plainly. */
export const SITE_DESCRIPTION =
  'An educational, non-partisan AI Policy Guide. Politicon reads official bill records, starting with Congress.gov, and estimates how each bill could affect your household budget, with its assumptions shown.';

/**
 * Brand colours for generated images (the OG and apple icons), which can't use
 * CSS variables. Read from lib/design/tokens.ts so they never drift.
 */
export const BRAND = {
  paper: BRAND_COLORS.paper,
  porcelain: BRAND_COLORS.porcelain,
  ink: BRAND_COLORS.ink,
  /** Secondary text on paper (AA). */
  muted: THEMES.light.muted,
  violet: BRAND_COLORS.violet,
  /** Violet for text on paper (AA). */
  violetText: THEMES.light.violetText,
  violetLight: BRAND_COLORS.violetLight,
  violetGlow: BRAND_COLORS.violetGlow,
  night: BRAND_COLORS.night,
} as const;
