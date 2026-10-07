import 'server-only';
import type { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { mapDbProfile, type ProfileRow } from '@/lib/profile';
import { apiError } from '@/lib/server/http';
import type { UserProfile } from '@/types';

export interface RequestContext {
  supabase: SupabaseClient;
  user: User;
  profile: UserProfile;
  simpleMode: boolean;
  /** When the financial profile last changed; analyses older than this are stale. */
  profileVersion: string | null;
}

// Columns the AI prompts actually use — nothing else is loaded or sent.
const PROFILE_COLUMNS =
  'id, has_completed_onboarding, country, state, city, age_range, education_stage, employment_status, ' +
  'occupation_category, income_range, filing_status, housing_situation, debt_types, has_dependents, ' +
  'top_financial_concerns, reading_mode, dependents_count, dependent_age_bands, investments, home_value_band, ' +
  'financial_updated_at';

const EMPTY_PROFILE: UserProfile = {
  id: '',
  hasCompletedOnboarding: false,
  country: 'United States',
  state: '',
  city: '',
  ageRange: '',
  educationStage: '',
  employmentStatus: '',
  occupationCategory: '',
  incomeRange: '',
  filingStatus: '',
  housingSituation: '',
  debtTypes: [],
  hasDependents: false,
  topFinancialConcerns: [],
};

/**
 * Authenticate the caller and load their financial profile in one place.
 * AI routes never fall back to a made-up default profile: anonymous callers
 * get 401 and users who haven't finished onboarding get 409.
 */
export async function getRequestContext(
  opts: { requireOnboarding?: boolean } = {},
): Promise<{ ok: true; ctx: RequestContext } | { ok: false; response: NextResponse }> {
  const requireOnboarding = opts.requireOnboarding ?? true;
  const supabase = await createClient();

  let user: User | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (e) {
    console.error('Auth lookup failed:', e);
    return { ok: false, response: apiError(503, 'auth_unavailable', 'Sign-in service is unavailable. Please try again shortly.') };
  }
  if (!user) {
    return { ok: false, response: apiError(401, 'unauthenticated', 'Please sign in to continue.') };
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', user.id)
    .maybeSingle();
  const row = data as ProfileRow | null;
  if (error) {
    console.error('Profile lookup failed:', error);
    return { ok: false, response: apiError(503, 'profile_unavailable', 'Could not load your profile. Please try again shortly.') };
  }

  const profile = mapDbProfile(row, { ...EMPTY_PROFILE, id: user.id });
  if (requireOnboarding && !profile.hasCompletedOnboarding) {
    return { ok: false, response: apiError(409, 'needs_onboarding', 'Finish setting up your profile first.') };
  }

  const simpleMode = row?.reading_mode === 'simple';
  const profileVersion = (row as { financial_updated_at?: string | null } | null)?.financial_updated_at ?? null;
  return { ok: true, ctx: { supabase, user, profile, simpleMode, profileVersion } };
}
