import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { analyzePolicyFull } from '@/lib/claude';
import { FullAnalysis } from '@/types';
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

const money = (n: number) => `${n >= 0 ? '+' : '-'}$${Math.abs(Math.round(n)).toLocaleString()}`;

/** Render the structured analysis into the legacy section format consumed by the list views. */
function renderAnalysisText(a: FullAnalysis): string {
  const lines: string[] = [];
  lines.push(a.plainEnglishSummary, '');
  lines.push('IMMEDIATE EFFECTS');
  lines.push(`- Monthly budget impact: ${money(a.immediate.monthlyBudgetImpact)}/mo`);
  lines.push(`- Annual budget impact: ${money(a.immediate.annualBudgetImpact)}/yr`);
  lines.push(`- Take-home per paycheck: ${money(a.immediate.takeHomePerPaycheck)}`);
  lines.push(`- Effective tax rate change: ${a.immediate.effectiveTaxRateChange >= 0 ? '+' : ''}${a.immediate.effectiveTaxRateChange}%`);
  lines.push('');
  lines.push('RIPPLE EFFECTS');
  lines.push(`- Inflation impact: ${a.ripple.inflationImpactPct >= 0 ? '+' : ''}${a.ripple.inflationImpactPct}%`);
  lines.push(`- Cost of living: ${money(a.ripple.costOfLivingChange)}/yr`);
  lines.push(`- Purchasing power: ${money(a.ripple.purchasingPowerChange)}/yr`);
  if (a.ripple.interestRateEffect) lines.push(`- ${a.ripple.interestRateEffect}`);
  lines.push('');
  lines.push('DOLLAR BREAKDOWN');
  for (const [k, v] of Object.entries(a.categoryImpacts)) {
    if (v !== 0) lines.push(`- ${k.charAt(0).toUpperCase() + k.slice(1)}: ${money(v)}/yr`);
  }
  lines.push('');
  lines.push('TRADE-OFFS');
  for (const g of a.tradeoffs.gains) lines.push(`- Gain: ${g.label} (${money(g.value)})`);
  for (const l of a.tradeoffs.losses) lines.push(`- Loss: ${l.label} (${money(l.value)})`);
  if (a.tradeoffs.netAssessment) lines.push(a.tradeoffs.netAssessment);
  lines.push('');
  lines.push('PROJECTIONS');
  lines.push(`- 1 year: ${money(a.timeline.year1)}`);
  lines.push(`- 3 years: ${money(a.timeline.year3)}`);
  lines.push(`- 5 years: ${money(a.timeline.year5)}`);
  lines.push('');
  lines.push('RECOMMENDATIONS');
  for (const r of a.recommendations) lines.push(`- [${r.priority}] ${r.step}`);
  return lines.join('\n');
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
      .select('analysis, net_annual_impact, net_monthly_impact')
      .eq('user_id', user.id)
      .eq('policy_id', policy.id)
      .maybeSingle();
    if (existing?.analysis && Object.keys(existing.analysis).length > 0) {
      return NextResponse.json({
        analysis: existing.analysis,
        netAnnual: existing.net_annual_impact,
        netMonthly: existing.net_monthly_impact,
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
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error: apErr } = await admin.from('analyzed_policies').upsert(
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
      updated_at: now,
    },
    { onConflict: 'user_id,policy_id' }
  );
  if (apErr) console.error('analyzed_policies upsert error:', apErr);
  // Lightweight mirror for the dashboard list + realtime (consolidated in a later migration).
  const { error: paErr } = await admin.from('policy_analyses').upsert(
    {
      user_id: user.id,
      policy_id: policy.id,
      policy_title: policy.title,
      analysis_text: renderAnalysisText(analysis),
      dollar_impact: analysis.netAnnualImpact,
      category: policy.category,
      updated_at: now,
    },
    { onConflict: 'user_id,policy_id' }
  );
  if (paErr) console.error('policy_analyses upsert error:', paErr);

  return NextResponse.json({
    analysis,
    netAnnual: analysis.netAnnualImpact,
    netMonthly: analysis.netMonthlyImpact,
    cached: false,
  });
}
