import { UserProfile, type JargonTerm } from '@/types';
import { INCOME_MIDPOINTS, type IncomeRange } from '@/lib/profileOptions';
import { formatUSD } from '@/lib/format';

/**
 * Representative household income for a profile's income bracket. Uses the
 * shared bracket table, and falls back to parsing unfamiliar codes.
 */
export function incomeMidpoint(profile?: UserProfile | null): number {
  const raw = profile?.incomeRange || '';
  if (raw in INCOME_MIDPOINTS) return INCOME_MIDPOINTS[raw as IncomeRange];
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

/**
 * Turn a change measured in percent of income into a concrete dollar example
 * that names its direction in words: 0.4 pts of $75,000 → "about $300 more
 * this year", −0.4 → "about $300 less this year".
 */
export function pctToDollar(pct: number, income: number, period: 'year' | 'month' = 'year'): string {
  const annual = (pct / 100) * income;
  const amount = period === 'month' ? annual / 12 : annual;
  const rounded = Math.abs(amount) >= 100 ? Math.round(amount / 10) * 10 : Math.round(amount);
  if (!Number.isFinite(rounded) || rounded === 0) return 'No change';
  return `about ${formatUSD(Math.abs(rounded))} ${rounded > 0 ? 'more' : 'less'}${period === 'month' ? ' a month' : ' this year'}`;
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
  GDP: 'Gross domestic product: the total value of everything the economy produces. When it grows, the economy is growing.',
  CPI: 'Consumer Price Index: tracks how the prices of everyday things, like groceries and rent, change over time.',
  PCE: 'Personal consumption expenditures price index: another measure of how fast prices rise across what people buy.',
  EPU: 'Economic policy uncertainty: how unsure businesses and households are about future policy, which can delay spending and hiring.',
  'Debt-to-income ratio': 'How much of your paycheck goes to paying off debt.',
  'Disposable income': 'The money you have left after taxes to spend or save.',
  'Balance of payments': 'A record of all the money flowing between a country and the rest of the world: trade, investment and transfers.',
  'Capital expenditure': 'Money companies spend to grow — on buildings, equipment, and hiring.',
  ROA: 'How good a company is at making profit from what it owns.',
  ROE: 'How good a company is at making profit from its owners’ money.',
  'Financial leverage': 'How much debt a company uses to run its business.',
  'Effective tax rate': 'The real share of your income that actually goes to taxes.',
};

/** Other spellings of the same term, so each is listed once ("Capex" = "Capital expenditure"). */
const JARGON_ALIASES: Record<string, string> = {
  'gross domestic product': 'gdp',
  'consumer price index': 'cpi',
  'personal consumption expenditures': 'pce',
  'personal consumption expenditures price index': 'pce',
  'economic policy uncertainty': 'epu',
  capex: 'capital expenditure',
  'capital expenditures': 'capital expenditure',
  'return on assets': 'roa',
  'return on equity': 'roe',
};

function jargonKey(term: string): string {
  // "GDP (gross domestic product)" and "GDP" are the same entry.
  const k = term.trim().toLowerCase().replace(/\s*\(.*\)$/, '').replace(/\s+/g, ' ');
  return JARGON_ALIASES[k] ?? k;
}

/**
 * The Jargon Buster's entries: the analysis's own terms, one per term (case
 * and known aliases ignored). The built-in dictionary is only a fallback for
 * analyses that supply none, so unrelated terms never pad the list.
 */
export function jargonList(terms: JargonTerm[]): JargonTerm[] {
  const merged = new Map<string, JargonTerm>();
  for (const t of terms) {
    if (!t?.term?.trim() || !t.definition?.trim()) continue;
    const key = jargonKey(t.term);
    if (!merged.has(key)) merged.set(key, t);
  }
  if (merged.size > 0) return Array.from(merged.values());
  return Object.entries(BASE_JARGON).map(([term, definition]) => ({ term, definition }));
}
