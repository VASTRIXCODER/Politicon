import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AGE_RANGES, CONCERNS, DEBT_TYPES, DEPENDENT_AGE_BANDS, EDUCATION_LEVELS, EMPLOYMENT_STATUSES,
  FILING_STATUSES, HOME_VALUE_BANDS, HOUSING_SITUATIONS, INCOME_MIDPOINTS, INCOME_RANGES,
  INVESTMENT_TYPES, LEGACY_CODES, OCCUPATIONS, US_STATES, valuesOf,
} from '@/lib/profileOptions';
import { FinancialProfileSchema } from '@/lib/profileSchema';
import { incomeMidpoint } from '@/lib/simpleMode';

const migration = readFileSync(
  path.join(__dirname, '../supabase/migrations/20261007130000_profile_vocabulary.sql'),
  'utf8',
);

/** Values listed in a CHECK constraint, e.g. `user_profiles_age_range_check check (... in ('a','b'))`. */
function checkValues(constraint: string): string[] {
  const start = migration.indexOf(`add constraint ${constraint}`);
  expect(start, `constraint ${constraint} missing`).toBeGreaterThan(-1);
  const body = migration.slice(start, migration.indexOf('\n  add constraint', start + 1));
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('database CHECK constraints match lib/profileOptions', () => {
  const cases: [string, readonly string[]][] = [
    ['user_profiles_age_range_check', valuesOf(AGE_RANGES)],
    ['user_profiles_education_stage_check', valuesOf(EDUCATION_LEVELS)],
    ['user_profiles_employment_status_check', valuesOf(EMPLOYMENT_STATUSES)],
    ['user_profiles_occupation_category_check', valuesOf(OCCUPATIONS)],
    ['user_profiles_income_range_check', valuesOf(INCOME_RANGES)],
    ['user_profiles_filing_status_check', valuesOf(FILING_STATUSES)],
    ['user_profiles_housing_situation_check', valuesOf(HOUSING_SITUATIONS)],
    ['user_profiles_state_check', US_STATES],
    ['user_profiles_debt_types_check', valuesOf(DEBT_TYPES)],
    ['user_profiles_concerns_check', valuesOf(CONCERNS)],
    ['user_profiles_dependent_age_bands_check', valuesOf(DEPENDENT_AGE_BANDS)],
    ['user_profiles_investments_check', valuesOf(INVESTMENT_TYPES)],
    ['user_profiles_home_value_band_check', valuesOf(HOME_VALUE_BANDS)],
  ];
  it.each(cases)('%s', (constraint, values) => {
    expect(new Set(checkValues(constraint))).toEqual(new Set(values));
  });
});

describe('legacy codes', () => {
  it('only map onto current values', () => {
    const current: Record<string, readonly string[]> = {
      age_range: valuesOf(AGE_RANGES),
      education_stage: valuesOf(EDUCATION_LEVELS),
      employment_status: valuesOf(EMPLOYMENT_STATUSES),
      occupation_category: valuesOf(OCCUPATIONS),
      income_range: valuesOf(INCOME_RANGES),
      filing_status: valuesOf(FILING_STATUSES),
      housing_situation: valuesOf(HOUSING_SITUATIONS),
      debt_types: valuesOf(DEBT_TYPES),
      top_financial_concerns: valuesOf(CONCERNS),
    };
    for (const [field, map] of Object.entries(LEGACY_CODES)) {
      for (const target of Object.values(map)) {
        if (target !== null) expect(current[field]).toContain(target);
      }
    }
  });
});

describe('incomeMidpoint', () => {
  it('uses the shared bracket table', () => {
    for (const r of valuesOf(INCOME_RANGES)) {
      expect(incomeMidpoint({ incomeRange: r } as never)).toBe(INCOME_MIDPOINTS[r]);
    }
  });
});

describe('FinancialProfileSchema', () => {
  const valid = {
    state: 'Ohio', city: '', ageRange: '25_34', educationStage: 'college_4yr', employmentStatus: 'employed_full',
    occupationCategory: 'tech', incomeRange: '75k_100k', filingStatus: 'single', housingSituation: 'rent',
    debtTypes: ['student_loans'], hasDependents: false, dependentsCount: 0, dependentAgeBands: [],
    topFinancialConcerns: ['cost_of_living'], investments: null, homeValueBand: null,
  };

  it('accepts a complete profile', () => {
    expect(FinancialProfileSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects codes outside the vocabulary', () => {
    expect(FinancialProfileSchema.safeParse({ ...valid, ageRange: 'under_18' }).success).toBe(false);
    expect(FinancialProfileSchema.safeParse({ ...valid, state: 'Narnia' }).success).toBe(false);
  });

  it('rejects "No debt" combined with real debts', () => {
    expect(FinancialProfileSchema.safeParse({ ...valid, debtTypes: ['none', 'mortgage'] }).success).toBe(false);
  });

  it('requires dependents count to agree with the yes/no answer', () => {
    expect(FinancialProfileSchema.safeParse({ ...valid, hasDependents: true, dependentsCount: 0 }).success).toBe(false);
    expect(FinancialProfileSchema.safeParse({ ...valid, hasDependents: true, dependentsCount: 2, dependentAgeBands: ['5_12'] }).success).toBe(true);
  });

  it('caps concerns at three', () => {
    expect(FinancialProfileSchema.safeParse({ ...valid, topFinancialConcerns: ['taxes', 'inflation', 'savings', 'retirement'] }).success).toBe(false);
  });
});
