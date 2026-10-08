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
});

/** Record a user's feedback on an AI output (with the model/prompt that produced it, for review). */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError(401, 'unauthenticated', 'Please sign in to continue.');

  const limited = await rateLimit(req, 'feedback', { userId: user.id });
  if (!limited.ok) return limited.response;

  const body = await readJson(req, Body);
  if (!body.ok) return body.response;
  const { targetType, targetId, rating, reason } = body.data;

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
  }

  const { error } = await supabase.from('ai_feedback').insert({
    user_id: user.id,
    target_type: targetType,
    target_id: targetId,
    rating,
    reason: reason || null,
    context,
  });
  if (error) {
    console.error('Feedback insert failed:', error);
    return apiError(503, 'feedback_failed', 'Could not save your feedback. Please try again.');
  }

  // "Not relevant to me" also takes the policy out of the stored feed (the
  // feed generator skips it from now on).
  if (targetType === 'feed_item' && rating === 'not_relevant') {
    await removeFromFeed(user.id, targetId).catch((e) => console.error('Feed dismissal failed:', e));
  }
  return NextResponse.json({ ok: true });
}

async function removeFromFeed(userId: string, policyId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from('user_policy_feed').select('policies').eq('user_id', userId).maybeSingle();
  const policies = Array.isArray(data?.policies) ? (data!.policies as { id?: unknown }[]) : null;
  if (!policies) return;
  const kept = policies.filter((p) => p?.id !== policyId);
  if (kept.length === policies.length) return;
  await admin.from('user_policy_feed').update({ policies: kept }).eq('user_id', userId);
}
