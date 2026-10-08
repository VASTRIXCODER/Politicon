import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { analyzePolicyFull, ANALYSIS_PROMPT_VERSION, ANALYSIS_SCHEMA_VERSION } from '@/lib/claude';
import type { Policy, UserProfile } from '@/types';
import { getRequestContext } from '@/lib/server/requestContext';
import { readJson, apiError } from '@/lib/server/http';
import { rateLimit } from '@/lib/rateLimit';
import { checkAiBudget } from '@/lib/server/aiGuard';
import { describeAiError } from '@/lib/server/aiErrors';
import { resolvePolicy } from '@/lib/server/policies';
import { createAdminClient } from '@/lib/supabase/admin';
import { AI_MODEL } from '@/lib/server/aiConfig';

export const dynamic = 'force-dynamic';
// The generation runs after the response is sent (see after() below).
export const maxDuration = 300;

/** A pending job older than this is treated as failed (the worker died). */
const STALE_PENDING_MS = 6 * 60 * 1000;
/** The generation is abandoned shortly before the function's time limit. */
const GENERATION_TIMEOUT_MS = 270 * 1000;

const Body = z.object({
  policyId: z.string().min(1).max(80),
  force: z.boolean().optional(),
});

interface ExistingRow {
  analysis: Record<string, unknown> | null;
  net_annual_impact: number | null;
  net_monthly_impact: number | null;
  profile_snapshot: unknown;
  generation_status: 'pending' | 'ready' | 'failed';
  generation_started_at: string | null;
}

const hasResult = (row: ExistingRow | null) =>
  !!row?.analysis && Object.keys(row.analysis).length > 0 && !(row.analysis as { legacy?: boolean }).legacy;

/** The profile fields an analysis was based on, shown as "Based on your profile". */
function profileSnapshot(p: UserProfile) {
  return {
    state: p.state,
    incomeRange: p.incomeRange,
    filingStatus: p.filingStatus,
    housingSituation: p.housingSituation,
    employmentStatus: p.employmentStatus,
    dependentsCount: p.dependentsCount ?? null,
    debtTypes: p.debtTypes,
  };
}

/**
 * Generate (or regenerate) a full analysis. Returns 200 with a stored result,
 * or 202 when a generation is running in the background; the client then
 * follows the row's generation_status.
 */
export async function POST(req: NextRequest) {
  const auth = await getRequestContext();
  if (!auth.ok) return auth.response;
  const { supabase, user, profile, profileVersion } = auth.ctx;

  const body = await readJson(req, Body);
  if (!body.ok) return body.response;

  const policy = await resolvePolicy(supabase, user.id, body.data.policyId);
  if (!policy) return apiError(404, 'policy_not_found', 'That policy is not in your feed. Refresh your feed and try again.');

  const { data } = await supabase
    .from('analyzed_policies')
    .select('analysis, net_annual_impact, net_monthly_impact, profile_snapshot, generation_status, generation_started_at')
    .eq('user_id', user.id)
    .eq('policy_id', policy.id)
    .maybeSingle();
  const existing = data as ExistingRow | null;

  const running =
    existing?.generation_status === 'pending' &&
    !!existing.generation_started_at &&
    Date.now() - new Date(existing.generation_started_at).getTime() < STALE_PENDING_MS;
  if (running) return NextResponse.json({ status: 'pending' }, { status: 202 });

  // Re-use an existing analysis unless the caller explicitly asks to regenerate.
  if (!body.data.force && existing && hasResult(existing)) {
    return NextResponse.json({
      status: 'ready',
      analysis: existing.analysis,
      netAnnual: existing.net_annual_impact,
      netMonthly: existing.net_monthly_impact,
      profileSnapshot: existing.profile_snapshot,
      cached: true,
    });
  }

  const limited = await rateLimit(req, 'analyze', { userId: user.id });
  if (!limited.ok) return limited.response;

  // Claim the job atomically so two clicks can't start two generations.
  const admin = createAdminClient();
  const now = new Date().toISOString();
  let claimed = false;
  if (!existing) {
    const { error } = await admin.from('analyzed_policies').insert({
      user_id: user.id,
      policy_id: policy.id,
      policy_title: policy.title,
      category: policy.category,
      status: policy.status,
      analysis: {},
      generation_status: 'pending',
      generation_started_at: now,
    });
    claimed = !error;
  } else {
    const staleBefore = new Date(Date.now() - STALE_PENDING_MS).toISOString();
    const { data: rows } = await admin
      .from('analyzed_policies')
      .update({ generation_status: 'pending', generation_started_at: now, generation_error: null })
      .eq('user_id', user.id)
      .eq('policy_id', policy.id)
      .or(`generation_status.neq.pending,generation_started_at.lt.${staleBefore},generation_started_at.is.null`)
      .select('id');
    claimed = !!rows && rows.length > 0;
  }
  if (!claimed) return NextResponse.json({ status: 'pending' }, { status: 202 });

  const budget = await checkAiBudget('analyze', user.id);
  if (!budget.ok) {
    // Release the claim: drop a fresh placeholder, or put the old result back on display.
    if (!existing) {
      await admin.from('analyzed_policies').delete().eq('user_id', user.id).eq('policy_id', policy.id).eq('generation_status', 'pending');
    } else {
      await admin
        .from('analyzed_policies')
        .update({ generation_status: hasResult(existing) ? 'ready' : 'failed', generation_started_at: existing.generation_started_at })
        .eq('user_id', user.id)
        .eq('policy_id', policy.id);
    }
    return budget.response;
  }

  const meta = { feature: 'analyze' as const, userId: user.id, usageId: budget.usageId };
  after(() => runAnalysis(policy, profile, meta, profileVersion, now));

  return NextResponse.json({ status: 'pending' }, { status: 202 });
}

/** Background worker: generate, then write the result or the failure onto the row. */
async function runAnalysis(
  policy: Policy,
  profile: UserProfile,
  meta: { feature: 'analyze'; userId: string; usageId: number },
  profileVersion: string | null,
  startedAt: string,
) {
  const admin = createAdminClient();
  // Only write while this job still owns the row (a stale job can't overwrite a newer one).
  const match = (q: ReturnType<ReturnType<typeof admin.from>['update']>) =>
    q.eq('user_id', meta.userId).eq('policy_id', policy.id).eq('generation_started_at', startedAt);

  try {
    const analysis = await analyzePolicyFull(policy, profile, meta, AbortSignal.timeout(GENERATION_TIMEOUT_MS));
    // Only a validated analysis is ever written, so a failure never overwrites a good row.
    const { error } = await match(
      admin.from('analyzed_policies').update({
        policy_title: policy.title,
        bill_number: analysis.billNumber,
        status: analysis.status,
        category: analysis.category,
        direction: analysis.direction,
        confidence_score: analysis.confidenceScore,
        net_annual_impact: analysis.netAnnualImpact,
        net_monthly_impact: analysis.netMonthlyImpact,
        analysis,
        model: AI_MODEL,
        prompt_version: ANALYSIS_PROMPT_VERSION,
        schema_version: ANALYSIS_SCHEMA_VERSION,
        profile_snapshot: profileSnapshot(profile),
        profile_version: profileVersion,
        generation_status: 'ready',
        generation_error: null,
        updated_at: new Date().toISOString(),
      }),
    );
    if (error) throw error;
  } catch (e) {
    console.error('Background analysis failed:', e);
    const { message } = describeAiError(e);
    // Keeps any previous analysis in place; only the job status changes.
    await match(admin.from('analyzed_policies').update({ generation_status: 'failed', generation_error: message }));
  }
}
