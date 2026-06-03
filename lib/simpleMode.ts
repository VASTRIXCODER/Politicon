import { UserProfile } from '@/types';

/**
 * Estimate a dollar income midpoint from a profile's incomeRange string.
 * Handles formats like "75k_100k", "100k_150k", "under_30k", "over_250k".
 */
export function incomeMidpoint(profile?: UserProfile | null): number {
  const raw = profile?.incomeRange || '';
  const nums = raw.match(/\d+/g)?.map((n) => parseInt(n, 10) * (/k/i.test(raw) ? 1000 : 1)) || [];
  if (nums.length >= 2) return Math.round((nums[0] + nums[1]) / 2);
  if (nums.length === 1) {
    // "under_X" → ~75% of X; "over_X" → ~1.3× X
    if (/under|below|less/i.test(raw)) return Math.round(nums[0] * 0.75);
    if (/over|above|more|plus|\+/i.test(raw)) return Math.round(nums[0] * 1.3);
    return nums[0];
  }
  return 75000; // sensible default
}

/** Turn a percentage of income into a concrete dollar example string. */
export function pctToDollar(pct: number, income: number, period: 'year' | 'month' = 'year'): string {
  const annual = (pct / 100) * income;
  const amount = period === 'month' ? annual / 12 : annual;
  const rounded = Math.abs(amount) >= 100 ? Math.round(amount / 10) * 10 : Math.round(amount);
  const sign = rounded >= 0 ? 'about $' : 'about -$';
  return `${sign}${Math.abs(rounded).toLocaleString()}${period === 'month' ? '/mo' : ' this year'}`;
}

/** Radar dimension labels — expert (technical) vs simple (everyday) wording. */
export const RADAR_LABELS = {
  expert: {
    incomeStability: 'Income Stability',
    housingSecurity: 'Housing Security',
    employmentRisk: 'Employment Risk',
    costOfLivingPressure: 'Cost of Living Pressure',
    investmentExposure: 'Investment Exposure',
    debtBurden: 'Debt Burden',
  },
  simple: {
    incomeStability: 'Will my paycheck be safe',
    housingSecurity: 'Will rent or mortgage get harder',
    employmentRisk: 'Could I lose my job',
    costOfLivingPressure: 'Will groceries & bills cost more',
    investmentExposure: 'Will my savings or stocks be hit',
    debtBurden: 'Will my loans get harder to pay',
  },
} as const;

/** Timeline labels — expert vs simple milestone wording. */
export const TIMELINE_LABELS = {
  expert: { year1: 'Year 1', year3: 'Year 3', year5: 'Year 5' },
  simple: { year1: 'By this time next year', year3: 'Three years from now', year5: 'Five years from now' },
} as const;

/** One-line plain-English descriptions of each chart, shown in Simple Mode. */
export const CHART_DESCRIPTIONS: Record<string, string> = {
  category: 'How much money each part of your budget gains or loses each year.',
  donut: 'Which parts of your budget are affected the most.',
  timeline: 'How the running total adds up month by month over a year.',
  projection: 'How the impact stacks up after 1, 3, and 5 years.',
  beforeAfter: 'Your numbers before this policy vs. after it.',
  waterfall: 'How this policy flows from the whole economy down to your own wallet.',
  radar: 'The areas of your money life this policy puts the most pressure on.',
  heatmap: 'Which everyday spending categories get cheaper (green) or pricier (red).',
};

/** Built-in fallback definitions for common terms (merged with model-supplied jargon). */
export const BASE_JARGON: Record<string, string> = {
  GDP: 'How healthy the overall economy is — the total value of everything a country makes.',
  CPI: 'How fast everyday prices are rising, like at the grocery store.',
  PCE: 'Another measure of how fast prices are rising across what people buy.',
  EPU: 'How unpredictable this policy makes the economy.',
  'Economic Policy Uncertainty': 'How unpredictable this policy makes the economy.',
  'Debt-to-income ratio': 'How much of your paycheck goes to paying off debt.',
  'Disposable income': 'The money you have left after taxes to spend or save.',
  'Balance of payments': 'Whether the country buys more from abroad than it sells.',
  'Capital expenditure': 'Money companies spend to grow — on buildings, equipment, and hiring.',
  Capex: 'Money companies spend to grow — on buildings, equipment, and hiring.',
  ROA: 'How good a company is at making profit from what it owns.',
  ROE: 'How good a company is at making profit from its owners’ money.',
  'Financial leverage': 'How much debt a company uses to run its business.',
  'Effective tax rate': 'The real share of your income that actually goes to taxes.',
};
