import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { chatWithAdvisor } from '@/lib/claude';
import { UserProfile } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const { messages, policyContext } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array required' }, { status: 400 });
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
        if (profileData) profile = { ...profile, ...profileData, id: user.id };
      }
    } catch { /* use default profile */ }

    const response = await chatWithAdvisor(messages, profile);

    // If a policy context was passed (policyId + policyTitle), save an analysis record
    // and signal the frontend to show the View Full Impact Analysis button
    let savedPolicyId: string | null = policyContext?.policyId || null;

    if (userId && policyContext?.policyId && policyContext?.policyTitle) {
      try {
        const supabase = createClient();
        // Extract dollar impact from the response
        let dollar_impact = 0;
        const dollarMatch = response.match(/([+\-])\$([\d,]+)(?:\/yr|\/year|\s+per year|\s+annually)/i)
          || response.match(/\$([\d,]+)(?:\/yr|\/year|\s+per year|\s+annually)/i);
        if (dollarMatch) {
          const sign = response.includes('-$') ? -1 : 1;
          const numStr = (dollarMatch[2] || dollarMatch[1]).replace(/,/g, '');
          dollar_impact = sign * parseInt(numStr, 10);
        }
        await supabase.from('policy_analyses').upsert({
          user_id: userId,
          policy_id: policyContext.policyId,
          policy_title: policyContext.policyTitle,
          analysis_text: response,
          dollar_impact,
          category: policyContext.category || 'General',
        }, { onConflict: 'user_id,policy_id' });
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({ response, policyId: savedPolicyId });
  } catch (error) {
    console.error('Advisor error:', error);
    return NextResponse.json({ error: 'AI advisor unavailable. Please try again.' }, { status: 500 });
  }
}
