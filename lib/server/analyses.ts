import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PolicyLine } from '@/lib/claude';

/**
 * Load a user's saved analyses as prompt-ready lines. Titles and amounts
 * always come from the database, never from the request.
 */
export async function loadPolicyLines(
  supabase: SupabaseClient,
  userId: string,
  opts: { policyIds?: string[]; limit?: number } = {},
): Promise<{ ok: true; lines: PolicyLine[] } | { ok: false }> {
  let query = supabase
    .from('policy_analyses')
    .select('policy_title, category, dollar_impact')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (opts.policyIds) query = query.in('policy_id', opts.policyIds);
  if (opts.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error) {
    console.error('Analysis lookup failed:', error);
    return { ok: false };
  }
  return {
    ok: true,
    lines: (data || []).map((r) => ({
      title: r.policy_title || 'Untitled policy',
      category: r.category || 'general',
      annual: Number(r.dollar_impact) || 0,
    })),
  };
}
