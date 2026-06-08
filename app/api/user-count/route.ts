import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Use service role key so this works for unauthenticated visitors (bypasses RLS)
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { count, error } = await admin
      .from('user_profiles')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;
    return NextResponse.json({ count: count ?? 0 }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
