import { UserProfile } from '@/types';

/** The shape of a user_profiles row as stored in Supabase (snake_case columns). */
export interface ProfileRow {
  id?: string;
  email?: string | null;
  first_name?: string | null;
  has_completed_onboarding?: boolean | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  age_range?: string | null;
  education_stage?: string | null;
  employment_status?: string | null;
  occupation_category?: string | null;
  income_range?: string | null;
  filing_status?: string | null;
  housing_situation?: string | null;
  debt_types?: string[] | null;
  has_dependents?: boolean | null;
  top_financial_concerns?: string[] | null;
  reading_mode?: string | null;
}

/**
 * Map a snake_case Supabase user_profiles row onto the camelCase UserProfile
 * fields the app + Claude prompts actually read. Only defined values override
 * the base profile, so partial rows degrade gracefully.
 */
export function mapDbProfile(row: ProfileRow | null | undefined, base: UserProfile): UserProfile {
  if (!row) return base;
  const pick = <T>(v: T | null | undefined, fallback: T): T => (v === null || v === undefined ? fallback : v);
  return {
    ...base,
    id: row.id || base.id,
    email: pick(row.email, base.email),
    firstName: pick(row.first_name, base.firstName),
    hasCompletedOnboarding: pick(row.has_completed_onboarding, base.hasCompletedOnboarding),
    country: pick(row.country, base.country),
    state: pick(row.state, base.state),
    city: pick(row.city, base.city),
    ageRange: pick(row.age_range, base.ageRange),
    educationStage: pick(row.education_stage, base.educationStage),
    employmentStatus: pick(row.employment_status, base.employmentStatus),
    occupationCategory: pick(row.occupation_category, base.occupationCategory),
    incomeRange: pick(row.income_range, base.incomeRange),
    filingStatus: pick(row.filing_status, base.filingStatus),
    housingSituation: pick(row.housing_situation, base.housingSituation),
    debtTypes: pick(row.debt_types, base.debtTypes),
    hasDependents: pick(row.has_dependents, base.hasDependents),
    topFinancialConcerns: pick(row.top_financial_concerns, base.topFinancialConcerns),
  };
}
