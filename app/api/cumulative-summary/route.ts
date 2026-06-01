import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cumulativeSummary } from '@/lib/claude';
import { UserProfile } from '@/types';

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
    const { items } = (await req.json()) as {
      items: { title: string; category: string; annual: number }[];
    };
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ summary: '' });
    }

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
        if (profileData) profile = { ...profile, ...profileData, id: user.id };
      }
    } catch { /* use default profile */ }

    const summary = await cumulativeSummary(items.slice(0, 12), profile);
    return NextResponse.json({ summary });
  } catch (error) {
    console.error('Cumulative summary error:', error);
    return NextResponse.json({ summary: '' });
  }
}
