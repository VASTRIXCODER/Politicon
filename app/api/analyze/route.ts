import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { analyzePolicyFull } from '@/lib/claude';
import { FullAnalysis, UserProfile } from '@/types';
import { AI_MODEL } from '@/lib/server/aiConfig';
import { ANALYSIS_PROMPT_VERSION, ANALYSIS_SCHEMA_VERSION } from '@/lib/claude';
import { getRequestContext } from '@/lib/server/requestContext';
import { readJson, apiError } from '@/lib/server/http';
import { rateLimit } from '@/lib/rateLimit';
import { checkAiBudget } from '@/lib/server/aiGuard';
import { aiFailure } from '@/lib/server/aiErrors';
import { resolvePolicy } from '@/lib/server/policies';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({
  policyId: z.string().min(1).max(80),
  force: z.boolean().optional(),
});

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

export async function POST(req: NextRequest) {
  const auth = await getRequestContext();
  if (!auth.ok) return auth.response;
  const { supabase, user, profile } = auth.ctx;

  const body = await readJson(req, Body);
  if (!body.ok) return body.response;

  const policy = await resolvePolicy(supabase, user.id, body.data.policyId);
  if (!policy) return apiError(404, 'policy_not_found', 'That policy is not in your feed. Refresh your feed and try again.');

  // Re-use an existing analysis unless the caller explicitly asks to regenerate.
  if (!body.data.force) {
    const { data: existing } = await supabase
      .from('analyzed_policies')
      .select('analysis, net_annual_impact, net_monthly_impact, profile_snapshot')
      .eq('user_id', user.id)
      .eq('policy_id', policy.id)
      .maybeSingle();
    // Legacy rows (summary text only, from before the structured analysis) are regenerated.
    const stored = existing?.analysis as { legacy?: boolean } | null | undefined;
    if (existing && stored && Object.keys(stored).length > 0 && !stored.legacy) {
      return NextResponse.json({
        analysis: existing.analysis,
        netAnnual: existing.net_annual_impact,
        netMonthly: existing.net_monthly_impact,
        profileSnapshot: existing.profile_snapshot,
        cached: true,
      });
    }
  }

  const limited = await rateLimit(req, 'analyze', { userId: user.id });
  if (!limited.ok) return limited.response;
  const budget = await checkAiBudget('analyze', user.id);
  if (!budget.ok) return budget.response;

  let analysis: FullAnalysis;
  try {
    analysis = await analyzePolicyFull(policy, profile, { feature: 'analyze', userId: user.id, usageId: budget.usageId });
  } catch (e) {
    return aiFailure(e, 'Policy analysis');
  }

  // Only a validated analysis is ever written, so a failure never overwrites a good row.
  const now = new Date().toISOString();
  const snapshot = profileSnapshot(profile);
  const { error: saveError } = await createAdminClient().from('analyzed_policies').upsert(
    {
      user_id: user.id,
      policy_id: policy.id,
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
      profile_snapshot: snapshot,
      profile_version: auth.ctx.profileVersion,
      updated_at: now,
    },
    { onConflict: 'user_id,policy_id' }
  );
  if (saveError) {
    console.error('analyzed_policies upsert error:', saveError);
    return apiError(500, 'save_failed', 'The analysis was generated but could not be saved. Please try again.');
  }

  return NextResponse.json({
    analysis,
    netAnnual: analysis.netAnnualImpact,
    netMonthly: analysis.netMonthlyImpact,
    profileSnapshot: snapshot,
    cached: false,
  });
}
