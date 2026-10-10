import 'server-only';
import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';

/** How long the public figures are reused before they are recounted (seconds). */
export const PUBLIC_STATS_REVALIDATE = 900;

/**
 * Below these counts a figure is hidden: small numbers say little, and a
 * median over a handful of analyses could describe one person's results.
 * Analyses are counted per row, and one account can make many of them, so
 * the analysis count and the median also need MIN_CONTRIBUTORS distinct
 * members behind them (and the median gives each member one vote).
 */
export const MIN_MEMBERS = 100;
export const MIN_ANALYSES = 50;
export const MIN_CONTRIBUTORS = 25;

/** Measured figures for the public pages. null means "don't show it". */
export interface PublicStats {
  /** Accounts with a confirmed email address. */
  members: number | null;
  /** Personal analyses with a finished result. */
  analyses: number | null;
  /**
   * Typical size (gain or cost) of one analysis's estimated net annual impact,
   * in whole dollars: the median of each member's own median, so every member
   * counts once however many analyses they have.
   */
  medianAnnualImpact: number | null;
}

export const NO_PUBLIC_STATS: PublicStats = { members: null, analyses: null, medianAnnualImpact: null };

const count = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null;
};

const dollars = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

/**
 * Turns a public_stats() row into the figures that may be shown: anything
 * malformed, or counted over too few accounts, analyses or contributing
 * members, becomes null. A row from an older public_stats() without a
 * contributors column hides the analysis figures rather than guessing.
 */
export function publishableStats(row: unknown): PublicStats {
  if (!row || typeof row !== 'object') return NO_PUBLIC_STATS;
  const r = row as Record<string, unknown>;
  const members = count(r.members);
  const analyses = count(r.analyses);
  const contributors = count(r.contributors);
  const enoughAnalyses =
    analyses !== null && analyses >= MIN_ANALYSES && contributors !== null && contributors >= MIN_CONTRIBUTORS;
  return {
    members: members !== null && members >= MIN_MEMBERS ? members : null,
    analyses: enoughAnalyses ? analyses : null,
    medianAnnualImpact: enoughAnalyses ? dollars(r.median_abs_annual_impact) : null,
  };
}

// Throws on failure so an error is never cached; getPublicStats decides what to show.
const readStats = unstable_cache(
  async (): Promise<PublicStats> => {
    // Service role: the function is server-only and reads auth.users.
    const { data, error } = await createAdminClient().rpc('public_stats');
    if (error) throw error;
    return publishableStats(Array.isArray(data) ? data[0] : data);
  },
  ['public-stats-v2'],
  { revalidate: PUBLIC_STATS_REVALIDATE, tags: ['public-stats'] }
);

/**
 * After a failure, this server instance answers "nothing to show" without
 * querying for this long. unstable_cache doesn't keep failures, so without it
 * every render during an outage would query a database that is struggling.
 */
const FAILURE_BACKOFF_MS = 30_000;
let lastFailureAt = 0;

/**
 * Measured figures for the landing page, cached for 15 minutes across
 * requests. Never throws: a missing function (migration not applied yet), a
 * missing service key or an outage all give nulls, and the page hides those
 * figures instead of showing a misleading number.
 */
export async function getPublicStats(): Promise<PublicStats> {
  if (Date.now() - lastFailureAt < FAILURE_BACKOFF_MS) return NO_PUBLIC_STATS;
  try {
    return await readStats();
  } catch (error) {
    lastFailureAt = Date.now();
    // Supabase errors are plain objects with a message, not always Error instances.
    console.error('Public stats unavailable:', (error as { message?: unknown } | null)?.message ?? error);
    return NO_PUBLIC_STATS;
  }
}
