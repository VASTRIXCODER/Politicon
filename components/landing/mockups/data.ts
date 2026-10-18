import {
  BRACKET_ROWS,
  CATEGORIES,
  CHART_SCALE,
  EXAMPLE_POLICIES,
  exampleImpact,
  type CategoryKey,
} from '@/lib/explorerData';

/*
 * The example figures the landing page's product mockups quote. Every one
 * comes from the explorer's ILLUSTRATIVE dataset (lib/explorerData), so the
 * mockups always agree with the explorer chart, and none of them is a real
 * bill or a real analysis. Picked to be even-handed: between them the
 * mockups show gains and costs, for lower and higher incomes, from policy
 * types across the spectrum. Plain data, no React: tests/landingSections
 * checks the balance.
 */

/** The policy page: one example policy, seen from one sample bracket. */
export const POLICY_EXAMPLE = exampleImpact('premium-subsidy-extension', '25to50k');

/**
 * The feed beside it: three example policies ranked for the same sample
 * household, two gains and a cost. The relevance scores are part of the
 * illustration, like the figures.
 */
export const FEED_EXAMPLES = [
  { impact: POLICY_EXAMPLE, relevance: 94 },
  { impact: exampleImpact('import-tariff', POLICY_EXAMPLE.bracket.key), relevance: 88 },
  { impact: exampleImpact('income-tax-rate-cut', POLICY_EXAMPLE.bracket.key), relevance: 81 },
] as const;

/**
 * The passage path on the policy page: where an example bill stands. The
 * real page shows the record's actual status; it never predicts the rest.
 */
export const PASSAGE_STEPS = ['Introduced', 'Committee', 'Floor', 'Other chamber', 'Signed'] as const;
export const PASSAGE_AT = 1;

/** The AI Policy Guide: one what-if question, answered for two sample households. */
export const GUIDE_EXAMPLE = {
  question: 'What would a minimum wage increase mean for my household?',
  /** The household asking: pays a little more through prices. */
  asker: exampleImpact('minimum-wage-increase', '50to75k'),
  /** The contrast the answer draws: a household with a minimum-wage earner gains. */
  contrast: exampleImpact('minimum-wage-increase', 'under25k'),
};

/** The Ledger (dashboard): every example policy added up for one sample bracket. */
export const LEDGER_ROW = BRACKET_ROWS.find((r) => r.key === '50to75k') ?? BRACKET_ROWS[0];

export interface LedgerLine {
  key: CategoryKey;
  label: string;
  /** Signed $/yr (+ gain, − cost). */
  amount: number;
}

export const LEDGER_LINES: readonly LedgerLine[] = CATEGORIES.map((c) => ({
  key: c.key,
  label: c.label,
  amount: LEDGER_ROW.totals[c.key],
}));

export const LEDGER_NET = LEDGER_LINES.reduce((sum, line) => sum + line.amount, 0);
export const LEDGER_POLICY_COUNT = EXAMPLE_POLICIES.length;

/** The two largest example policies for the Ledger's bracket, for the receipt slip beside it. */
export const LEDGER_TOP = [...EXAMPLE_POLICIES]
  .map((p) => ({ policy: p, amount: p.annualByBracket[LEDGER_ROW.key] }))
  .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  .slice(0, 3);

/**
 * A length on the explorer's shared linear scale, as a percentage (0–100),
 * so a tower or bar is the same size wherever the landing page draws it.
 * Non-zero amounts keep a sliver so they never vanish; zero draws nothing.
 */
export function scalePct(amount: number, scale = CHART_SCALE): number {
  const a = Math.abs(amount);
  if (a < 0.5) return 0;
  return Math.max(4, Math.round((Math.min(a, scale) / scale) * 1000) / 10);
}

/** The share-card designs: a gain for a higher income, a gain for a lower one, and a cost for every bracket. */
export const SHARE_EXAMPLES = [
  exampleImpact('income-tax-rate-cut', '100kPlus'),
  exampleImpact('premium-subsidy-extension', '25to50k'),
  exampleImpact('import-tariff', '50to75k'),
] as const;
