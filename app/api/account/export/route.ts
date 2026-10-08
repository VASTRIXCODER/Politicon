import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiError } from '@/lib/server/http';
import { rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/** Everything Politicon stores about the signed-in user, as a JSON download. */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError(401, 'unauthenticated', 'Please sign in to continue.');

  const limited = await rateLimit(req, 'accountExport', { userId: user.id });
  if (!limited.ok) return limited.response;

  const [profile, analyses, feed, chats, insight, usage] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('analyzed_policies').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
    supabase.from('user_policy_feed').select('policies, updated_at').eq('user_id', user.id).maybeSingle(),
    supabase.from('chat_sessions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('ai_insights').select('insight, created_at').eq('user_id', user.id).maybeSingle(),
    // The usage ledger is server-only; include the user's own rows without token internals.
    createAdminClient().from('ai_usage').select('feature, model, created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
  ]);
  const failed = [profile, analyses, feed, chats, insight, usage].find((r) => r.error);
  if (failed) {
    console.error('Export failed:', failed.error);
    return apiError(503, 'export_failed', 'Could not prepare your export. Please try again.');
  }

  const body = {
    exportedAt: new Date().toISOString(),
    account: { id: user.id, email: user.email, createdAt: user.created_at },
    profile: profile.data,
    analyses: analyses.data,
    policyFeed: feed.data,
    chats: chats.data,
    dashboardInsight: insight.data,
    aiRequests: usage.data,
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="politicon-export-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
