/**
 * The financial profile as Settings edits it ("Your household"): the answers
 * the editor holds, read from the saved user_profiles row and checked with
 * the same schema /api/profile uses. Pure (no React), so the page that loads
 * and saves the profile, the editor (ProfileSection) and the tests all read
 * it the same way.
 */
import {
  AGE_RANGES, CONCERNS, DEBT_TYPES, DEPENDENT_AGE_BANDS, EDUCATION_LEVELS, EMPLOYMENT_STATUSES,
  FILING_STATUSES, HOME_VALUE_BANDS, HOUSING_SITUATIONS, INCOME_RANGES, INVESTMENT_TYPES, MAX_CONCERNS,
  MAX_DEPENDENTS, OCCUPATIONS, US_STATES, isHomeowner, validOnly, validOrEmpty,
  type DebtType, type DependentAgeBand, type FilingStatus, type HousingSituation, type Option,
} from '@/lib/profileOptions';
import { FinancialProfileSchema } from '@/lib/profileSchema';
import type { HouseholdInput } from '@/lib/household';

/** Every answer on the form; '' or [] where nothing (valid) is chosen yet. */
export interface ProfileDraft {
  state: string;
  city: string;
  ageRange: string;
  educationStage: string;
  employmentStatus: string;
  occupationCategory: string;
  incomeRange: string;
  filingStatus: string;
  housingSituation: string;
  /** Kept while the housing changes; only saved for a homeowner. */
  homeValueBand: string;
  debtTypes: string[];
  hasDependents: boolean;
  /** Kept (at least 1) while "No dependents" is chosen; only saved with dependents. */
  dependentsCount: number;
  dependentAgeBands: string[];
  topFinancialConcerns: string[];
  investments: string;
}

export type ProfileField = keyof ProfileDraft;

export const EMPTY_PROFILE_DRAFT: ProfileDraft = Object.freeze({
  state: '', city: '', ageRange: '', educationStage: '', employmentStatus: '', occupationCategory: '',
  incomeRange: '', filingStatus: '', housingSituation: '', homeValueBand: '', debtTypes: [],
  hasDependents: false, dependentsCount: 1, dependentAgeBands: [], topFinancialConcerns: [], investments: '',
}) as ProfileDraft;

/** A user_profiles row as Supabase returns it (select('*')); only the profile's columns are read. */
export type ProfileRow = { readonly [column: string]: unknown };

/** The valid picks from a stored list, each once, in the order stored. */
const picksFrom = (options: readonly Option[], stored: unknown) => [...new Set(validOnly(options, stored))];

/**
 * The editor's answers from the saved row. Anything outside the current
 * vocabulary (an older build's code, a hand-edited row) reads as blank, so it
 * gets picked again rather than saved back; a pick stored twice reads once.
 */
export function draftFromRow(row: ProfileRow | null | undefined): ProfileDraft {
  if (!row) return { ...EMPTY_PROFILE_DRAFT, debtTypes: [], dependentAgeBands: [], topFinancialConcerns: [] };
  const stored = Number(row.dependents_count);
  // No count saved (an older row): its yes/no answer stands for one dependent.
  const count = row.dependents_count === null || row.dependents_count === undefined ? (row.has_dependents ? 1 : 0) : stored;
  return {
    state: typeof row.state === 'string' && (US_STATES as readonly string[]).includes(row.state) ? row.state : '',
    city: typeof row.city === 'string' ? row.city : '',
    ageRange: validOrEmpty(AGE_RANGES, row.age_range),
    educationStage: validOrEmpty(EDUCATION_LEVELS, row.education_stage),
    employmentStatus: validOrEmpty(EMPLOYMENT_STATUSES, row.employment_status),
    occupationCategory: validOrEmpty(OCCUPATIONS, row.occupation_category),
    incomeRange: validOrEmpty(INCOME_RANGES, row.income_range),
    filingStatus: validOrEmpty(FILING_STATUSES, row.filing_status),
    housingSituation: validOrEmpty(HOUSING_SITUATIONS, row.housing_situation),
    homeValueBand: validOrEmpty(HOME_VALUE_BANDS, row.home_value_band),
    debtTypes: picksFrom(DEBT_TYPES, row.debt_types),
    hasDependents: count > 0,
    dependentsCount: stored > 0 ? Math.min(MAX_DEPENDENTS, Math.floor(stored)) : 1,
    dependentAgeBands: picksFrom(DEPENDENT_AGE_BANDS, row.dependent_age_bands),
    topFinancialConcerns: picksFrom(CONCERNS, row.top_financial_concerns).slice(0, MAX_CONCERNS),
    investments: validOrEmpty(INVESTMENT_TYPES, row.investments),
  };
}

