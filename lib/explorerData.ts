import { formatUSD, impactSign, type ImpactSign } from '@/lib/format';

/**
 * The one ILLUSTRATIVE dataset behind the public explorer. The landing chart
 * ("Policy impact by income bracket"), the landing ticker and /explorer all
 * read it, so the three always show the same numbers.
 *
 * Nothing here is a real bill or a real analysis. The policies are
 * hypothetical policy types and the amounts are made-up round numbers that
 * show how one policy can help some households and cost others. Every
 * surface that renders them must also show ILLUSTRATIVE_NOTE.
 *
 * Sign convention (the same as lib/format.ts): dollars per year from the
 * household's side, + when the household gains (lower taxes, a benefit,
 * higher pay), − when it pays more (taxes, prices, premiums). Each amount is
 * for a typical household in the bracket, averaged over the households the
 * policy reaches and the ones it doesn't.
 */

export const ILLUSTRATIVE_NOTE =
  'Illustrative examples, not real analyses — sign up to see estimates for your situation.';

/** The unit every amount in this file is in, as printed next to the charts. */
export const UNIT_LABEL = '$/yr, illustrative';

export const BRACKETS = [
  { key: 'under25k', label: 'Under $25k' },
  { key: '25to50k', label: '$25k–$50k' },
  { key: '50to75k', label: '$50k–$75k' },
  { key: '75to100k', label: '$75k–$100k' },
  { key: '100kPlus', label: '$100k+' },
] as const;

export type BracketKey = (typeof BRACKETS)[number]['key'];
export type Bracket = (typeof BRACKETS)[number];

export const CATEGORIES = [
  { key: 'taxes', label: 'Taxes' },
  { key: 'healthcare', label: 'Healthcare' },
  { key: 'housing', label: 'Housing' },
  { key: 'employment', label: 'Employment' },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]['key'];
export type Category = (typeof CATEGORIES)[number];

export interface ExamplePolicy {
  id: string;
  /** Short name, also used in the landing ticker. Never a real bill's name. */
  title: string;
  category: CategoryKey;
  /** Which level of government a policy like this would come from. */
  scope: 'Federal' | 'State';
  /** One sentence, starting "Hypothetical:". */
  summary: string;
  /** Signed $/yr for a typical household in each bracket (+ gain, − cost). */
  annualByBracket: Record<BracketKey, number>;
}

const byBracket = (
  under25k: number,
  b25to50k: number,
  b50to75k: number,
  b75to100k: number,
  b100kPlus: number,
): Record<BracketKey, number> => ({
  under25k,
  '25to50k': b25to50k,
  '50to75k': b50to75k,
  '75to100k': b75to100k,
  '100kPlus': b100kPlus,
});

/**
 * Chosen to be even-handed: the policy types come from across the political
 * spectrum, every bracket gains in some categories and pays in others, and no
 * summary quotes a rate, threshold or amount from a real platform.
 * tests/explorerData.test.ts checks the balance.
 */
export const EXAMPLE_POLICIES: readonly ExamplePolicy[] = [
  {
    id: 'income-tax-rate-cut',
    title: 'Income tax rate cut',
    category: 'taxes',
    scope: 'Federal',
    summary: 'Hypothetical: lowers every federal income tax rate by one percentage point.',
    annualByBracket: byBracket(20, 150, 320, 520, 1200),
  },
  {
    id: 'import-tariff',
    title: 'Tariff on imported goods',
    category: 'taxes',
    scope: 'Federal',
    summary: 'Hypothetical: a new tax on most imported consumer goods, partly passed on to shoppers as higher prices.',
    annualByBracket: byBracket(-310, -430, -540, -640, -860),
  },
  {
    id: 'premium-subsidy-extension',
    title: 'Premium subsidy extension',
    category: 'healthcare',
    scope: 'Federal',
    summary: 'Hypothetical: keeps larger premium tax credits for people who buy their own health insurance.',
    annualByBracket: byBracket(420, 690, 540, 310, 90),
  },
  {
    id: 'employer-plan-cap',
    title: 'Cap on tax-free health benefits',
    category: 'healthcare',
    scope: 'Federal',
    summary: 'Hypothetical: taxes the part of employer-paid health premiums above a set limit.',
    annualByBracket: byBracket(0, -40, -120, -210, -380),
  },
  {
    id: 'salt-cap-increase',
    title: 'Higher state and local tax deduction cap',
    category: 'housing',
    scope: 'Federal',
    summary: 'Hypothetical: raises the limit on property and other state and local taxes that itemizers can deduct.',
    annualByBracket: byBracket(0, 0, 20, 90, 610),
  },
  {
    id: 'first-time-buyer-credit',
    title: 'First-time homebuyer credit',
    category: 'housing',
    scope: 'State',
    summary: 'Hypothetical: a one-time credit for first-time buyers, spread here over all households in a bracket.',
    annualByBracket: byBracket(40, 150, 220, 180, 70),
  },
  {
    id: 'minimum-wage-increase',
    title: 'Minimum wage increase',
    category: 'employment',
    scope: 'State',
    summary: 'Hypothetical: raises the state minimum wage in steps; higher pay for some, slightly higher prices for others.',
    annualByBracket: byBracket(1150, 420, -60, -90, -120),
  },
  {
    id: 'food-aid-work-requirements',
    title: 'Work requirements for food aid',
    category: 'employment',
    scope: 'Federal',
    summary: 'Hypothetical: more adults who get food assistance must work, train or volunteer part-time to keep it.',
    annualByBracket: byBracket(-380, -120, -20, 0, 0),
  },
];

