import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { readJson, apiError } from '@/lib/server/http';
import { rateLimit } from '@/lib/rateLimit';
import { FinancialProfileSchema } from '@/lib/profileSchema';
import { isHomeowner } from '@/lib/profileOptions';

export const dynamic = 'force-dynamic';

const FINANCIAL_COLUMNS = [
  'state', 'city', 'age_range', 'education_stage', 'employment_status', 'occupation_category',
  'income_range', 'filing_status', 'housing_situation', 'debt_types', 'has_dependents',
  'dependents_count', 'dependent_age_bands', 'top_financial_concerns', 'investments', 'home_value_band',
] as const;
type FinancialColumn = (typeof FINANCIAL_COLUMNS)[number];

/** Compare stored and submitted values; arrays are compared as sets. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const x = Array.isArray(a) ? [...a].sort() : [];
    const y = Array.isArray(b) ? [...b].sort() : [];
    return x.length === y.length && x.every((v, i) => v === y[i]);
  }
  return (a ?? null) === (b ?? null);
}

const Body = z.object({
  profile: FinancialProfileSchema,
});

/**
 * Save the user's financial profile. This is the only way the financial
 * fields are written: values are validated against the shared vocabulary,
 * and the cached feed is cleared so it is rebuilt from the new profile.
 */
export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError(401, 'unauthenticated', 'Please sign in to continue.');

  const limited = await rateLimit(req, 'profile', { userId: user.id });
  if (!limited.ok) return limited.response;

  const body = await readJson(req, Body);
  if (!body.ok) return body.response;
  const p = body.data.profile;

  const admin = createAdminClient();
  const { data, error: readError } = await admin
    .from('user_profiles')
    .select(['onboarding_completed_at', 'financial_updated_at', ...FINANCIAL_COLUMNS].join(', '))
    .eq('id', user.id)
    .maybeSingle();
  const existing = data as unknown as
    | (Record<FinancialColumn, unknown> & { onboarding_completed_at: string | null; financial_updated_at: string | null })
    | null;
  if (readError) {
    console.error('Profile read failed:', readError);
    return apiError(503, 'profile_unavailable', 'Could not save your profile. Please try again.');
  }

  const now = new Date().toISOString();
  const financial: Record<FinancialColumn, unknown> = {
      state: p.state,
      city: p.city || null,
      age_range: p.ageRange,
      education_stage: p.educationStage,
      employment_status: p.employmentStatus,
      occupation_category: p.occupationCategory,
      income_range: p.incomeRange,
      filing_status: p.filingStatus,
      housing_situation: p.housingSituation,
      debt_types: p.debtTypes,
      has_dependents: p.hasDependents,
      dependents_count: p.dependentsCount,
      dependent_age_bands: p.dependentAgeBands,
      top_financial_concerns: p.topFinancialConcerns,
      investments: p.investments,
      home_value_band: isHomeowner(p.housingSituation) ? p.homeValueBand : null,
  };

  // Only a real change makes existing analyses stale and the feed rebuild.
  const changed = !existing || FINANCIAL_COLUMNS.some((c) => !sameValue(existing[c], financial[c]));
  const financialUpdatedAt = changed || !existing?.financial_updated_at ? now : existing.financial_updated_at;

  const { error } = await admin.from('user_profiles').upsert(
    {
      id: user.id,
      email: user.email,
      ...financial,
      financial_updated_at: financialUpdatedAt,
      has_completed_onboarding: true,
      onboarding_completed_at: existing?.onboarding_completed_at || now,
    },
    { onConflict: 'id' },
  );
  if (error) {
    console.error('Profile save failed:', error);
    return apiError(500, 'profile_save_failed', 'Could not save your profile. Please try again.');
  }

  if (changed) {
    // The feed was built for the old profile; the next visit rebuilds it.
    const { error: feedError } = await admin.from('user_policy_feed').delete().eq('user_id', user.id);
    if (feedError) console.error('Feed invalidation failed:', feedError);
  }

  return NextResponse.json({ ok: true, changed, financialUpdatedAt });
}
