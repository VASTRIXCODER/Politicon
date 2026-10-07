import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { portfolioInsight } from '@/lib/claude';
import { getRequestContext } from '@/lib/server/requestContext';
import { apiError } from '@/lib/server/http';
import { rateLimit } from '@/lib/rateLimit';
import { checkAiBudget } from '@/lib/server/aiGuard';
import { aiFailure } from '@/lib/server/aiErrors';
import { loadPolicyLines } from '@/lib/server/analyses';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Short AI read across the user's most recent saved analyses (dashboard card).
 * Cached per user and regenerated only when those analyses or the reading
 * mode change, so loading the dashboard doesn't spend tokens.
 */
export async function POST(req: NextRequest) {
  const auth = await getRequestContext();
  if (!auth.ok) return auth.response;
  const { supabase, user, profile, simpleMode } = auth.ctx;

  const loaded = await loadPolicyLines(supabase, user.id, { limit: 8 });
  if (!loaded.ok) return apiError(503, 'lookup_failed', 'Could not load your analyses. Please try again.');
  if (loaded.lines.length === 0) return NextResponse.json({ insight: '' });

  const cacheKey = createHash('sha256')
    .update(JSON.stringify({ lines: loaded.lines, simpleMode, profile: auth.ctx.profileVersion }))
    .digest('hex');
  const { data: cached } = await supabase.from('ai_insights').select('cache_key, insight').eq('user_id', user.id).maybeSingle();
  if (cached?.cache_key === cacheKey) return NextResponse.json({ insight: cached.insight, cached: true });

  const limited = await rateLimit(req, 'insight', { userId: user.id });
  if (!limited.ok) return limited.response;
  const budget = await checkAiBudget('insight', user.id);
  if (!budget.ok) return budget.response;

  try {
    const insight = await portfolioInsight(loaded.lines, profile, { feature: 'insight', userId: user.id, usageId: budget.usageId }, simpleMode);
    const { error } = await createAdminClient()
      .from('ai_insights')
      .upsert({ user_id: user.id, cache_key: cacheKey, insight, created_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) console.error('Insight cache write failed:', error);
    return NextResponse.json({ insight, cached: false });
  } catch (e) {
    return aiFailure(e, 'Portfolio insight');
  }
}