/**
 * What a save sends, before validation: the dependents' count and ages only
 * with dependents, the home's value only for a homeowner, and blank optional
 * answers as null.
 */
export function profileInput(d: ProfileDraft) {
  return {
    state: d.state,
    city: d.city,
    ageRange: d.ageRange,
    educationStage: d.educationStage,
    employmentStatus: d.employmentStatus,
    occupationCategory: d.occupationCategory,
    incomeRange: d.incomeRange,
    filingStatus: d.filingStatus,
    housingSituation: d.housingSituation,
    debtTypes: d.debtTypes,
    hasDependents: d.hasDependents,
    dependentsCount: d.hasDependents ? d.dependentsCount : 0,
    dependentAgeBands: d.hasDependents ? d.dependentAgeBands : [],
    topFinancialConcerns: d.topFinancialConcerns,
    investments: d.investments || null,
    homeValueBand: isHomeowner(d.housingSituation) && d.homeValueBand ? d.homeValueBand : null,
  };
}

/** The draft checked with the schema /api/profile uses: `data` is the body's `profile` to PUT. */
export const parseProfileDraft = (d: ProfileDraft) => FinancialProfileSchema.safeParse(profileInput(d));

/** The toasts a save shows (the page's toast, so every section shares one). */
export const PROFILE_SAVED_MESSAGE = 'Saved. Your policy feed will rebuild from your updated profile.';
export const PROFILE_INCOMPLETE_MESSAGE = 'Please answer every required field before saving.';

/** Each answer's visible label (the form's <label> or group name). */
export const FIELD_LABELS: Record<ProfileField, string> = {
  state: 'State',
  city: 'City (optional)',
  ageRange: 'Age Range',
  educationStage: 'Education Level',
  employmentStatus: 'Employment Status',
  occupationCategory: 'Occupation Category',
  incomeRange: 'Annual Household Income',
  filingStatus: 'Tax Filing Status',
  housingSituation: 'Housing Situation',
  homeValueBand: 'Home Value (optional)',
  debtTypes: 'Debt Types (select all that apply)',
  hasDependents: 'Dependents',
  dependentsCount: 'How many',
  dependentAgeBands: 'Ages (optional)',
  topFinancialConcerns: `Top Financial Concerns (up to ${MAX_CONCERNS})`,
  investments: 'Investments (optional)',
};

/** A label without its "(optional)"-style note, for lists ("State, Age Range"). */
export const fieldName = (f: ProfileField) => FIELD_LABELS[f].replace(/\s*\(.*\)$/, '');

/**
 * The form in onboarding's four sections, in its order: the same answers in
 * the same places as "Build your household" (app/onboarding/page.tsx STAGES).
 */
export const PROFILE_STAGES = [
  { id: 'location', label: 'Location', fields: ['state', 'city'] },
  { id: 'about', label: 'About you', fields: ['ageRange', 'educationStage', 'employmentStatus', 'occupationCategory'] },
  { id: 'finances', label: 'Finances', fields: ['incomeRange', 'filingStatus', 'housingSituation', 'homeValueBand', 'debtTypes'] },
  { id: 'household', label: 'Household', fields: ['hasDependents', 'dependentsCount', 'dependentAgeBands', 'topFinancialConcerns', 'investments'] },
] as const satisfies readonly { id: string; label: string; fields: readonly ProfileField[] }[];

