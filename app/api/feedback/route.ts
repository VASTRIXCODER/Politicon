import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { readJson, apiError } from '@/lib/server/http';
import { rateLimit } from '@/lib/rateLimit';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const Body = z.object({
  targetType: z.enum(['analysis', 'feed_item', 'chat_reply', 'insight']),
  targetId: z.string().min(1).max(120),
  rating: z.enum(['up', 'down', 'not_relevant', 'report']),
  reason: z.string().trim().max(1000).optional(),
  // The start of the rated chat reply or insight, so reviewers can see what was rated.
  excerpt: z.string().max(1000).optional(),
});

// PostgREST / Postgres codes for a table or function that isn't there yet
// (the database hasn't had migration 20261008120000 applied).
const MISSING_TABLE = new Set(['PGRST205', '42P01']);
const MISSING_FUNCTION = new Set(['PGRST202', '42883']);

/** Record a user's feedback on an AI output (with the model/prompt that produced it, for review). */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError(401, 'unauthenticated', 'Please sign in to continue.');

  const limited = await rateLimit(req, 'feedback', { userId: user.id });
  if (!limited.ok) return limited.response;

  const body = await readJson(req, Body);
  if (!body.ok) return body.response;
  const { targetType, targetId, rating, reason, excerpt } = body.data;

  // Provenance for analyses: which model and prompt version produced it.
  let context: Record<string, unknown> = {};
  if (targetType === 'analysis') {
    const { data } = await supabase
      .from('analyzed_policies')
      .select('model, prompt_version, schema_version, updated_at')
      .eq('user_id', user.id)
      .eq('policy_id', targetId)
      .maybeSingle();
    if (data) context = data;
  } else if ((targetType === 'chat_reply' || targetType === 'insight') && excerpt) {
    context = { excerpt };
  }

  const { error } = await supabase.from('ai_feedback').insert({
    user_id: user.id,
    target_type: targetType,
    target_id: targetId,
    rating,
    reason: reason || null,
    context,
  });
  // Without the feedback table nothing can be recorded, but a dismissal can
  // still take the policy out of the feed.
  const recorded = !error;
  if (error && !MISSING_TABLE.has(error.code)) {
    console.error('Feedback insert failed:', error);
    return apiError(503, 'feedback_failed', 'Could not save your feedback. Please try again.');
  }

  // "Not relevant to me" also takes the policy out of the stored feed (the
  // feed generator skips it from now on).
  if (targetType === 'feed_item' && rating === 'not_relevant') {
    const removed = await removeFromFeed(user.id, targetId).catch((e) => {
      console.error('Feed dismissal failed:', e);
      return false;
    });
    // Recorded feedback keeps it out of the next feed; with neither, nothing happened.
    if (!removed && !recorded) {
      return apiError(503, 'feedback_failed', 'Could not hide this policy. Please try again.');
    }
  }
  return NextResponse.json(recorded ? { ok: true } : { ok: true, recorded: false });
}

/** Take one policy out of the user's stored feed. Returns false if that failed. */
async function removeFromFeed(userId: string, policyId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.rpc('remove_feed_item', { p_user: userId, p_policy_id: policyId });
  if (!error) return true;
  if (!MISSING_FUNCTION.has(error.code)) {
    console.error('Feed dismissal failed:', error);
    return false;
  }

  // Older database without remove_feed_item: read, filter and write back.
  const { data, error: readError } = await admin.from('user_policy_feed').select('policies').eq('user_id', userId).maybeSingle();
  if (readError) {
    console.error('Feed dismissal failed:', readError);
    return false;
  }
  const policies = Array.isArray(data?.policies) ? (data!.policies as { id?: unknown }[]) : null;
  if (!policies) return true;
  const kept = policies.filter((p) => p?.id !== policyId);
  if (kept.length === policies.length) return true;
  const { error: writeError } = await admin.from('user_policy_feed').update({ policies: kept }).eq('user_id', userId);
  if (writeError) {
    console.error('Feed dismissal failed:', writeError);
    return false;
  }
  return true;
}
