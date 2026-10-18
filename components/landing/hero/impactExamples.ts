/**
 * The example analyses the hero's receipt card rotates through, as plain
 * data with every figure already formatted. Built where the page renders
 * (the server, for the landing page) and handed to the client card, so the
 * card ships no dataset or formatting code of its own.
 *
 * Every figure comes from the explorer's illustrative dataset
 * (lib/explorerData), so the card and the explorer chart quote the same
 * numbers. Balanced on purpose: policy types from different sides, and a
 * gain and a cost for both a lower-income and a higher-income household.
 * The projection rows are cumulative, like the 1/3/5-year view in a real
 * analysis.
 */
import { formatUSD } from '@/lib/format';
import { exampleImpact, formatAnnual, type BracketKey } from '@/lib/explorerData';

export interface ImpactExample {
  policy: string;
  bracket: string;
  /** "+$690/yr" / "−$430/yr". */
  headline: string;
  /** The words that go with the sign. */
  verdict: string;
  direction: 'positive' | 'negative';
  projection: { label: string; amount: string; /** Bar length, % of the largest year. */ width: number }[];
}

const PICKS: [policyId: string, bracket: BracketKey][] = [
  ['premium-subsidy-extension', '25to50k'],
  ['income-tax-rate-cut', '100kPlus'],
  ['import-tariff', '25to50k'],
  ['employer-plan-cap', '100kPlus'],
];

const YEARS = [
  { label: 'Year 1', factor: 1 },
  { label: 'Year 3', factor: 3 },
  { label: 'Year 5', factor: 5 },
];

export function buildImpactExamples(): ImpactExample[] {
  return PICKS.map(([policyId, bracketKey]) => {
    const { policy, bracket, annual } = exampleImpact(policyId, bracketKey);
    const largest = Math.abs(annual * YEARS[YEARS.length - 1].factor) || 1;
    return {
      policy: policy.title,
      bracket: `Sample household · ${bracket.label} income`,
      headline: formatAnnual(annual),
      verdict: annual < 0 ? 'could cost a typical household here' : 'could save a typical household here',
      direction: annual < 0 ? 'negative' : 'positive',
      projection: YEARS.map(({ label, factor }) => ({
        label,
        amount: formatUSD(annual * factor, { signed: true }),
        width: Math.round((Math.abs(annual * factor) / largest) * 100),
      })),
    };
  });
}
