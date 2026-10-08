import 'server-only';
import { createHmac } from 'node:crypto';
import type { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiError } from '@/lib/server/http';

/**
 * Fixed-window rate limiting backed by Postgres (see the check_rate_limit RPC),
 * so limits hold across Vercel's many serverless instances. A small in-memory
 * counter per instance is a second layer that still works if the database
 * can't be reached.
 */

export type RateLimitConfig = {
  limit: number;
  windowSeconds: number;
  /** Claude-backed routes refuse requests when the limiter itself is down. */
  failClosed: boolean;
};

export const RATE_LIMITS = {
  analyze:           { limit: 20,  windowSeconds: 3600, failClosed: true },
  advisor:           { limit: 40,  windowSeconds: 3600, failClosed: true },
  feed:              { limit: 10,  windowSeconds: 3600, failClosed: true },
  insight:           { limit: 20,  windowSeconds: 3600, failClosed: true },
  cumulativeSummary: { limit: 40,  windowSeconds: 3600, failClosed: true },
  newsletter:        { limit: 5,   windowSeconds: 3600, failClosed: false },
  accountDelete:     { limit: 5,   windowSeconds: 3600, failClosed: false },
  profile:           { limit: 30,  windowSeconds: 3600, failClosed: false },
  accountExport:     { limit: 5,   windowSeconds: 3600, failClosed: false },
  analysisDelete:    { limit: 60,  windowSeconds: 3600, failClosed: false },
  analysisStatus:    { limit: 600, windowSeconds: 3600, failClosed: false },
  userCount:         { limit: 120, windowSeconds: 60,   failClosed: false },
  health:            { limit: 60,  windowSeconds: 60,   failClosed: false },
} as const satisfies Record<string, RateLimitConfig>;

export type RateLimitRoute = keyof typeof RATE_LIMITS;

/** Client IP as reported by Vercel's edge (x-real-ip can't be set by the client). */
export function clientIp(req: Request): string {
  return (
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'unknown'
  );
}

/** IPs are stored only as a keyed hash, never raw. */
function hashIp(ip: string): string {
  const secret = process.env.RATE_LIMIT_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'politicon-rate-limit';
  return createHmac('sha256', secret).update(ip).digest('hex').slice(0, 32);
}

// ---------------------------------------------------------------------------
// Per-instance fallback layer
// ---------------------------------------------------------------------------
const memory = new Map<string, { count: number; resetAt: number }>();

function memoryHit(key: string, config: RateLimitConfig): { allowed: boolean; resetAt: number } {
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    const resetAt = now + config.windowSeconds * 1000;
    memory.set(key, { count: 1, resetAt });
    if (memory.size > 5000) {
      memory.forEach((v, k) => { if (v.resetAt <= now) memory.delete(k); });
    }
    return { allowed: true, resetAt };
  }
  entry.count += 1;
  return { allowed: entry.count <= config.limit, resetAt: entry.resetAt };
}

function tooMany(config: RateLimitConfig, resetAtMs: number): NextResponse {
  const retryAfter = Math.max(1, Math.ceil((resetAtMs - Date.now()) / 1000));
  const res = apiError(429, 'rate_limited', 'Too many requests. Please slow down and try again shortly.', retryAfter);
  res.headers.set('X-RateLimit-Limit', String(config.limit));
  res.headers.set('X-RateLimit-Remaining', '0');
  res.headers.set('X-RateLimit-Reset', String(Math.ceil(resetAtMs / 1000)));
  return res;
}

/**
 * Consume one unit of the route's limit. Pass the authenticated user's id when
 * there is one; otherwise the caller is identified by a hash of their IP.
 */
export async function rateLimit(
  req: Request,
  route: RateLimitRoute,
  opts: { userId?: string } = {},
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const config: RateLimitConfig = RATE_LIMITS[route];
  const identifier = opts.userId ? `user:${opts.userId}` : `iph:${hashIp(clientIp(req))}`;

  const local = memoryHit(`${identifier}:${route}`, config);
  if (!local.allowed) return { ok: false, response: tooMany(config, local.resetAt) };

  try {
    const { data, error } = await createAdminClient().rpc('check_rate_limit', {
      p_identifier: identifier,
      p_route: route,
      p_limit: config.limit,
      p_window_seconds: config.windowSeconds,
    });
    const row = Array.isArray(data) ? (data[0] as { allowed: boolean; reset_at: string } | undefined) : undefined;
    if (error || !row) throw error || new Error('check_rate_limit returned no row');

    if (!row.allowed) return { ok: false, response: tooMany(config, new Date(row.reset_at).getTime()) };
    return { ok: true };
  } catch (e) {
    console.error(`Rate limiter unavailable (${route}):`, e);
    if (config.failClosed) {
      return { ok: false, response: apiError(503, 'limiter_unavailable', 'This feature is temporarily unavailable. Please try again shortly.', 30) };
    }
    return { ok: true };
  }
}
