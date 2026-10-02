import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type Check = { ok: boolean; detail?: string };

/**
 * Deployment health check. Reports whether each dependency is configured and
 * reachable — never the secret values themselves.
 */
export async function GET() {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
  };

  const checks: Record<string, Check> = {};

  if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    try {
      const { error } = await admin
        .from('user_profiles')
        .select('*', { count: 'exact', head: true });
      checks.database = error ? { ok: false, detail: error.message || error.code } : { ok: true };
    } catch (e) {
      checks.database = { ok: false, detail: (e as Error).message };
    }

    try {
      const { error } = await admin.rpc('check_rate_limit', {
        p_identifier: 'health',
        p_route: 'health',
        p_limit: 1000000,
        p_window_seconds: 60,
      });
      checks.rateLimiter = error ? { ok: false, detail: error.message || error.code } : { ok: true };
    } catch (e) {
      checks.rateLimiter = { ok: false, detail: (e as Error).message };
    }
  }

  if (env.ANTHROPIC_API_KEY) {
    try {
      // Listing models validates the key without spending tokens.
      const res = await fetch('https://api.anthropic.com/v1/models?limit=1', {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        cache: 'no-store',
      });
      checks.anthropic = res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` };
    } catch (e) {
      checks.anthropic = { ok: false, detail: (e as Error).message };
    }
  }

  const ok = Object.values(env).every(Boolean) && Object.values(checks).every(c => c.ok);
  return NextResponse.json({ ok, env, checks }, { status: ok ? 200 : 503 });
}
