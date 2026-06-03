import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { chatWithAdvisor, advisorPolicyReply } from '@/lib/claude';
import { UserProfile } from '@/types';
import { mapDbProfile } from '@/lib/profile';

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

export async function POST(req: NextRequest) {
  try {
    const { messages, policyContext, simpleMode } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array required' }, { status: 400 });
    }
    const simple = !!simpleMode;

    let profile: UserProfile = { ...DEFAULT_PROFILE };

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        if (profileData) profile = mapDbProfile(profileData, profile);
      }
    } catch { /* use default profile */ }

    // Policy-focused message → structured 3-part reply with a View Full Impact CTA.
    if (policyContext?.policyTitle) {
      const reply = await advisorPolicyReply(
        policyContext.policyTitle,
        policyContext.context || '',
        profile,
        simple
      );
      return NextResponse.json({
        response: reply.fullResponse,
        summary: reply.summary,
        dollarLine: reply.dollarLine,
        policyId: policyContext.policyId || null,
        policyTitle: policyContext.policyTitle,
        category: policyContext.category || 'General',
        hasFullAnalysis: true,
      });
    }

    // Free-form conversation
    const response = await chatWithAdvisor(messages, profile, simple);
    return NextResponse.json({ response, hasFullAnalysis: false });
  } catch (error) {
    console.error('Advisor error:', error);
    return NextResponse.json({ error: 'AI advisor unavailable. Please try again.' }, { status: 500 });
  }
}
