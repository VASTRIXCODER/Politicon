import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { chatWithAdvisor } from '@/lib/claude';
import { UserProfile } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

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
    } catch { /* use default profile */ }

    const response = await chatWithAdvisor(messages, profile);
    return NextResponse.json({ response });
  } catch (error) {
    console.error('Advisor error:', error);
    return NextResponse.json({ error: 'AI advisor unavailable. Please try again.' }, { status: 500 });
  }
}
