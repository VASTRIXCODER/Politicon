import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzePolicyFull } from '@/lib/claude';
import { Policy, UserProfile, FullAnalysis } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DEFAULT_PROFILE: UserProfile = {
  id: 'anonymous',
  hasCompletedOnboarding: false,
  country: 'United States',
  state: 'Unknown',
  city: '',
  ageRange: '31_45',
  educationStage: 'college_4yr',
  employmentStatus: 'employed_full',
  occupationCategory: 'business_finance',
  incomeRange: '75k_100k',
  filingStatus: 'single',
  housingSituation: 'rent',
  debtTypes: [],
  hasDependents: false,
  topFinancialConcerns: ['cost_of_living', 'retirement'],
};

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
  try {
    const { policy } = (await req.json()) as { policy: Policy };
    if (!policy) {
      return NextResponse.json({ error: 'Policy data required' }, { status: 400 });
    }

    let profile: UserProfile = { ...DEFAULT_PROFILE };
    let userId: string | null = null;

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        userId = user.id;
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        if (profileData) profile = { ...profile, ...profileData, id: user.id };
      }
    } catch { /* use default profile */ }

    const analysis = await analyzePolicyFull(policy, profile);

    if (userId) {
      try {
        const supabase = createClient();
        // Rich structured store (source of truth for the detail page)
        await supabase.from('analyzed_policies').upsert(
          {
            user_id: userId,
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
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,policy_id' }
        );
        // Lightweight mirror for existing list/summary views + realtime net impact
        await supabase.from('policy_analyses').upsert(
          {
            user_id: userId,
            policy_id: policy.id,
            policy_title: policy.title,
            analysis_text: renderAnalysisText(analysis),
            dollar_impact: analysis.netAnnualImpact,
            category: policy.category,
          },
          { onConflict: 'user_id,policy_id' }
        );
      } catch (e) {
        console.error('Analyze save error:', e);
      }
    }

    return NextResponse.json({
      analysis,
      dollar_impact: analysis.netAnnualImpact,
      netAnnual: analysis.netAnnualImpact,
      netMonthly: analysis.netMonthlyImpact,
    });
  } catch (error) {
    console.error('Analyze error:', error);
    return NextResponse.json({ error: 'Analysis failed. Please try again.' }, { status: 500 });
  }
}
