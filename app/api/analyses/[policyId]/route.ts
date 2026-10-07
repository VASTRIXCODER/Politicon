import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiError } from '@/lib/server/http';
import { isValidPolicyId } from '@/lib/server/policies';
import { rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/** Delete one of the signed-in user's saved analyses. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ policyId: string }> }) {
  const { policyId } = await params;
  if (!isValidPolicyId(policyId)) return apiError(404, 'not_found', 'Analysis not found.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError(401, 'unauthenticated', 'Please sign in to continue.');

  const limited = await rateLimit(req, 'analysisDelete', { userId: user.id });
  if (!limited.ok) return limited.response;

  const { data, error } = await createAdminClient()
    .from('analyzed_policies')
    .delete()
    .eq('user_id', user.id)
    .eq('policy_id', policyId)
    .select('id');
  if (error) {
    console.error('Analysis delete failed:', error);
    return apiError(500, 'delete_failed', 'Could not delete this analysis. Please try again.');
  }
  if (!data || data.length === 0) return apiError(404, 'not_found', 'Analysis not found.');
  return NextResponse.json({ ok: true });
}
