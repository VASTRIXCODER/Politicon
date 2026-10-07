/**
 * The single source of truth for every financial-profile field: the codes
 * stored in user_profiles, the labels shown in onboarding and Settings, and
 * the wording sent to the model. The database CHECK constraints in
 * supabase/migrations/*_profile_vocabulary.sql mirror these lists — keep them
 * in sync (tests/profileOptions.test.ts checks the migration).
 */

export interface Option<V extends string = string> {
  value: V;
  label: string;
}

function opts<const T extends readonly Option[]>(o: T) {
  return o;
}

export const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
  'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
  'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
  'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
  'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah',
  'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
] as const;

// Politicon is for adults (18+).
export const AGE_RANGES = opts([
  { value: '18_24', label: '18–24' },
  { value: '25_34', label: '25–34' },
  { value: '35_44', label: '35–44' },
  { value: '45_54', label: '45–54' },
  { value: '55_64', label: '55–64' },
  { value: '65_plus', label: '65+' },
] as const);

export const EDUCATION_LEVELS = opts([
  { value: 'high_school', label: 'High school / GED' },
  { value: 'some_college', label: 'Some college' },
  { value: 'college_2yr', label: "Associate's degree" },
  { value: 'college_4yr', label: "Bachelor's degree" },
  { value: 'graduate', label: 'Graduate or professional degree' },
] as const);

export const EMPLOYMENT_STATUSES = opts([
  { value: 'employed_full', label: 'Employed full-time' },
  { value: 'employed_part', label: 'Employed part-time' },
  { value: 'self_employed', label: 'Self-employed' },
  { value: 'unemployed', label: 'Looking for work' },
  { value: 'student', label: 'Student' },
  { value: 'retired', label: 'Retired' },
  { value: 'unable_to_work', label: 'Unable to work' },
] as const);

export const OCCUPATIONS = opts([
  { value: 'tech', label: 'Tech / Engineering' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'education', label: 'Education' },
  { value: 'business_finance', label: 'Business / Finance' },
  { value: 'legal', label: 'Legal' },
  { value: 'creative_media', label: 'Creative / Media' },
  { value: 'construction_trades', label: 'Construction / Trades' },
  { value: 'service_retail', label: 'Service / Retail' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'agriculture', label: 'Agriculture' },
  { value: 'public_sector', label: 'Government / Military' },
  { value: 'other', label: 'Other' },
  { value: 'not_applicable', label: 'Not working right now' },
] as const);

export const INCOME_RANGES = opts([
  { value: 'under_25k', label: 'Under $25,000' },
  { value: '25k_50k', label: '$25,000 – $50,000' },
  { value: '50k_75k', label: '$50,000 – $75,000' },
  { value: '75k_100k', label: '$75,000 – $100,000' },
  { value: '100k_150k', label: '$100,000 – $150,000' },
  { value: '150k_250k', label: '$150,000 – $250,000' },
  { value: '250k_500k', label: '$250,000 – $500,000' },
  { value: 'over_500k', label: 'Over $500,000' },
] as const);

/** Representative household income for each bracket, used to scale estimates. */
export const INCOME_MIDPOINTS: Record<IncomeRange, number> = {
  under_25k: 18000,
  '25k_50k': 37500,
  '50k_75k': 62500,
  '75k_100k': 87500,
  '100k_150k': 125000,
  '150k_250k': 200000,
  '250k_500k': 350000,
  over_500k: 750000,
};

export const FILING_STATUSES = opts([
  { value: 'single', label: 'Single' },
  { value: 'married_joint', label: 'Married filing jointly' },
  { value: 'married_separate', label: 'Married filing separately' },
  { value: 'head_of_household', label: 'Head of household' },
  { value: 'qualifying_surviving_spouse', label: 'Qualifying surviving spouse' },
  { value: 'dependent', label: "Claimed as a dependent on someone else's return" },
  { value: 'prefer_not', label: 'Prefer not to say' },
] as const);

export const HOUSING_SITUATIONS = opts([
  { value: 'rent', label: 'Rent' },
  { value: 'rent_assisted', label: 'Rent with assistance (e.g. Section 8)' },
  { value: 'own_mortgage', label: 'Own with a mortgage' },
  { value: 'own_outright', label: 'Own outright (no mortgage)' },
  { value: 'live_with_family', label: 'Live with family' },
  { value: 'campus', label: 'Campus housing' },
  { value: 'other', label: 'Other' },
] as const);

export const DEBT_TYPES = opts([
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'student_loans', label: 'Student loans' },
  { value: 'auto_loan', label: 'Auto loan' },
  { value: 'credit_card', label: 'Credit card debt' },
  { value: 'medical', label: 'Medical debt' },
  { value: 'personal_loan', label: 'Personal loan' },
  { value: 'business_loan', label: 'Business loan' },
  { value: 'none', label: 'No debt' },
] as const);

