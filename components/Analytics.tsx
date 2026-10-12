/**
 * Vercel Web Analytics and Speed Insights, loaded as Vercel's documented
 * plain-HTML snippets rather than the @vercel/* npm packages. Both scripts
 * and the beacons they send live under /_vercel/ on this site's own origin,
 * so the Content-Security-Policy's 'self' already covers them and no third
 * party is contacted.
 *
 * Rendered only on Vercel deployments (VERCEL or NEXT_PUBLIC_VERCEL_ENV is
 * set) and never when NEXT_PUBLIC_ANALYTICS_DISABLED=1. The project must also
 * have Web Analytics and Speed Insights enabled in the Vercel dashboard;
 * otherwise the two scripts 404 and nothing is collected.
 *
 * Custom events go through lib/track.ts.
 */

type Env = Readonly<Record<string, string | undefined>>;

export function analyticsEnabled(env: Env = process.env): boolean {
  const disabled = (env.NEXT_PUBLIC_ANALYTICS_DISABLED || '').trim().toLowerCase();
  if (disabled === '1' || disabled === 'true') return false;
  return Boolean(env.VERCEL || env.NEXT_PUBLIC_VERCEL_ENV);
}

/**
 * The queue shims from Vercel's docs (calls made before the scripts load are
 * queued in window.vaq / window.siq), plus a beforeSend hook on both that
 * strips the query string and hash from every reported URL, so one-time
 * tokens (/auth/confirm?token_hash=…), prefilled questions (/advisor?q=…)
 * and other parameters never leave the browser. A policy id in
 * /impact/<id> is reported as the route, /impact/[policyId].
 */
export const ANALYTICS_BOOTSTRAP = `(function () {
  function redact(e) {
    try {
      var u = new URL(e.url, window.location.href);
      u.search = '';
      u.hash = '';
      u.pathname = u.pathname.replace(/^\\/impact\\/[^\\/]+/, '/impact/[policyId]');
      return Object.assign({}, e, { url: u.toString() });
    } catch (_) {
      return null;
    }
  }
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  window.si = window.si || function () { (window.siq = window.siq || []).push(arguments); };
  window.va('beforeSend', redact);
  window.si('beforeSend', redact);
})();`;

export const ANALYTICS_SCRIPT = '/_vercel/insights/script.js';
export const SPEED_INSIGHTS_SCRIPT = '/_vercel/speed-insights/script.js';

export default function Analytics() {
  if (!analyticsEnabled()) return null;
  return (
    <>
      <script id="vercel-analytics-queue" dangerouslySetInnerHTML={{ __html: ANALYTICS_BOOTSTRAP }} />
      <script defer src={ANALYTICS_SCRIPT} />
      <script defer src={SPEED_INSIGHTS_SCRIPT} />
    </>
  );
}
