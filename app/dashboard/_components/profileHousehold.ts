import { householdFromProfile, type HouseholdModel } from '@/lib/household';
import type { DebtType, DependentAgeBand, FilingStatus, HousingSituation } from '@/lib/profileOptions';
import type { DashboardProfileRow } from './dashboardModel';

/**
 * The household the avatar and the ledger draw, from the saved profile (the
 * same reading of the dependents fields as Settings). Null when there's no
 * profile or its housing isn't answered yet: then there's no avatar and no
 * household at the ledger's foot, rather than an empty plinth.
 *
 * Its own module so lib/household loads with the sections that draw it
 * (both split out of the page's first load), not with the page.
 */
export function householdFromRow(row: DashboardProfileRow | null | undefined): HouseholdModel | null {
  if (!row) return null;
  const count = row.dependents_count ?? (row.has_dependents ? 1 : 0);
  const model = householdFromProfile({
    housingSituation: (row.housing_situation ?? null) as HousingSituation | null,
    filingStatus: (row.filing_status ?? null) as FilingStatus | null,
    hasDependents: count > 0,
    dependentsCount: count,
    dependentAgeBands: (row.dependent_age_bands ?? []) as DependentAgeBand[],
    debtTypes: (row.debt_types ?? []) as DebtType[],
    state: row.state ?? null,
  });
  return model.dwelling ? model : null;
}