export const CONCERNS = opts([
  { value: 'cost_of_living', label: 'Rising cost of living' },
  { value: 'housing_costs', label: 'Housing costs' },
  { value: 'healthcare_costs', label: 'Healthcare costs' },
  { value: 'student_debt', label: 'Student debt' },
  { value: 'job_security', label: 'Job security' },
  { value: 'retirement', label: 'Saving for retirement' },
  { value: 'childcare', label: 'Childcare costs' },
  { value: 'taxes', label: 'Tax burden' },
  { value: 'inflation', label: 'Inflation' },
  { value: 'savings', label: 'Building savings' },
  { value: 'investments', label: 'Investment returns' },
] as const);

export const MAX_CONCERNS = 3;

export const DEPENDENT_AGE_BANDS = opts([
  { value: 'under_5', label: 'Under 5' },
  { value: '5_12', label: '5–12' },
  { value: '13_17', label: '13–17' },
  { value: '18_plus', label: '18 or older' },
] as const);

export const MAX_DEPENDENTS = 10;

export const INVESTMENT_TYPES = opts([
  { value: 'none', label: 'No investments' },
  { value: 'retirement_only', label: 'Retirement accounts only (401k, IRA)' },
  { value: 'brokerage', label: 'Brokerage / stocks only' },
  { value: 'both', label: 'Retirement accounts and brokerage' },
] as const);

export const HOME_VALUE_BANDS = opts([
  { value: 'under_200k', label: 'Under $200,000' },
  { value: '200k_400k', label: '$200,000 – $400,000' },
  { value: '400k_750k', label: '$400,000 – $750,000' },
  { value: '750k_plus', label: 'Over $750,000' },
] as const);

type Values<T extends readonly Option[]> = T[number]['value'];
export type AgeRange = Values<typeof AGE_RANGES>;
export type EducationLevel = Values<typeof EDUCATION_LEVELS>;
export type EmploymentStatus = Values<typeof EMPLOYMENT_STATUSES>;
export type Occupation = Values<typeof OCCUPATIONS>;
export type IncomeRange = Values<typeof INCOME_RANGES>;
export type FilingStatus = Values<typeof FILING_STATUSES>;
export type HousingSituation = Values<typeof HOUSING_SITUATIONS>;
export type DebtType = Values<typeof DEBT_TYPES>;
export type Concern = Values<typeof CONCERNS>;
export type DependentAgeBand = Values<typeof DEPENDENT_AGE_BANDS>;
export type InvestmentType = Values<typeof INVESTMENT_TYPES>;
export type HomeValueBand = Values<typeof HOME_VALUE_BANDS>;

export const valuesOf = <T extends readonly Option[]>(o: T) => o.map((x) => x.value) as Values<T>[];

/** A stored value if it's still in the vocabulary, else '' (so the UI asks again). */
export const validOrEmpty = (options: readonly Option[], v: unknown): string =>
  typeof v === 'string' && options.some((o) => o.value === v) ? v : '';

/** The stored values that are still in the vocabulary. */
export const validOnly = (options: readonly Option[], v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => options.some((o) => o.value === x)) : [];

/** Human label for a stored code (falls back to the code itself). */
export function labelOf(options: readonly Option[], value: string | null | undefined): string {
  if (!value) return 'Not provided';
  return options.find((o) => o.value === value)?.label ?? value;
}

export const isHomeowner = (h: string | null | undefined) => h === 'own_mortgage' || h === 'own_outright';
export const isRenter = (h: string | null | undefined) => h === 'rent' || h === 'rent_assisted';

/**
 * Older builds stored different codes in onboarding vs. Settings. This maps
 * every legacy code onto the current vocabulary (null = must be re-asked).
 * Mirrored by the data migration.
 */
export const LEGACY_CODES = {
  age_range: {
    under_18: null, '18_22': '18_24', '23_30': '25_34', '31_45': '35_44', '46_60': '45_54', '60_plus': '65_plus',
    '18_25': '18_24', '26_30': '25_34', '46_55': '45_54', '56_65': '55_64',
  },
  education_stage: {
    middle_high: 'high_school', not_enrolled: null, professional: 'graduate', doctorate: 'graduate',
  },
  employment_status: { disabled: 'unable_to_work' },
  occupation_category: {
    tech_software: 'tech', healthcare_medical: 'healthcare', education_teaching: 'education',
    arts_entertainment: 'creative_media', retail_service: 'service_retail', government_military: 'public_sector',
  },
  income_range: { under_30k: 'under_25k', '30k_50k': '25k_50k', '100k_plus': '100k_150k', over_250k: '250k_500k' },
  filing_status: { head_household: 'head_of_household', qualifying_widow: 'qualifying_surviving_spouse' },
  housing_situation: { own: 'own_mortgage', family: 'live_with_family' },
  debt_types: { auto_loans: 'auto_loan' },
  top_financial_concerns: { healthcare: 'healthcare_costs', housing: 'housing_costs', investment: 'investments' },
} as const;
