import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rateLimit';
import { AI_MODEL, modelPrice } from '@/lib/server/aiConfig';

export const dynamic = 'force-dynamic';

type Check = { ok: boolean; detail?: string };

const TIMEOUT_MS = 3000;
// Latest migration the code depends on (see supabase/migrations).
const EXPECTED_SCHEMA_VERSION = '20261008090000';

async function probe(fn: (_signal: AbortSignal) => PromiseLike<{ error: { message?: string; code?: string } | null }>): Promise<Check> {
  try {
    const { error } = await fn(AbortSignal.timeout(TIMEOUT_MS));
    return error ? { ok: false, detail: error.message || error.code } : { ok: true };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

/**
 * Deployment health check. Public callers get only { ok }; send the
 * x-health-token header (HEALTHCHECK_TOKEN) for per-dependency details.
 * Probes are read-only apart from one rate-limit counter in its own bucket.
 */
export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, 'health');
  if (!limited.ok) return limited.response;

  const env = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    RATE_LIMIT_SALT: !!process.env.RATE_LIMIT_SALT,
  };

  const checks: Record<string, Check> = {};
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createAdminClient();
    [checks.database, checks.rateLimiter, checks.migrations] = await Promise.all([
      probe((s) => admin.from('user_profiles').select('id', { head: true, count: 'exact' }).limit(1).abortSignal(s)),
      // Exercises the real limiter function (a dedicated, generous bucket).
      probe((s) =>
        admin
          .rpc('check_rate_limit', { p_identifier: 'health', p_route: 'health', p_limit: 1000000, p_window_seconds: 60 })
          .abortSignal(s)
      ),
      // Confirms every migration this code depends on has been applied.
      (async (): Promise<Check> => {
        try {
          const { data, error } = await admin.rpc('schema_version').abortSignal(AbortSignal.timeout(TIMEOUT_MS));
          if (error) return { ok: false, detail: error.message || error.code };
          return String(data) >= EXPECTED_SCHEMA_VERSION
            ? { ok: true }
            : { ok: false, detail: `schema ${data}, expected ${EXPECTED_SCHEMA_VERSION}` };
        } catch (e) {
          return { ok: false, detail: (e as Error).message };
        }
      })(),
    ]);
  }
  if (env.ANTHROPIC_API_KEY) {
    try {
      // Looking up the configured model validates the key and the model id without spending tokens.
      const res = await fetch(`https://api.anthropic.com/v1/models/${encodeURIComponent(AI_MODEL)}`, {
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      checks.anthropic = res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status} for model ${AI_MODEL}` };
    } catch (e) {
      checks.anthropic = { ok: false, detail: (e as Error).message };
    }
  }

  // AI calls are refused when the model's price is unknown (spend can't be tracked).
  checks.aiPricing = modelPrice(AI_MODEL)
    ? { ok: true }
    : { ok: false, detail: `No price for ${AI_MODEL}; set AI_PRICE_INPUT_PER_MTOK and AI_PRICE_OUTPUT_PER_MTOK` };

  const required = [env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, env.SUPABASE_SERVICE_ROLE_KEY, env.ANTHROPIC_API_KEY];
  const ok = required.every(Boolean) && Object.values(checks).every((c) => c.ok);

  const token = process.env.HEALTHCHECK_TOKEN;
  const authorized = !!token && req.headers.get('x-health-token') === token;
  return NextResponse.json(authorized ? { ok, env, checks } : { ok }, {
    status: ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
