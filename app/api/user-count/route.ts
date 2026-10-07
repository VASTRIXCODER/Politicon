import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, 'userCount');
  if (!limited.ok) return limited.response;

  try {
    // Service role so the public count works for signed-out visitors (bypasses RLS).
    const { count, error } = await createAdminClient()
      .from('user_profiles')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    return NextResponse.json({ count: count ?? 0 }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('User count error:', error);
    // null tells the UI to hide the figure rather than show a misleading 0.
    return NextResponse.json({ count: null }, { status: 503 });
  }
}
