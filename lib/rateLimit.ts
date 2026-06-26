import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

/**
 * Supabase-backed fixed-window rate limiting.
 *
 * Vercel runs each route on many short-lived serverless instances, so an
 * in-memory counter would only ever see a fraction of the traffic. Instead we
 * delegate the atomic increment-and-check to a Postgres function (see
 * supabase/migrations/20260626_rate_limits.sql) via the service-role client.
 */

export type RateLimitConfig = { limit: number; windowSeconds: number };

// Per-route limits. AI routes are expensive (Claude calls), so they're tighter.
export const RATE_LIMITS = {
  analyze:            { limit: 20,  windowSeconds: 3600 }, // full policy analysis
  advisor:            { limit: 40,  windowSeconds: 3600 }, // chat / policy reply
  discover:           { limit: 20,  windowSeconds: 3600 }, // personalized discovery
  feedRefresh:        { limit: 10,  windowSeconds: 3600 }, // manual feed refresh (AI)
  cumulativeSummary:  { limit: 40,  windowSeconds: 3600 },
  newsletter:         { limit: 5,   windowSeconds: 3600 }, // signup spam guard
  accountDelete:      { limit: 5,   windowSeconds: 3600 },
  userCount:          { limit: 120, windowSeconds: 60 },   // cheap, but cap scraping
} as const satisfies Record<string, RateLimitConfig>;

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** Derive a stable identifier: the authenticated user id, else the client IP. */
async function identify(req: NextRequest): Promise<string> {
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return `user:${user.id}`;
  } catch { /* fall through to IP */ }

  const fwd = req.headers.get('x-forwarded-for');
  const ip = fwd?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  return `ip:${ip}`;
}

export type RateLimitResult =
  | { ok: true; remaining: number; reset: number }
  | { ok: false; response: NextResponse };

/**
 * Check (and consume) one unit against the given route's limit.
 * Fails open: if the rate-limit store is unreachable, the request is allowed
 * so an outage never takes the whole app down.
 */
export async function rateLimit(
  req: NextRequest,
  route: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  try {
    const identifier = await identify(req);
    const { data, error } = await admin().rpc('check_rate_limit', {
      p_identifier: identifier,
      p_route: route,
      p_limit: config.limit,
      p_window_seconds: config.windowSeconds,
    });

    if (error || !data || !data[0]) {
      // Fail open on infra errors.
      return { ok: true, remaining: config.limit, reset: 0 };
    }

    const row = data[0] as { allowed: boolean; current_count: number; reset_at: string };
    const resetMs = new Date(row.reset_at).getTime();
    const remaining = Math.max(0, config.limit - row.current_count);

    if (!row.allowed) {
      const retryAfter = Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Rate limit exceeded. Please slow down and try again shortly.' },
          {
            status: 429,
            headers: {
              'Retry-After': String(retryAfter),
              'X-RateLimit-Limit': String(config.limit),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(Math.ceil(resetMs / 1000)),
            },
          },
        ),
      };
    }

    return { ok: true, remaining, reset: resetMs };
  } catch {
    return { ok: true, remaining: config.limit, reset: 0 };
  }
}
