import 'server-only';
import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';

/** How long the public member count is reused before it is recounted (seconds). */
export const MEMBER_COUNT_REVALIDATE = 600;

// Throws on failure so an error is never cached; callers decide what to show.
const countMembers = unstable_cache(
  async (): Promise<number> => {
    // Service role so the public count works for signed-out visitors (bypasses RLS).
    const { count, error } = await createAdminClient()
      .from('user_profiles')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    return count ?? 0;
  },
  ['landing-member-count'],
  { revalidate: MEMBER_COUNT_REVALIDATE, tags: ['member-count'] }
);

/**
 * After a failed count, this server instance answers null without querying
 * for this long. Failures aren't cached by unstable_cache, so without it every
 * request during an outage (including cache-busting ones to /api/user-count)
 * would run a fresh COUNT against a database that is already struggling.
 */
const FAILURE_BACKOFF_MS = 30_000;
let lastFailureAt = 0;

/**
 * Number of member accounts, cached for ten minutes across requests.
 * Returns null when it can't be read, so the UI hides the figure rather
 * than showing a misleading 0.
 */
export async function getMemberCount(): Promise<number | null> {
  if (Date.now() - lastFailureAt < FAILURE_BACKOFF_MS) return null;
  try {
    return await countMembers();
  } catch (error) {
    lastFailureAt = Date.now();
    console.error('Member count unavailable:', error instanceof Error ? error.message : error);
    return null;
  }
}