export type ProfileStageId = (typeof PROFILE_STAGES)[number]['id'];

/** A section's answers. */
export const stageFields = (id: ProfileStageId): readonly ProfileField[] =>
  PROFILE_STAGES.find((s) => s.id === id)?.fields ?? [];

const FIELD_ORDER: readonly ProfileField[] = PROFILE_STAGES.flatMap((s) => s.fields);

/** The answers chosen from a list (one tile, or a select): every text answer but the city. */
export type ChoiceField = Exclude<{ [K in ProfileField]: ProfileDraft[K] extends string ? K : never }[ProfileField], 'city'>;

/** The answers picked from a list of several. */
const MULTI_PICK: readonly ProfileField[] = ['debtTypes', 'dependentAgeBands', 'topFinancialConcerns'];

/**
 * The answers still needed before the profile can be saved, in form order
 * (from the schema's own complaints, so the two never disagree). A complaint
 * about no one answer (the schema's "Duplicate selections.") points at the
 * lists picked twice from, or at the lists it checks, so the editor never
 * calls complete a profile a save would refuse.
 */
export function missingFields(d: ProfileDraft): ProfileField[] {
  const parsed = parseProfileDraft(d);
  if (parsed.success) return [];
  const flagged = new Set<unknown>();
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if ((FIELD_ORDER as readonly unknown[]).includes(field)) {
      flagged.add(field);
      continue;
    }
    const twice = MULTI_PICK.filter((f) => {
      const list = d[f] as readonly string[];
      return new Set(list).size !== list.length;
    });
    for (const f of twice.length ? twice : (['debtTypes', 'topFinancialConcerns'] as const)) flagged.add(f);
  }
  return FIELD_ORDER.filter((f) => flagged.has(f));
}

/** A draft by what saving it would send (order of picks and spaces around the city don't count). */
function answerKey(d: ProfileDraft): string {
  const p = profileInput(d);
  const sorted = (list: readonly string[]) => [...list].sort();
  return JSON.stringify({
    ...p,
    city: p.city.trim(),
    debtTypes: sorted(p.debtTypes),
    dependentAgeBands: sorted(p.dependentAgeBands),
    topFinancialConcerns: sorted(p.topFinancialConcerns),
  });
}

/** Two drafts that would save the same profile (so the second has no unsaved changes). */
export const sameAnswers = (a: ProfileDraft, b: ProfileDraft) => a === b || answerKey(a) === answerKey(b);

/** A debt picked or unpicked: "No debt" stands alone, and any debt replaces it. */
export function toggleDebt(list: readonly string[], value: string): string[] {
  if (list.includes(value)) return list.filter((v) => v !== value);
  return value === 'none' ? ['none'] : [...list.filter((v) => v !== 'none'), value];
}

/** A choice picked or unpicked, up to `max` picks (further picks are ignored). */
export function togglePick(list: readonly string[], value: string, max = Infinity): string[] {
  if (list.includes(value)) return list.filter((v) => v !== value);
  return list.length >= max ? [...list] : [...list, value];
}

/** The answers the household avatar draws. */
export type HouseholdAnswers = Pick<
  ProfileDraft,
  'housingSituation' | 'filingStatus' | 'hasDependents' | 'dependentsCount' | 'dependentAgeBands' | 'debtTypes' | 'state'
>;

/**
 * What the household avatar draws from the answers on screen (for
 * lib/household householdFromProfile): the dependents only once there are
 * some, as a save would send them.
 */
export function householdInput(d: HouseholdAnswers): HouseholdInput {
  return {
    housingSituation: d.housingSituation as HousingSituation | '',
    filingStatus: d.filingStatus as FilingStatus | '',
    hasDependents: d.hasDependents,
    dependentsCount: d.hasDependents ? d.dependentsCount : 0,
    dependentAgeBands: (d.hasDependents ? d.dependentAgeBands : []) as DependentAgeBand[],
    debtTypes: d.debtTypes as DebtType[],
    state: d.state,
  };
}
