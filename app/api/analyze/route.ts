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

    // Try to get authenticated user profile
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

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
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
    return NextResponse.json({ analysis });
  } catch (error) {
    console.error('Analyze error:', error);
    return NextResponse.json({ error: 'Analysis failed. Please try again.' }, { status: 500 });
  }
}
