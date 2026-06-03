import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { discoverPolicyFeed } from '@/lib/claude';
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

const TTL_MS = 24 * 60 * 60 * 1000; // 24h

export async function GET(req: NextRequest) {
  const refresh = req.nextUrl.searchParams.get('refresh') === '1';
  let profile = { ...DEFAULT_PROFILE };
  let userId: string | null = null;

  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      try {
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        if (profileData) profile = mapDbProfile(profileData, profile);
      } catch { /* use default */ }
    }
  } catch { /* use default */ }

  // Try cache for authenticated users
  if (userId && !refresh) {
    try {
      const supabase = createClient();
      const { data: cached } = await supabase
        .from('user_policy_feed')
        .select('policies, updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (cached && cached.policies && Array.isArray(cached.policies) && cached.policies.length > 0) {
        const age = Date.now() - new Date(cached.updated_at).getTime();
        if (age < TTL_MS) {
          return NextResponse.json({ policies: cached.policies, updatedAt: cached.updated_at, cached: true });
        }
      }
    } catch { /* fall through to regenerate */ }
  }

  // Generate fresh feed
  const policies = await discoverPolicyFeed(profile);
  const updatedAt = new Date().toISOString();

  if (userId && policies.length > 0) {
    try {
      const supabase = createClient();
      await supabase
        .from('user_policy_feed')
        .upsert({ user_id: userId, policies, updated_at: updatedAt }, { onConflict: 'user_id' });
    } catch { /* non-fatal: still return the freshly generated feed */ }
  }

  return NextResponse.json({ policies, updatedAt, cached: false });
}