/** Looks up an example by id (for the landing cards that quote one bracket of it). */
export function examplePolicy(id: string): ExamplePolicy {
  const policy = EXAMPLE_POLICIES.find((p) => p.id === id);
  if (!policy) throw new Error(`Unknown example policy: ${id}`);
  return policy;
}

/** A bracket's display data by key. */
export function bracketByKey(key: BracketKey): Bracket {
  return BRACKETS.find((b) => b.key === key) ?? BRACKETS[0];
}

/**
 * One example policy seen from one bracket: what the landing page's sample
 * cards (hero card, feature mockups, share-card designs) quote, so their
 * figures always match the explorer chart.
 */
export interface ExampleImpact {
  policy: ExamplePolicy;
  bracket: Bracket;
  /** Signed $/yr for a typical household in the bracket. */
  annual: number;
}

export function exampleImpact(policyId: string, bracket: BracketKey): ExampleImpact {
  const policy = examplePolicy(policyId);
  return { policy, bracket: bracketByKey(bracket), annual: policy.annualByBracket[bracket] };
}

/** "8 example policies across 4 categories": the count the copy must quote. */
export const EXAMPLE_COUNT_LABEL = `${EXAMPLE_POLICIES.length} example policies across ${CATEGORIES.length} categories`;

/** The bracket's net amount for one category: the sum of its example policies. */
export function categoryTotal(category: CategoryKey, bracket: BracketKey): number {
  return EXAMPLE_POLICIES.filter((p) => p.category === category).reduce((sum, p) => sum + p.annualByBracket[bracket], 0);
}

export interface BracketRow {
  key: BracketKey;
  label: string;
  totals: Record<CategoryKey, number>;
}

/** One row per bracket with each category's net amount: what the charts draw. */
export const BRACKET_ROWS: readonly BracketRow[] = BRACKETS.map((b) => ({
  key: b.key,
  label: b.label,
  totals: Object.fromEntries(CATEGORIES.map((c) => [c.key, categoryTotal(c.key, b.key)])) as Record<CategoryKey, number>,
}));

/**
 * The chart scale: the largest |amount| in any cell. Shared by every view
 * (and kept when filtering), so a bar is the same length wherever it's drawn.
 */
export const CHART_SCALE = Math.max(1, ...BRACKET_ROWS.flatMap((r) => Object.values(r.totals).map(Math.abs)));

/** The bracket a policy affects most, by size (the first one on a tie). */
export function largestEffect(policy: ExamplePolicy): { bracket: Bracket; amount: number } {
  let best: { bracket: Bracket; amount: number } = { bracket: BRACKETS[0], amount: policy.annualByBracket[BRACKETS[0].key] };
  for (const bracket of BRACKETS) {
    const amount = policy.annualByBracket[bracket.key];
    if (Math.abs(amount) > Math.abs(best.amount)) best = { bracket, amount };
  }
  return best;
}

/** "+$1,150/yr", "−$620/yr", "$0/yr". */
export function formatAnnual(amount: number): string {
  return formatUSD(amount, { signed: true, suffix: '/yr' });
}

/**
 * A diverging bar around a zero axis in the middle of its track: `width` is a
 * percentage of the whole track (0–50), drawn right of the axis for a gain
 * and left of it for a cost. Non-zero amounts get a sliver so they never
 * vanish; zero draws nothing.
 */
export function divergingBar(amount: number, scale = CHART_SCALE): { sign: ImpactSign; width: number } {
  const sign = impactSign(amount);
  if (sign === 'neutral') return { sign, width: 0 };
  const width = (Math.min(Math.abs(amount), scale) / scale) * 50;
  return { sign, width: Math.max(1.5, Math.round(width * 10) / 10) };
}
