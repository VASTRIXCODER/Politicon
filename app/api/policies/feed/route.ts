import { NextRequest, NextResponse, after } from 'next/server';
import { discoverPolicyFeed } from '@/lib/claude';
import { getRequestContext, type RequestContext } from '@/lib/server/requestContext';
import { apiError } from '@/lib/server/http';
import { rateLimit } from '@/lib/rateLimit';
import { checkAiBudget } from '@/lib/server/aiGuard';
import type { UserProfile } from '@/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { reconcilePolicyIds } from '@/lib/policyId';

export const dynamic = 'force-dynamic';
// Generation runs after the response is sent (see after() below).
export const maxDuration = 300;

const TTL_MS = 24 * 60 * 60 * 1000; // a cached feed is reused for 24h
const LOCK_MS = 5 * 60 * 1000; // one generation per user at a time
const GENERATION_TIMEOUT_MS = 270 * 1000;
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

/**
 * Claim the per-user generation lock. Returns the lock token (its expiry
 * timestamp), or null if another request holds it. The worker only writes
 * while it still holds this token, so a superseded job can't overwrite a newer one.
 */
async function claimLock(userId: string, hasRow: boolean): Promise<string | null> {
  const admin = createAdminClient();
  const until = new Date(Date.now() + LOCK_MS).toISOString();
  if (!hasRow) {
    const { error } = await admin.from('user_policy_feed').insert({ user_id: userId, policies: [], generating_until: until });
    return error ? null : until;
  }
  const nowIso = new Date().toISOString();
  const { data } = await admin
    .from('user_policy_feed')
    .update({ generating_until: until })
    .eq('user_id', userId)
    .or(`generating_until.is.null,generating_until.lt.${nowIso}`)
    .select('user_id');
  return data && data.length > 0 ? until : null;
}

/** 202 while a generation runs; includes the current (possibly expired) feed so the UI can keep showing it. */
function generatingResponse(row: FeedRow | null) {
  const policies = Array.isArray(row?.policies) ? row!.policies : [];
  return NextResponse.json({ generating: true, policies, updatedAt: row?.updated_at ?? null }, { status: 202 });
}

/** Start a background feed generation, or explain why it can't start. */
async function startGeneration(req: NextRequest, ctx: RequestContext, row: FeedRow | null, force: boolean) {
  const userId = ctx.user.id;

  if (row && isFuture(row.generating_until)) return generatingResponse(row);
  if (!force && row && isFuture(row.failed_until)) {
    const retryAfter = Math.ceil((new Date(row.failed_until!).getTime() - Date.now()) / 1000);
    return apiError(502, 'feed_failed', 'We could not build your feed just now. Please try again in a few minutes.', retryAfter);
  }

  const limited = await rateLimit(req, 'feed', { userId });
  if (!limited.ok) return limited.response;

  const lock = await claimLock(userId, !!row);
  if (!lock) return generatingResponse(row);

  const budget = await checkAiBudget('feed', userId);
  if (!budget.ok) {
    await createAdminClient().from('user_policy_feed').update({ generating_until: null }).eq('user_id', userId).eq('generating_until', lock);
    return budget.response;
  }

  after(() => runGeneration(ctx.profile, { feature: 'feed', userId, usageId: budget.usageId }, lock));
  return generatingResponse(row);
}

/** Background worker: build the feed and store it, or record the failure. */
async function runGeneration(profile: UserProfile, meta: { feature: 'feed'; userId: string; usageId: number }, lock: string) {
  const admin = createAdminClient();
  try {
    const generated = await discoverPolicyFeed(profile, meta, AbortSignal.timeout(GENERATION_TIMEOUT_MS));
    // Keep ids stable against analyses the user already has.
    const { data: analyzed } = await admin
      .from('analyzed_policies')
      .select('policy_id, policy_title, bill_number')
      .eq('user_id', meta.userId);
    const policies = reconcilePolicyIds(generated, analyzed || []);
    const { data: written, error } = await admin
      .from('user_policy_feed')
      .update({ policies, updated_at: new Date().toISOString(), generating_until: null, failed_until: null })
      .eq('user_id', meta.userId)
      .eq('generating_until', lock)
      .select('user_id');
    if (error) throw error;
    if (!written?.length) console.warn('Feed generation superseded by a newer job; result discarded.');
  } catch (e) {
    console.error('Background feed generation failed:', e);
    await admin
      .from('user_policy_feed')
      .update({ generating_until: null, failed_until: new Date(Date.now() + FAILURE_BACKOFF_MS).toISOString() })
      .eq('user_id', meta.userId)
      .eq('generating_until', lock);
  }
}

/** Returns the cached feed, generating one only when there is none or it has expired. */
export async function GET(req: NextRequest) {
  const auth = await getRequestContext();
  if (!auth.ok) return auth.response;
  const row = await readFeed(auth.ctx);

  const policies = Array.isArray(row?.policies) ? row!.policies : [];
  if (row && isFuture(row.generating_until)) return generatingResponse(row);

  const fresh = row?.updated_at && Date.now() - new Date(row.updated_at).getTime() < TTL_MS;
  if (policies.length > 0 && fresh) {
    // failed: the most recent refresh attempt didn't succeed (this is the older feed).
    return NextResponse.json({ policies, updatedAt: row!.updated_at, cached: true, failed: isFuture(row!.failed_until) });
  }

  const result = await startGeneration(req, auth.ctx, row, false);
  // If a new feed can't be started right now (limited, failed recently),
  // keep showing the expired one rather than an error.
  if (result.status >= 400 && policies.length > 0) {
    return NextResponse.json({
      policies, updatedAt: row!.updated_at, cached: true, stale: true, failed: isFuture(row!.failed_until),
    });
  }
  return result;
}

/** Explicit refresh: always regenerates in the background (still rate-limited and budgeted). */
export async function POST(req: NextRequest) {
  const auth = await getRequestContext();
  if (!auth.ok) return auth.response;
  const row = await readFeed(auth.ctx);
  return startGeneration(req, auth.ctx, row, true);
}
