import { z } from 'zod';
import {
  AGE_RANGES, CONCERNS, DEBT_TYPES, DEPENDENT_AGE_BANDS, EDUCATION_LEVELS, EMPLOYMENT_STATUSES,
  FILING_STATUSES, HOME_VALUE_BANDS, HOUSING_SITUATIONS, INCOME_RANGES, INVESTMENT_TYPES, MAX_CONCERNS,
  MAX_DEPENDENTS, OCCUPATIONS, US_STATES, valuesOf, type Option,
} from '@/lib/profileOptions';

const oneOf = <T extends readonly Option[]>(o: T) => z.enum(valuesOf(o) as [T[number]['value'], ...T[number]['value'][]]);

/**
 * A complete financial profile as submitted by onboarding or Settings.
 * Shared by the client (to validate before sending) and /api/profile.
 */
export const FinancialProfileSchema = z
  .object({
    state: z.enum(US_STATES),
    city: z.string().trim().max(100).default(''),
    ageRange: oneOf(AGE_RANGES),
    educationStage: oneOf(EDUCATION_LEVELS),
    employmentStatus: oneOf(EMPLOYMENT_STATUSES),
    occupationCategory: oneOf(OCCUPATIONS),
    incomeRange: oneOf(INCOME_RANGES),
    filingStatus: oneOf(FILING_STATUSES),
    housingSituation: oneOf(HOUSING_SITUATIONS),
    debtTypes: z.array(oneOf(DEBT_TYPES)).min(1).max(DEBT_TYPES.length),
    hasDependents: z.boolean(),
    dependentsCount: z.number().int().min(0).max(MAX_DEPENDENTS),
    dependentAgeBands: z.array(oneOf(DEPENDENT_AGE_BANDS)).max(DEPENDENT_AGE_BANDS.length),
    topFinancialConcerns: z.array(oneOf(CONCERNS)).min(1).max(MAX_CONCERNS),
    investments: oneOf(INVESTMENT_TYPES).nullable().default(null),
    homeValueBand: oneOf(HOME_VALUE_BANDS).nullable().default(null),
  })
  .refine((p) => !p.debtTypes.includes('none') || p.debtTypes.length === 1, {
    message: '"No debt" can’t be combined with other debts.',
    path: ['debtTypes'],
  })
  .refine((p) => p.hasDependents === p.dependentsCount > 0, {
    message: 'Number of dependents doesn’t match.',
    path: ['dependentsCount'],
  })
  .refine((p) => p.hasDependents || p.dependentAgeBands.length === 0, {
    message: 'Dependent ages given without dependents.',
    path: ['dependentAgeBands'],
  })
  .refine((p) => new Set(p.debtTypes).size === p.debtTypes.length && new Set(p.topFinancialConcerns).size === p.topFinancialConcerns.length, {
    message: 'Duplicate selections.',
  });

export type FinancialProfileInput = z.input<typeof FinancialProfileSchema>;
export type FinancialProfile = z.output<typeof FinancialProfileSchema>;
