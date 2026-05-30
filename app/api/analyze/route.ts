import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzePolicy } from '@/lib/claude';
import { Policy, UserProfile } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const { policy } = await req.json() as { policy: Policy };

    if (!policy) {
      return NextResponse.json({ error: 'Policy data required' }, { status: 400 });
    }

    let profile: UserProfile = {
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
        if (profileData) {
          profile = { ...profile, ...profileData, id: user.id };
        }
      }
    } catch { /* use default profile */ }

    const analysis = await analyzePolicy(policy, profile);

    // Extract a rough dollar_impact from the analysis text
    // Look for patterns like +$X,XXX or -$X,XXX in the analysis
    let dollar_impact = 0;
    const dollarMatch = analysis.match(/net[\s\S]{0,30}[\+\-]?\$([\d,]+)/i)
      || analysis.match(/([\+\-])\$([\d,]+)(?:\/yr|\/year|\s+per year|\s+annually)/i);
    if (dollarMatch) {
      const sign = dollarMatch[0].includes('-') ? -1 : 1;
      const numStr = (dollarMatch[2] || dollarMatch[1]).replace(/,/g, '');
      dollar_impact = sign * parseInt(numStr, 10);
    }

    // Save to Supabase if user is authenticated
    if (userId) {
      try {
        const supabase = createClient();
        await supabase.from('policy_analyses').upsert({
          user_id: userId,
          policy_id: policy.id,
          policy_title: policy.title,
          analysis_text: analysis,
          dollar_impact,
          category: policy.category,
        }, { onConflict: 'user_id,policy_id' });
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({ analysis, dollar_impact });
  } catch (error) {
    console.error('Analyze error:', error);
    return NextResponse.json({ error: 'Analysis failed. Please try again.' }, { status: 500 });
  }
}
