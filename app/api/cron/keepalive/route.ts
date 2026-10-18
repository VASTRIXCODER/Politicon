import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/**
 * Daily database touch, run by Vercel Cron (vercel.json). Supabase pauses a
 * free-tier project after about a week without database activity, and a
 * paused project's hostname stops resolving, which takes down sign-in, the
 * feed and the landing page figures. One cheap read a day prevents that.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set;
 * any other caller is then refused.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return apiError(401, 'unauthorized', 'Not allowed.');
  }
  try {
    const { error } = await createAdminClient()
      .from('user_profiles')
      .select('id', { head: true, count: 'exact' })
      .limit(1)
      .abortSignal(AbortSignal.timeout(5000));
    if (error) throw error;
  } catch (e) {
    console.error('Keepalive failed:', (e as { message?: unknown } | null)?.message ?? e);
    return apiError(503, 'database_unavailable', 'Database unavailable.');
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
