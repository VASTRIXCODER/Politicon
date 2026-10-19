import { costChange, formatPct, formatUSD, impactSign, impactWords } from '@/lib/format';
import { EMPLOYMENT_STATUSES, FILING_STATUSES, HOUSING_SITUATIONS, INCOME_RANGES, labelOf } from '@/lib/profileOptions';
import { RADAR_LABELS, TIMELINE_LABELS } from '@/lib/simpleMode';
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
  breakdown: 'Financial Breakdown',
  timeline: 'Timeline',
  economic: 'Economic Context',
  deepdive: 'Deep Dive',
  action: 'Things to Consider',
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

// Dollar fields are signed from the user's point of view: + saves them money, − costs them.
export const money = (n: number, suffix = '') => formatUSD(n, { signed: true, suffix });
export const signedUSD = (n: number) => formatUSD(n, { signed: true });
export const pct = (n: number) => formatPct(n, { digits: 2 });
export const titleCase = (s: string) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

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

/** The transmission waterfall's three tiers, magnitudes on a shared 0–100 scale (the values are printed beside them). */
export function waterfallLevels(a: Pick<FullAnalysis, 'macro' | 'corporate' | 'personal'>, simple: boolean, income: number) {
  const { macro, corporate, personal } = a;
  const personalMag = Math.min(100, Math.abs(personal.disposableIncomeAnnual) / Math.max(income, 1) * 400);
  return [
    {
      label: simple ? 'The whole economy' : 'Macro — Economy',
      sublabel: simple
        ? `Growth ${macro.gdpImpactPct >= 0 ? 'up' : 'down'} · Prices ${macro.inflationImpactPct >= 0 ? 'rise' : 'fall'}`
        : `GDP ${pct(macro.gdpImpactPct)} · Inflation ${pct(macro.inflationImpactPct)}`,
      magnitude: Math.min(100, Math.abs(macro.gdpImpactPct) * 25 + 10),
      direction: (macro.gdpImpactPct > 0 ? 'positive' : macro.gdpImpactPct < 0 ? 'negative' : 'neutral') as ImpactDirection,
      detail: macro.gdpExplanation || macro.inflationExplanation || undefined,
    },
    {
      label: simple ? 'Companies you might work for' : `Corporate — ${titleCase(corporate.sector)}`,
      sublabel: simple
        ? CAPEX_LABEL[corporate.capexDirection].text
        : `Equity ${corporate.equityImpactRange || pct(corporate.equityPortfolioImpactPct)} · ${CAPEX_LABEL[corporate.capexDirection].text}`,
      magnitude: Math.min(100, Math.abs(corporate.equityPortfolioImpactPct) * 12 + 15),
      direction: CAPEX_LABEL[corporate.capexDirection].dir,
      detail: corporate.capexExplanation || corporate.leverageExplanation || undefined,
    },
    {
      label: simple ? 'Your own wallet' : 'Personal — Your Wallet',
      sublabel: `${money(personal.disposableIncomeMonthly)}/mo · ${money(personal.disposableIncomeAnnual)}/yr`,
      magnitude: Math.max(8, personalMag),
      direction: (personal.disposableIncomeAnnual >= 0 ? 'positive' : 'negative') as ImpactDirection,
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

/** The figures under one deep-dive heading. */
export function deepDiveRows(a: FullAnalysis, key: DeepDiveSection | string): StatRowData[] {
  switch (key) {
    case 'housing': return [
      costRow('Housing costs, per month', a.housing.monthlyHousingEffect, '/mo'),
      { label: 'Property value change', value: pct(a.housing.propertyValueChangePct), positive: better(a.housing.propertyValueChangePct) },
      { label: 'Affordability index change', value: `${a.housing.affordabilityIndexChange >= 0 ? '+' : ''}${a.housing.affordabilityIndexChange}` },
      ...(a.housing.firstTimeBuyerImpact ? [{ label: 'First-time buyer', value: a.housing.firstTimeBuyerImpact }] : []),
    ];
    case 'employment': return [
      { label: 'Job security risk', value: `${a.employment.jobSecurityRisk}/100` },
      { label: 'Wage growth projection', value: pct(a.employment.wageGrowthPct), positive: better(a.employment.wageGrowthPct) },
      { label: 'Job benefits', value: money(a.employment.benefitChangeValue), positive: better(a.employment.benefitChangeValue), cue: a.employment.benefitChangeValue, kind: 'income' },
      ...(a.employment.industryEffects ? [{ label: 'Industry effects', value: a.employment.industryEffects }] : []),
    ];
    case 'healthcare': return [
      costRow('Health premiums, per month', a.healthcare.monthlyPremiumChange, '/mo'),
      costRow('Out-of-pocket maximum', a.healthcare.outOfPocketMaxChange),
      costRow('Prescription costs', a.healthcare.prescriptionCostChange),
      ...(a.healthcare.coverageChange ? [{ label: 'Coverage', value: a.healthcare.coverageChange }] : []),
    ];
    case 'retirement': return [
      { label: '401(k) / IRA contribution limit', value: money(a.retirement.contributionLimitChange), positive: better(a.retirement.contributionLimitChange) },
      { label: 'Social Security benefits', value: money(a.retirement.socialSecurityChange), positive: better(a.retirement.socialSecurityChange), cue: a.retirement.socialSecurityChange, kind: 'income' },
      { label: 'Retirement timeline', value: `${a.retirement.timelineImpactYears >= 0 ? '+' : ''}${a.retirement.timelineImpactYears} yrs`, positive: better(a.retirement.timelineImpactYears, 'down') },
    ];
    case 'education': return [
      costRow('Student loan payments, per month', a.education.studentLoanPaymentChange, '/mo'),
      { label: 'Tuition assistance', value: money(a.education.tuitionAssistanceChange), positive: better(a.education.tuitionAssistanceChange), cue: a.education.tuitionAssistanceChange, kind: 'income' },
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
      { label: 'Inflation impact', value: pct(a.ripple.inflationImpactPct), positive: better(a.ripple.inflationImpactPct, 'down') },
      costRow('Cost of living, per year', a.ripple.costOfLivingChange, '/yr'),
      { label: 'Purchasing power, per year', value: money(a.ripple.purchasingPowerChange, '/yr'), positive: better(a.ripple.purchasingPowerChange), cue: a.ripple.purchasingPowerChange, kind: 'income' },
      ...(a.ripple.interestRateEffect ? [{ label: 'Interest rates on debt', value: a.ripple.interestRateEffect }] : []),
    ];
    default: return [];
  }
}

// ---------------------------------------------------------------------------
// Things to consider
// ---------------------------------------------------------------------------

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
