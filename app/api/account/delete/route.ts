import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest) {
  try {
    const rl = await rateLimit(req, 'accountDelete', RATE_LIMITS.accountDelete);
    if (!rl.ok) return rl.response;

    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Delete profile data first (cascade handles the rest via RLS)
    await adminClient.from('user_profiles').delete().eq('id', user.id);
    await adminClient.from('policy_analyses').delete().eq('user_id', user.id);
    await adminClient.from('analyzed_policies').delete().eq('user_id', user.id);
    await adminClient.from('chat_sessions').delete().eq('user_id', user.id);

    // Delete the auth user
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Account deletion error:', error);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
