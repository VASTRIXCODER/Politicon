import { describe, expect, it } from 'vitest';
import { mapDbProfile } from '@/lib/profile';
import type { UserProfile } from '@/types';

const BASE: UserProfile = {
  id: 'base',
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
  topFinancialConcerns: [],
};

describe('mapDbProfile', () => {
  it('returns the base profile when there is no row', () => {
    expect(mapDbProfile(null, BASE)).toBe(BASE);
  });

  it('maps snake_case columns onto camelCase fields', () => {
    const p = mapDbProfile(
      { id: 'u1', state: 'CA', income_range: '100k_150k', has_dependents: true, debt_types: ['student'] },
      BASE,
    );
    expect(p).toMatchObject({ id: 'u1', state: 'CA', incomeRange: '100k_150k', hasDependents: true, debtTypes: ['student'] });
  });

  it('keeps base values for null columns', () => {
    const p = mapDbProfile({ id: 'u1', state: null, housing_situation: null }, BASE);
    expect(p.state).toBe('Unknown');
    expect(p.housingSituation).toBe('rent');
  });
});
