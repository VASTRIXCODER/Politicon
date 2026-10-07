import { NextRequest, NextResponse } from 'next/server';
import { discoverPolicyFeed } from '@/lib/claude';
import { getRequestContext, type RequestContext } from '@/lib/server/requestContext';
import { apiError } from '@/lib/server/http';
import { rateLimit } from '@/lib/rateLimit';
import { checkAiBudget } from '@/lib/server/aiGuard';
import { aiFailure } from '@/lib/server/aiErrors';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL_MS = 24 * 60 * 60 * 1000; // a cached feed is reused for 24h
const LOCK_MS = 2 * 60 * 1000; // one generation per user at a time
const FAILURE_BACKOFF_MS = 10 * 60 * 1000; // don't retry a failed generation immediately

interface FeedRow {
  policies: unknown;
  updated_at: string | null;
  generating_until: string | null;
  failed_until: string | null;
}

async function readFeed(ctx: RequestContext): Promise<FeedRow | null> {
  const { data } = await ctx.supabase
    .from('user_policy_feed')
    .select('policies, updated_at, generating_until, failed_until')
    .eq('user_id', ctx.user.id)
    .maybeSingle();
  return (data as FeedRow | null) ?? null;
}

const isFuture = (iso: string | null) => !!iso && new Date(iso).getTime() > Date.now();

/** Claim the per-user generation lock. Returns false if another request holds it. */
async function claimLock(userId: string, hasRow: boolean): Promise<boolean> {
  const admin = createAdminClient();
  const until = new Date(Date.now() + LOCK_MS).toISOString();
  if (!hasRow) {
    const { error } = await admin.from('user_policy_feed').insert({ user_id: userId, policies: [], generating_until: until });
    return !error;
  }
  const nowIso = new Date().toISOString();
  const { data } = await admin
    .from('user_policy_feed')
    .update({ generating_until: until })
    .eq('user_id', userId)
    .or(`generating_until.is.null,generating_until.lt.${nowIso}`)
    .select('user_id');
  return !!data && data.length > 0;
}

async function generate(req: NextRequest, ctx: RequestContext, row: FeedRow | null, force: boolean) {
  const userId = ctx.user.id;

  if (row && isFuture(row.generating_until)) {
    return NextResponse.json({ generating: true }, { status: 202 });
  }
  if (!force && row && isFuture(row.failed_until)) {
    const retryAfter = Math.ceil((new Date(row.failed_until!).getTime() - Date.now()) / 1000);
    return apiError(502, 'feed_failed', 'We could not build your feed just now. Please try again in a few minutes.', retryAfter);
  }

  const limited = await rateLimit(req, 'feed', { userId });
  if (!limited.ok) return limited.response;

  if (!(await claimLock(userId, !!row))) {
    return NextResponse.json({ generating: true }, { status: 202 });
  }

  const admin = createAdminClient();
  const budget = await checkAiBudget('feed', userId);
  if (!budget.ok) {
    await admin.from('user_policy_feed').update({ generating_until: null }).eq('user_id', userId);
    return budget.response;
  }

  try {
    const policies = await discoverPolicyFeed(ctx.profile, { feature: 'feed', userId, usageId: budget.usageId });
    const updatedAt = new Date().toISOString();
    await admin
      .from('user_policy_feed')
      .update({ policies, updated_at: updatedAt, generating_until: null, failed_until: null })
      .eq('user_id', userId);
    return NextResponse.json({ policies, updatedAt, cached: false });
  } catch (e) {
    await admin
      .from('user_policy_feed')
      .update({ generating_until: null, failed_until: new Date(Date.now() + FAILURE_BACKOFF_MS).toISOString() })
      .eq('user_id', userId);
    return aiFailure(e, 'Policy feed generation');
  }
}

/** Returns the cached feed, generating one only when there is none or it has expired. */
export async function GET(req: NextRequest) {
  const auth = await getRequestContext();
  if (!auth.ok) return auth.response;
  const row = await readFeed(auth.ctx);

  const policies = Array.isArray(row?.policies) ? row!.policies : [];
  const fresh = row?.updated_at && Date.now() - new Date(row.updated_at).getTime() < TTL_MS;
  if (policies.length > 0 && fresh) {
    return NextResponse.json({ policies, updatedAt: row!.updated_at, cached: true });
  }

  const result = await generate(req, auth.ctx, row, false);
  // If a fresh feed couldn't be produced right now (busy, limited, failed),
  // keep showing the expired one rather than an error.
  if (result.status !== 200 && policies.length > 0) {
    return NextResponse.json({ policies, updatedAt: row!.updated_at, cached: true, stale: true });
  }
  return result;
}

/** Explicit refresh: always regenerates (still rate-limited and budgeted). */
export async function POST(req: NextRequest) {
  const auth = await getRequestContext();
  if (!auth.ok) return auth.response;
  const row = await readFeed(auth.ctx);
  return generate(req, auth.ctx, row, true);
}
