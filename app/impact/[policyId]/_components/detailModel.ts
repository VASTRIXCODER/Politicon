import { costChange, formatPct, formatSigned, formatUSD, impactSign, impactWords, roundsToZero } from '@/lib/format';
import { EMPLOYMENT_STATUSES, FILING_STATUSES, HOUSING_SITUATIONS, INCOME_RANGES, labelOf } from '@/lib/profileOptions';
import { RADAR_LABELS, TIMELINE_LABELS } from '@/lib/simpleMode';
import { flowTotals, flowsFromAnalysis, type TransmissionTone } from '@/lib/transmission';
import type { FullAnalysis, ImpactDirection, Policy } from '@/types';

/*
 * The impact detail page's model: pure, React-free helpers that turn a
 * stored analysis (and the profile it was based on) into what the page
 * prints. Everything here reads real fields only; nothing is estimated on
 * the page itself. Unit tested in tests/impactDetail.test.ts.
 */

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export const TABS = ['overview', 'breakdown', 'timeline', 'economic', 'deepdive', 'action'] as const;
export type DetailTab = (typeof TABS)[number];
export const TAB_LABELS: Record<DetailTab, string> = {
  overview: 'Overview',
  breakdown: 'Financial breakdown',
  timeline: 'Timeline',
  economic: 'Economic context',
  deepdive: 'Deep dive',
  action: 'Things to consider',
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

// Dollar fields are signed from the user's point of view: + saves them money, − costs them.
export const money = (n: number, suffix = '') => formatUSD(n, { signed: true, suffix });
export const signedUSD = (n: number) => formatUSD(n, { signed: true });
export const pct = (n: number) => formatPct(n, { digits: 2 });
/** A label in sentence case, as the app writes labels: "real_estate" → "Real estate" (the rest is left as given). */
export const sentenceCase = (s: string) => {
  const t = s.replace(/[-_]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** One labelled figure (StatRow's props). `cue` spells out "saves you" / "costs you" next to a signed amount. */
export interface StatRowData {
  label: string;
  value: string;
  /** Teal (true) or amber (false); undefined keeps the figure in ink. */
  positive?: boolean;
  cue?: number;
  kind?: 'budget' | 'income';
}

/** A row for something the user pays (tax, rent, premiums): "$50 lower" / "$50 higher" rather than a user-side sign next to a cost name. */
export const costRow = (label: string, n: number, suffix = ''): StatRowData =>
  ({ label, value: costChange(n, suffix), positive: impactSign(n) === 'neutral' ? undefined : n > 0 });

/** Look up a Simple Mode "What this means for you" summary for a page section. */
export function simpleSummary(a: FullAnalysis, section: string): string | undefined {
  return a.simple?.sectionSummaries?.find((s) => s.section === section)?.text;
}

/** The net figure's sign, colour class and words, so direction never rests on colour alone. */
export function netReadout(net: number) {
  const sign = impactSign(net);
  return {
    sign,
    tone: sign === 'gain' ? 'text-gain' : sign === 'loss' ? 'text-loss' : 'text-muted',
    words: impactWords(net),
    yearly: formatUSD(net, { signed: true, suffix: '/yr' }),
  };
}

// ---------------------------------------------------------------------------
// The profile an analysis was based on
// ---------------------------------------------------------------------------

/** The profile fields an analysis was based on (stored with it as profile_snapshot). */
export interface ProfileSnapshot {
  state?: string;
  incomeRange?: string;
  filingStatus?: string;
  housingSituation?: string;
  employmentStatus?: string;
  dependentsCount?: number | null;
  debtTypes?: string[] | null;
}

/** Minimal policy metadata for normalizing a stored analysis. */
export function policyFromAnalysis(policyId: string, a: Partial<FullAnalysis>): Policy {
  return {
    id: policyId,
    title: a.policyTitle || policyId,
    summary: a.plainEnglishSummary || '',
    description: a.plainEnglishSummary || '',
    category: a.category || 'taxes',
    status: 'proposed',
    date: '',
    source: '',
    sourceUrl: '',
    governingBody: a.billNumber || '',
    region: 'Federal',
    confidenceLevel: 'medium',
    impacts: [],
    assumptions: [],
    tags: [],
  };
}

export function snapshotFromRow(row: Record<string, unknown>): ProfileSnapshot {
  return {
    state: row.state as string,
    incomeRange: row.income_range as string,
    filingStatus: row.filing_status as string,
    housingSituation: row.housing_situation as string,
    employmentStatus: row.employment_status as string,
    dependentsCount: (row.dependents_count as number | null) ?? null,
    debtTypes: Array.isArray(row.debt_types) ? (row.debt_types as string[]) : null,
  };
}

/** "Driven by your profile": the answers the estimate used, in words. */
export function profileChips(profile: ProfileSnapshot | null): string[] {
  if (!profile) return [];
  const deps = profile.dependentsCount;
  return [
    profile.incomeRange && labelOf(INCOME_RANGES, profile.incomeRange),
    profile.state,
    profile.filingStatus && labelOf(FILING_STATUSES, profile.filingStatus),
    profile.housingSituation && labelOf(HOUSING_SITUATIONS, profile.housingSituation),
    profile.employmentStatus && labelOf(EMPLOYMENT_STATUSES, profile.employmentStatus),
    deps ? `${deps} dependent${deps === 1 ? '' : 's'}` : undefined,
  ].filter(Boolean) as string[];
}

// ---------------------------------------------------------------------------
// The official record
// ---------------------------------------------------------------------------

const SOURCE_LABEL: Record<string, string> = {
  'congress.gov': 'Congress.gov',
  openstates: 'Open States',
};

/**
 * The hero's record line. Verified only when the analysis was grounded in an
 * official record (Congress.gov / Open States): only then does the page show
 * the archive-gold seal, the source and the chamber the bill started in.
 */
export function recordFacts(a: Pick<FullAnalysis, 'record' | 'billNumber'>, origin: string | null) {
  const record = a.record;
  const verified = !!record?.verified;
  const source = verified ? SOURCE_LABEL[record!.source] || record!.source : null;
  const billNumber = (verified && record!.billNumber) || a.billNumber || null;
  const region = record?.region || null;
  return {
    verified,
    source,
    billNumber,
    /** "Congress.gov · Federal · House" (verified) or the region alone. */
    line: [source, region, verified && origin ? origin : null].filter(Boolean).join(' · '),
  };
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

/** The milestones beside the 1/3/5-year bars: month 1, month 6, then the projections. */
export function milestones(a: Pick<FullAnalysis, 'timeline'>, simple: boolean) {
  const tl = simple ? TIMELINE_LABELS.simple : TIMELINE_LABELS.expert;
  return [
    { label: simple ? 'After the first month' : 'Month 1', value: a.timeline.monthly[0]?.impact ?? 0 },
    { label: simple ? 'Halfway through year one' : 'Month 6', value: a.timeline.monthly[5]?.impact ?? 0 },
    { label: tl.year1, value: a.timeline.year1 },
    { label: tl.year3, value: a.timeline.year3 },
    { label: tl.year5, value: a.timeline.year5 },
  ];
}

// ---------------------------------------------------------------------------
// Economic context (macro → corporate → personal)
// ---------------------------------------------------------------------------

export const CAPEX_LABEL: Record<string, { text: string; dir: ImpactDirection }> = {
  expanding: { text: 'Investing & hiring more', dir: 'positive' },
  neutral: { text: 'Holding steady', dir: 'neutral' },
  pulling_back: { text: 'Pulling back', dir: 'negative' },
};
export const LEVERAGE_LABEL: Record<string, { text: string; dir: ImpactDirection }> = {
  conservative: { text: 'Becoming more cautious', dir: 'positive' },
  neutral: { text: 'Unchanged', dir: 'neutral' },
  more_debt: { text: 'Taking on more debt', dir: 'negative' },
};
export const PROFIT_LABEL: Record<string, { text: string; dir: ImpactDirection }> = {
  improving: { text: 'Improving', dir: 'positive' },
  neutral: { text: 'Flat', dir: 'neutral' },
  declining: { text: 'Declining', dir: 'negative' },
};

/** The smallest of 1, 2, 2.5, 5 × 10ⁿ that is ≥ x (0 for nothing): a round top for a linear bar. */
function roundTop(x: number): number {
  if (!(x > 0)) return 0;
  const p = 10 ** Math.floor(Math.log10(x));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= x * (1 - 1e-9)) return m * p;
  return 10 * p;
}

const pctLabel = (n: number) => `${Number(n.toFixed(2))}%`;
const signOf = (n: number): ImpactDirection => (n > 0 ? 'positive' : n < 0 ? 'negative' : 'neutral');

/**
 * One tier's bar on its own documented linear scale: from 0 to a round top
 * (at least `floor`, so a small figure draws a short bar, never a full one),
 * as a share of that top (0 … 100). A figure of 0 draws no bar at all.
 */
function tierBar(value: number, floor: number, unit: string) {
  const v = Number.isFinite(value) ? Math.abs(value) : 0;
  if (v < 1e-9) return { magnitude: 0, scale: undefined };
  const top = Math.max(floor, roundTop(v));
  return { magnitude: Math.min(100, (v / top) * 100), scale: `Bar: 0 to ${pctLabel(top)} ${unit}, linear` };
}

/**
 * The transmission waterfall's three tiers, macro → corporate → personal.
 * Each bar measures one figure on its own linear scale from 0, named in
 * words (`scale`): the change in GDP (0 to at least 1% of GDP), the change
 * in an equity portfolio (0 to at least 10%), and the change in disposable
 * income as a share of the household's income (0 to at least 5% of it).
 * A figure of 0 draws no bar and reads as no change (never teal); the bar's
 * colour is its own figure's sign. The figures themselves are printed beside it.
 */
export function waterfallLevels(a: Pick<FullAnalysis, 'macro' | 'corporate' | 'personal'>, simple: boolean, income: number) {
  const { macro, corporate, personal } = a;
  const share = income > 0 ? (personal.disposableIncomeAnnual / income) * 100 : 0;
  const macroBar = tierBar(macro.gdpImpactPct, 1, 'of GDP');
  const equityBar = tierBar(corporate.equityPortfolioImpactPct, 10, 'equity change');
  const personalBar = income > 0 ? tierBar(share, 5, 'of your income') : { magnitude: 0, scale: undefined };
  return [
    {
      label: simple ? 'The whole economy' : 'Macro — Economy',
      sublabel: simple
        ? `Growth ${macro.gdpImpactPct > 0 ? 'up' : macro.gdpImpactPct < 0 ? 'down' : 'unchanged'} · Prices ${macro.inflationImpactPct > 0 ? 'rise' : macro.inflationImpactPct < 0 ? 'fall' : 'unchanged'}`
        : `GDP ${pct(macro.gdpImpactPct)} · Inflation ${pct(macro.inflationImpactPct)}`,
      ...macroBar,
      barDirection: signOf(macro.gdpImpactPct),
      direction: signOf(macro.gdpImpactPct),
      detail: macro.gdpExplanation || macro.inflationExplanation || undefined,
    },
    {
      label: simple ? 'Companies you might work for' : `Corporate — ${sentenceCase(corporate.sector)}`,
      sublabel: simple
        ? CAPEX_LABEL[corporate.capexDirection].text
        : `Equity ${corporate.equityImpactRange || pct(corporate.equityPortfolioImpactPct)} · ${CAPEX_LABEL[corporate.capexDirection].text}`,
      ...equityBar,
      barDirection: signOf(corporate.equityPortfolioImpactPct),
      direction: CAPEX_LABEL[corporate.capexDirection].dir,
      detail: corporate.capexExplanation || corporate.leverageExplanation || undefined,
    },
    {
      label: simple ? 'Your own wallet' : 'Personal — Your wallet',
      sublabel: `${money(personal.disposableIncomeMonthly)}/mo · ${money(personal.disposableIncomeAnnual)}/yr`,
      ...personalBar,
      barDirection: signOf(Math.round(personal.disposableIncomeAnnual)),
      direction: signOf(Math.round(personal.disposableIncomeAnnual)),
      detail: personal.savingsRateExplanation || personal.precautionaryExplanation || undefined,
    },
  ];
}

/** The vulnerability radar's six axes (0–100, higher = more pressure), labelled for the reading mode. */
export function radarData(a: Pick<FullAnalysis, 'vulnerability'>, simple: boolean) {
  const v = a.vulnerability;
  const labels = simple ? RADAR_LABELS.simple : RADAR_LABELS.expert;
  return [
    { dimension: labels.incomeStability, score: v.incomeStability },
    { dimension: labels.housingSecurity, score: v.housingSecurity },
    { dimension: labels.employmentRisk, score: v.employmentRisk },
    { dimension: labels.costOfLivingPressure, score: v.costOfLivingPressure },
    { dimension: labels.investmentExposure, score: v.investmentExposure },
    { dimension: labels.debtBurden, score: v.debtBurden },
  ];
}

// ---------------------------------------------------------------------------
// Deep dive
// ---------------------------------------------------------------------------

export const DEEP_DIVE_SECTIONS = ['housing', 'employment', 'healthcare', 'retirement', 'education', 'tax', 'ripple'] as const;
export type DeepDiveSection = (typeof DEEP_DIVE_SECTIONS)[number];

/**
 * Whether a change is good for the user (teal) or not (amber), given which
 * way is better; undefined at zero, so a figure that doesn't move stays in
 * ink rather than reading as a gain.
 */
export function better(n: number, way: 'up' | 'down' = 'up'): boolean | undefined {
  if (!Number.isFinite(n) || Math.abs(n) < 1e-9) return undefined;
  return way === 'up' ? n > 0 : n < 0;
}

/** Places a figure is shown to: whole dollars, percents to two places, an index or years to one. */
const PLACES = { usd: 0, pct: 2, plain: 1 } as const;

/**
 * A signed change in the deep dive, coloured by which way is better; or
 * "No change" in ink when it shows as zero, as costRow says it: zero has no
 * direction, so it never takes a sign (no "+0", "0%" or "$0" beside it).
 * `colour: false` keeps a moving figure in ink too (no agreed better way).
 */
export function changeRow(
  label: string,
  n: number,
  unit: keyof typeof PLACES,
  { way = 'up', colour = true, suffix = '' }: { way?: 'up' | 'down'; colour?: boolean; suffix?: string } = {}
): StatRowData {
  if (roundsToZero(n, PLACES[unit])) return { label, value: 'No change' };
  const value = unit === 'usd' ? money(n, suffix) : unit === 'pct' ? pct(n) : formatSigned(n, { suffix });
  return { label, value, positive: colour ? better(n, way) : undefined };
}

/** An amount of money coming in (pay, benefits), signed, with "you gain" / "you lose" spelled out. */
const incomeRow = (label: string, n: number, suffix = ''): StatRowData => ({ ...changeRow(label, n, 'usd', { suffix }), cue: n, kind: 'income' });

/** "+1.5 yrs", "−1 yr". */
const years = (n: number) => (roundsToZero(Math.abs(n) - 1, PLACES.plain) ? ' yr' : ' yrs');

/** The figures under one deep-dive heading. */
export function deepDiveRows(a: FullAnalysis, key: DeepDiveSection | string): StatRowData[] {
  switch (key) {
    case 'housing': return [
      costRow('Housing costs, per month', a.housing.monthlyHousingEffect, '/mo'),
      changeRow('Property value change', a.housing.propertyValueChangePct, 'pct'),
      changeRow('Affordability index change', a.housing.affordabilityIndexChange, 'plain', { colour: false }),
      ...(a.housing.firstTimeBuyerImpact ? [{ label: 'First-time buyer', value: a.housing.firstTimeBuyerImpact }] : []),
    ];
    case 'employment': return [
      { label: 'Job security risk', value: `${a.employment.jobSecurityRisk}/100` },
      changeRow('Wage growth projection', a.employment.wageGrowthPct, 'pct'),
      incomeRow('Job benefits', a.employment.benefitChangeValue),
      ...(a.employment.industryEffects ? [{ label: 'Industry effects', value: a.employment.industryEffects }] : []),
    ];
    case 'healthcare': return [
      costRow('Health premiums, per month', a.healthcare.monthlyPremiumChange, '/mo'),
      costRow('Out-of-pocket maximum', a.healthcare.outOfPocketMaxChange),
      costRow('Prescription costs', a.healthcare.prescriptionCostChange),
      ...(a.healthcare.coverageChange ? [{ label: 'Coverage', value: a.healthcare.coverageChange }] : []),
    ];
    case 'retirement': return [
      changeRow('401(k) / IRA contribution limit', a.retirement.contributionLimitChange, 'usd'),
      incomeRow('Social Security benefits', a.retirement.socialSecurityChange),
      changeRow('Retirement timeline', a.retirement.timelineImpactYears, 'plain', { way: 'down', suffix: years(a.retirement.timelineImpactYears) }),
    ];
    case 'education': return [
      costRow('Student loan payments, per month', a.education.studentLoanPaymentChange, '/mo'),
      incomeRow('Tuition assistance', a.education.tuitionAssistanceChange),
      costRow('Child education costs', a.education.childEducationCostChange),
    ];
    case 'tax': return [
      costRow('Federal income tax', a.tax.federalLiabilityChange),
      costRow('State income tax', a.tax.stateLiabilityChange),
      { label: 'Effective rate', value: `${a.tax.effectiveRateBefore}% → ${a.tax.effectiveRateAfter}%`, positive: better(a.tax.effectiveRateAfter - a.tax.effectiveRateBefore, 'down') },
      ...(a.tax.bracketChange ? [{ label: 'Bracket', value: a.tax.bracketChange }] : []),
      ...(a.tax.deductionChanges ? [{ label: 'Deductions', value: a.tax.deductionChanges }] : []),
      ...(a.tax.creditChanges ? [{ label: 'Credits', value: a.tax.creditChanges }] : []),
    ];
    case 'ripple': return [
      changeRow('Inflation impact', a.ripple.inflationImpactPct, 'pct', { way: 'down' }),
      costRow('Cost of living, per year', a.ripple.costOfLivingChange, '/yr'),
      incomeRow('Purchasing power, per year', a.ripple.purchasingPowerChange, '/yr'),
      ...(a.ripple.interestRateEffect ? [{ label: 'Interest rates on debt', value: a.ripple.interestRateEffect }] : []),
    ];
    default: return [];
  }
}

/**
 * The yearly figure each deep-dive area opens with (its ledger glyph): the
 * analysis's own category impact for the area (categoryImpacts, signed
 * $/yr from the user's side), and for the ripple effects the yearly change
 * in the cost of living the net is built with (ripple.costOfLivingChange).
 * Nothing is estimated here: an area the analysis put no amount on reads 0
 * ("No change").
 */
export function deepDiveHeadline(a: FullAnalysis, key: DeepDiveSection | string): number {
  const ci = a.categoryImpacts;
  switch (key) {
    case 'housing': return ci.housing;
    case 'employment': return ci.employment;
    case 'healthcare': return ci.healthcare;
    case 'retirement': return ci.retirement;
    case 'education': return ci.education;
    case 'tax': return ci.taxes;
    case 'ripple': return a.ripple.costOfLivingChange;
    default: return 0;
  }
}

// ---------------------------------------------------------------------------
// Financial breakdown: the yearly ledger and the tax rate
// ---------------------------------------------------------------------------

export interface LedgerLine {
  id: string;
  label: string;
  /** Signed whole dollars a year (+ saves the user money). */
  value: number;
  tone: TransmissionTone;
  /** |value| as a share of the largest line (the bar's length, one linear scale), 0 … 1. */
  bar: number;
  /** |value| as a share of all the money that moves (gains and costs together), 0 … 1. */
  share: number;
  /** The net minus the categories ("Other effects"): arithmetic on real fields. */
  rest: boolean;
}

/**
 * The Financial Breakdown's ledger: the analysis's yearly flows (the same
 * lines the Overview's flow draws, lib/transmission flowsFromAnalysis, so
 * they add up to the net), largest first, each with a bar on one linear
 * scale (the largest line is the full length) and its share of the gross:
 * every dollar that moves, gains and costs counted together. The subtotals
 * and the net under them. No amounts → no lines (the tab's empty state).
 */
export function yearlyLedger(a: Pick<FullAnalysis, 'netAnnualImpact' | 'categoryImpacts'>) {
  const flows = flowsFromAnalysis(a);
  const totals = flowTotals(flows);
  const largest = Math.max(0, ...flows.map((f) => Math.abs(f.value)));
  const lines: LedgerLine[] = flows
    .map((f) => ({
      id: f.id,
      label: f.label,
      value: f.value,
      tone: f.tone,
      bar: largest ? Math.abs(f.value) / largest : 0,
      share: totals.gross ? Math.abs(f.value) / totals.gross : 0,
      rest: !!f.rest,
    }))
    .sort((x, y) => Math.abs(y.value) - Math.abs(x.value) || Number(x.rest) - Number(y.rest));
  return { lines, largest, ...totals };
}

/** A share as the ledger prints it: "64%", "<1%" for a sliver, never a rounded-away 0%. */
export function shareText(share: number): string {
  if (!(share > 0)) return '0%';
  const p = Math.round(share * 100);
  return p < 1 ? '<1%' : `${p}%`;
}

/**
 * The effective tax rate before and after, on one linear track from 0% to
 * a round top (the next multiple of 5 above both, at least 5%), with the
 * change in points and which way it goes for the user (a lower rate is in
 * their favour). Both rates 0 (what a missing estimate becomes) → null, so
 * the page says the analysis didn't estimate it rather than drawing 0%.
 */
export function taxRatePlate(a: Pick<FullAnalysis, 'tax'>) {
  const before = Number.isFinite(a.tax.effectiveRateBefore) ? a.tax.effectiveRateBefore : 0;
  const after = Number.isFinite(a.tax.effectiveRateAfter) ? a.tax.effectiveRateAfter : 0;
  if (before === 0 && after === 0) return null;
  const top = Math.max(5, Math.ceil(Math.max(before, after) / 5 - 1e-9) * 5);
  const change = Math.round((after - before) * 100) / 100;
  const dir = better(change, 'down');
  return {
    before,
    after,
    top,
    change,
    /** 0 … 1 along the track. */
    at: { before: Math.max(0, before) / top, after: Math.max(0, after) / top },
    tone: (dir === undefined ? 'neutral' : dir ? 'gain' : 'loss') as TransmissionTone,
    words: change === 0 ? 'No change' : `${Math.abs(change)} ${Math.abs(change) === 1 ? 'point' : 'points'} ${change < 0 ? 'lower' : 'higher'}`,
    cue: dir === undefined ? 'no change' : dir ? 'saves you' : 'costs you',
  };
}

// ---------------------------------------------------------------------------
// Things to consider
// ---------------------------------------------------------------------------

/** A suggestion's priority, in words and in the stamp's ink (violet family: never gold, caution or danger). */
export const PRIORITY_STAMP: Record<'high' | 'medium' | 'low', { label: string; className: string }> = {
  high: { label: 'High', className: 'border-primary-300 text-primary-300' },
  medium: { label: 'Medium', className: 'border-accent/70 text-accent' },
  low: { label: 'Low', className: 'border-dashed border-fg/30 text-muted' },
};

/** Official places to follow the bill and check eligibility (all https, all government or the record itself). */
export function resourceLinks(category: string, billNumber: string) {
  const links: { label: string; url: string }[] = [
    { label: billNumber ? `Track ${billNumber} on Congress.gov` : 'Search Congress.gov', url: billNumber ? `https://www.congress.gov/search?q=${encodeURIComponent(billNumber)}` : 'https://www.congress.gov' },
  ];
  const c = category.toLowerCase();
  if (c.includes('tax')) links.push({ label: 'IRS — Tax updates', url: 'https://www.irs.gov/newsroom' });
  if (c.includes('health')) links.push({ label: 'HealthCare.gov', url: 'https://www.healthcare.gov' });
  if (c.includes('hous')) links.push({ label: 'HUD — Housing programs', url: 'https://www.hud.gov' });
  if (c.includes('retire')) links.push({ label: 'SSA — Benefits', url: 'https://www.ssa.gov' });
  if (c.includes('educat')) links.push({ label: 'Federal Student Aid', url: 'https://studentaid.gov' });
  links.push({ label: 'Benefits.gov — Eligibility', url: 'https://www.benefits.gov' });
  return links;
}
