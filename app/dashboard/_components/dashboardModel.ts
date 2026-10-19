/**
 * The dashboard's pure pieces: its data shapes, the greeting, the one-line
 * summary under it and the receipt of recent analyses. No React and no
 * browser APIs, so the page, its sections and the unit tests
 * (tests/dashboard.test.ts) share one source of truth. Kept light: this is
 * in the page's first load (the ledger itself, lib/ledger, and the
 * household, profileHousehold.ts, load with the sections that draw them).
 */
import { formatUSD } from '@/lib/format';
import type { LedgerModel } from '@/lib/ledger';

/** One row of the policy_analyses view (the user's analyses, newest first). */
export interface PolicyAnalysisRow {
  id: string;
  policy_id: string;
  policy_title: string;
  analysis_text: string;
  /** The policy's net yearly impact for the user: + saves them money, − costs them. */
  dollar_impact: number;
  category: string;
  /** The policy's recorded status ('enacted' is law). */
  status?: string | null;
  created_at: string;
}

/** analysis_totals(): every analysis, not just the listed ones. */
export interface AnalysisTotals {
  count: number;
  netAnnual: number;
  /** The part of netAnnual from policies not recorded as enacted (no status included); null if the RPC didn't say. */
  pendingAnnual?: number | null;
}

/**
 * The ledger's headline, its net and its count, without the ledger: exactly
 * buildLedger's rule (lib/ledger.ts; tests/dashboard.test.ts keeps the two
 * equal). The latest analyses' sum is the net unless the totals cover more
 * analyses than the list holds; then the totals' net is, over their count.
 */
export function ledgerHeadline(analyses: readonly Pick<PolicyAnalysisRow, 'dollar_impact'>[], totals: AnalysisTotals | null): { analysed: number; net: number } {
  const listed = analyses.length;
  const sum = analyses.reduce((s, a) => {
    const n = typeof a.dollar_impact === 'string' ? Number(a.dollar_impact) : a.dollar_impact;
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);
  const count = totals && Number.isFinite(Number(totals.count)) ? Math.max(0, Math.floor(Number(totals.count))) : null;
  const totalNet = totals && Number.isFinite(Number(totals.netAnnual)) ? Number(totals.netAnnual) : null;
  const rest = count !== null && totalNet !== null && count > listed;
  const net = Math.round(rest ? (totalNet as number) : sum) || 0;
  return { analysed: rest ? (count as number) : listed, net };
}

/** The user_profiles columns the dashboard reads: the name, and the answers the household is drawn from. */
export const PROFILE_COLUMNS =
  'first_name, state, filing_status, housing_situation, has_dependents, dependents_count, dependent_age_bands, debt_types';

export interface DashboardProfileRow {
  first_name?: string | null;
  state?: string | null;
  filing_status?: string | null;
  housing_situation?: string | null;
  has_dependents?: boolean | null;
  dependents_count?: number | null;
  dependent_age_bands?: string[] | null;
  debt_types?: string[] | null;
}

export type DayPart = 'morning' | 'afternoon' | 'evening';

/** "Good morning" until noon, "afternoon" until five, then "evening" (the visitor's own clock). */
export function dayPart(hour: number): DayPart {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/**
 * The one honest line under the greeting: what the analyzed policies add up
 * to, in words and rounded dollars, or what to do first when there are none.
 */
export function ledgerSummary(model: Pick<LedgerModel, 'analysed' | 'net'>): string {
  const n = model.analysed;
  if (n === 0) return 'Nothing analyzed yet. Pick a policy from your feed to see what it could mean for your household.';
  const amount = `about ${formatUSD(Math.abs(model.net))} a year`;
  if (n === 1) {
    if (model.net > 0) return `The policy you analyzed saves you ${amount}.`;
    if (model.net < 0) return `The policy you analyzed costs you ${amount}.`;
    return 'The policy you analyzed makes no net change to your yearly budget.';
  }
  const policies = `your ${n} analyzed policies`;
  if (model.net > 0) return `On balance, ${policies} save you ${amount}.`;
  if (model.net < 0) return `On balance, ${policies} cost you ${amount}.`;
  return `On balance, ${policies} make no net change to your yearly budget.`;
}

/** The analyses with the largest gain and the largest cost among those listed (null when there's none). */
export function extremes(analyses: readonly PolicyAnalysisRow[]): { gain: PolicyAnalysisRow | null; cost: PolicyAnalysisRow | null } {
  let gain: PolicyAnalysisRow | null = null;
  let cost: PolicyAnalysisRow | null = null;
  for (const a of analyses) {
    if (a.dollar_impact > 0 && (!gain || a.dollar_impact > gain.dollar_impact)) gain = a;
    if (a.dollar_impact < 0 && (!cost || a.dollar_impact < cost.dollar_impact)) cost = a;
  }
  return { gain, cost };
}

/**
 * The receipt's foot: the net of the listed analyses (whole dollars) and its
 * label. When the list is only the latest few of more, it says so, so the
 * foot never passes for the full total (the ledger states that).
 */
export function receiptTotal(analyses: readonly Pick<PolicyAnalysisRow, 'dollar_impact'>[], analysed: number): { label: string; value: number } {
  const sum = analyses.reduce((s, a) => s + (Number(a.dollar_impact) || 0), 0);
  const value = Math.round(sum) || 0;
  const listed = analyses.length;
  return {
    value,
    label: analysed > listed ? `Net of these ${listed} (of ${analysed} analyzed)` : 'Net yearly impact',
  };
}
