import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { discoverPolicies } from '@/lib/claude';
import { UserProfile } from '@/types';

export async function POST(req: NextRequest) {
  try {
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
      topFinancialConcerns: ['cost_of_living'],
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
        if (profileData) profile = { ...profile, ...profileData, id: user.id };
      }
    } catch { /* use default */ }

    const discovered = await discoverPolicies(profile);
    return NextResponse.json({ policies: discovered });
  } catch (error) {
    console.error('Discover error:', error);
    return NextResponse.json({ error: 'Discovery service unavailable.' }, { status: 500 });
  }
}
