import type { ReceiptOrder } from '@/components/impact/receipt/receiptModel';

/*
 * My Impact (/impact), as data: the saved analyses the page reads, which of
 * them it shows and in what order, and its methodology. The cumulative
 * tab's arithmetic is in cumulativeModel.ts, which loads with that tab.
 * Three-free and React-free (tests/impactList.test.ts).
 */

/** One saved analysis, with just the parts of the structured result this page shows. */
export interface PolicyAnalysisRow {
  id: string;
  policy_id: string;
  policy_title: string;
  dollar_impact: number;
  category: string;
  created_at: string;
  summary: string | null;
  /** Cumulative dollars after 1, 3 and 5 years, from the analysis (absent on earlier, short analyses). */
  timeline: { year1?: number; year3?: number; year5?: number } | null;
  tradeoffs: { gains?: { label: string; value: number }[]; losses?: { label: string; value: number }[] } | null;
  recommendations: { step: string; priority?: string }[] | null;
  legacy: boolean | null;
  /** Present on every generated analysis; absent on placeholders for jobs still running. */
  analysis_title: string | null;
}

export const ROW_COLUMNS =
  'id, policy_id, policy_title, category, created_at, dollar_impact:net_annual_impact, ' +
  'summary:analysis->>plainEnglishSummary, timeline:analysis->timeline, tradeoffs:analysis->tradeoffs, ' +
  'recommendations:analysis->recommendations, legacy:analysis->legacy, analysis_title:analysis->>policyTitle';

export type ImpactTab = 'individual' | 'cumulative';

export const METHODOLOGY = [
  {
    q: 'Where do the policies come from?',
    a: 'Federal bills and laws come from Congress.gov, the official source for legislation, and state bills from Open States, which tracks every state legislature. Each policy shows its latest official action and links to the record. If those sources are unavailable, a policy may be suggested by the AI instead and is clearly marked as not verified.',
  },
  {
    q: 'How are dollar amounts estimated?',
    a: "An AI model (Anthropic's Claude) reads the policy's official summary and status and applies them to the ranges in your profile: income bracket, state, filing status, housing, debts and dependents. It shows the assumptions it made. These are educational estimates, not a tax calculation or professional advice.",
  },
  {
    q: 'What does "net annual impact" mean?',
    a: 'The sum of the estimated gains and costs across the policies you have selected, expressed per year. Gains are positive; costs are negative.',
  },
  {
    q: 'How do the 1, 3 and 5-year projections work?',
    a: "Each analysis estimates how much the policy could add up to after 1, 3 and 5 years, which can differ from the yearly figure times the years (a phase-in, or a benefit that ends). The skyline and the projection chart use those estimates as they are; an earlier, short analysis that has none is left out and marked, never filled in.",
  },
  {
    q: 'How confident are these estimates?',
    a: 'Each analysis has a confidence score. Proposed bills are less certain than enacted laws, and estimates depend on details a bill may not specify yet. Check the official record, and talk to a qualified professional (for example a CPA or a free IRS VITA clinic) before making major decisions.',
  },
] as const;

/** Placeholders for jobs still running (no analysis yet) aren't shown, matching the dashboard totals. */
export function shownRows(rows: readonly PolicyAnalysisRow[]): PolicyAnalysisRow[] {
  return rows.filter((r) => r.analysis_title || r.legacy);
}

/** The receipt's order: the largest impact first (either way), or the newest first. */
export function sortRows(rows: readonly PolicyAnalysisRow[], by: ReceiptOrder): PolicyAnalysisRow[] {
  return [...rows].sort((a, b) => {
    if (by === 'impact') return Math.abs(b.dollar_impact || 0) - Math.abs(a.dollar_impact || 0);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
