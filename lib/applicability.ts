/**
 * Which parts of an analysis apply to a user, from the profile it was based
 * on. Sections that can't apply (home equity for a renter, debt rows for
 * someone with no debt) are hidden rather than shown as $0.
 *
 * Unknown profile fields (and a housing situation of "other") count as
 * "applies" so nothing is hidden by mistake. A mortgage among the user's
 * debts counts as owning property, whatever their own housing.
 */
export interface ApplicabilityProfile {
  housingSituation?: string | null;
  debtTypes?: string[] | null;
  employmentStatus?: string | null;
  dependentsCount?: number | null;
}

export interface Applicability {
  homeEquity: boolean;
  debt: boolean;
  paycheck: boolean;
}

const OWNS_HOME = new Set(['own_mortgage', 'own_outright']);
// Housing answers that say nothing about whether the user owns property.
const UNKNOWN_HOUSING = new Set(['', 'other']);
const NO_PAYCHECK = new Set(['unemployed', 'retired', 'student', 'unable_to_work']);

export function applicability(profile: ApplicabilityProfile | null | undefined): Applicability {
  const housing = profile?.housingSituation || '';
  const debts = Array.isArray(profile?.debtTypes) ? profile!.debtTypes! : null;
  const employment = profile?.employmentStatus || '';
  return {
    homeEquity: UNKNOWN_HOUSING.has(housing) || OWNS_HOME.has(housing) || !!debts?.includes('mortgage'),
    debt: !debts || debts.length === 0 || debts.some((d) => d !== 'none'),
    paycheck: !employment || !NO_PAYCHECK.has(employment),
  };
}
