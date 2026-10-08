/**
 * Normalizes an analysis object (fresh from the model or loaded from the
 * database) into a complete FullAnalysis: every field present, numbers
 * finite, enums valid. Safe to use on both server and client, so older stored
 * rows render with the current UI.
 */
import type { FullAnalysis, ImpactDirection, Policy } from '@/types';

/** Bump when the FullAnalysis shape changes (stored with each analysis). */
export const ANALYSIS_SCHEMA_VERSION = 3;

export function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^0-9.\-]/g, '');
    const n = parseFloat(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function str(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return fallback;
}

export function dir(v: unknown): ImpactDirection {
  const s = str(v).toLowerCase();
  if (s === 'positive' || s === 'negative' || s === 'neutral') return s;
  return 'neutral';
}


function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function labeledValues(v: unknown): { label: string; value: number }[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => ({ label: str(obj(x).label), value: num(obj(x).value) }))
    .filter((x) => x.label || x.value);
}

/** Coerce a model value to one of an allowed enum set, with fallback. */
function enumOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  const s = str(v).toLowerCase().replace(/[\s-]+/g, '_');
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}

const POLICY_STATUSES = ['proposed', 'passed', 'enacted', 'repealed', 'rejected'] as const;

/** Map the model's free-text status ("signed into law", "introduced", …) onto the stored set. */
export function policyStatus(v: unknown, fallback?: string): (typeof POLICY_STATUSES)[number] {
  const s = str(v).toLowerCase();
  if ((POLICY_STATUSES as readonly string[]).includes(s)) return s as (typeof POLICY_STATUSES)[number];
  if (/sign|law|effect|enact/.test(s)) return 'enacted';
  if (/repeal|overturn|struck/.test(s)) return 'repealed';
  if (/fail|reject|veto|dead/.test(s)) return 'rejected';
  if (/pass/.test(s)) return 'passed';
  const f = (fallback || '').toLowerCase();
  return (POLICY_STATUSES as readonly string[]).includes(f) ? (f as (typeof POLICY_STATUSES)[number]) : 'proposed';
}

function clamp100(v: unknown): number {
  return Math.max(0, Math.min(100, Math.round(num(v))));
}

export function coerceFullAnalysis(p: Record<string, unknown>, policy: Policy): FullAnalysis {
  const immediate = obj(p.immediate);
  const housing = obj(p.housing);
  const employment = obj(p.employment);
  const healthcare = obj(p.healthcare);
  const retirement = obj(p.retirement);
  const education = obj(p.education);
  const tax = obj(p.tax);
  const ripple = obj(p.ripple);
  const ci = obj(p.categoryImpacts);
  const timeline = obj(p.timeline);
  const tradeoffs = obj(p.tradeoffs);
  const risk = obj(p.riskFactors);
  const macro = obj(p.macro);
  const corporate = obj(p.corporate);
  const personal = obj(p.personal);
  const vuln = obj(p.vulnerability);
  const simple = obj(p.simple);

  const categoryImpacts = {
    taxes: num(ci.taxes),
    housing: num(ci.housing),
    healthcare: num(ci.healthcare),
    employment: num(ci.employment),
    retirement: num(ci.retirement),
    education: num(ci.education),
  };

  // Net impact: trust the model's value, else derive from category impacts.
  const derivedNet =
    categoryImpacts.taxes + categoryImpacts.housing + categoryImpacts.healthcare +
    categoryImpacts.employment + categoryImpacts.retirement + categoryImpacts.education +
    num(ripple.costOfLivingChange);
  const netAnnual = num(p.netAnnualImpact, derivedNet);
  const netMonthly = num(p.netMonthlyImpact, Math.round(netAnnual / 12));

  // Build a clean 12-point cumulative monthly series; synthesize if missing.
  let monthly = Array.isArray(timeline.monthly)
    ? timeline.monthly.map((m) => ({ month: num(obj(m).month), impact: num(obj(m).impact) })).filter((m) => m.month >= 1 && m.month <= 12)
    : [];
  if (monthly.length < 12) {
    monthly = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      impact: Math.round((netAnnual / 12) * (i + 1)),
    }));
  }
  monthly.sort((a, b) => a.month - b.month);

  const recommendations = Array.isArray(p.recommendations)
    ? p.recommendations
        .map((r) => {
          const o = obj(r);
          const priority = str(o.priority, 'medium').toLowerCase();
          return {
            step: str(o.step) || str(r),
            priority: (['high', 'medium', 'low'].includes(priority) ? priority : 'medium') as 'high' | 'medium' | 'low',
          };
        })
        .filter((r) => r.step)
    : [];

  // No invented default: an analysis without a confidence score reports 0 (unknown).
  const score = Math.max(0, Math.min(100, Math.round(num(p.confidenceScore, num(risk.confidence, 0)))));

  return {
    policyId: policy.id,
    policyTitle: policy.title,
    billNumber: str(p.billNumber, policy.governingBody && /\b(H\.?R\.?|S\.?)\s*\d/i.test(policy.governingBody) ? policy.governingBody : ''),
    status: policyStatus(p.status, policy.status),
    category: policy.category || 'taxes',
    confidenceScore: score,
    direction: dir(p.direction !== undefined ? p.direction : netAnnual > 0 ? 'positive' : netAnnual < 0 ? 'negative' : 'neutral'),
    plainEnglishSummary: str(p.plainEnglishSummary, policy.summary),
    assumptions: Array.isArray(p.assumptions) ? p.assumptions.map((a) => str(a)).filter(Boolean).slice(0, 10) : [],
    schemaVersion: num(p.schemaVersion, 0) || undefined,
    netAnnualImpact: Math.round(netAnnual),
    netMonthlyImpact: Math.round(netMonthly),
    immediate: {
      monthlyBudgetImpact: num(immediate.monthlyBudgetImpact, Math.round(netAnnual / 12)),
      annualBudgetImpact: num(immediate.annualBudgetImpact, Math.round(netAnnual)),
      effectiveTaxRateChange: num(immediate.effectiveTaxRateChange),
      takeHomePerPaycheck: num(immediate.takeHomePerPaycheck),
      spendingCategories: labeledValues(immediate.spendingCategories),
    },
    housing: {
      monthlyHousingEffect: num(housing.monthlyHousingEffect),
      propertyValueChangePct: num(housing.propertyValueChangePct),
      affordabilityIndexChange: num(housing.affordabilityIndexChange),
      firstTimeBuyerImpact: str(housing.firstTimeBuyerImpact),
    },
    employment: {
      jobSecurityRisk: Math.max(0, Math.min(100, Math.round(num(employment.jobSecurityRisk)))),
      wageGrowthPct: num(employment.wageGrowthPct),
      benefitChangeValue: num(employment.benefitChangeValue),
      industryEffects: str(employment.industryEffects),
    },
    healthcare: {
      monthlyPremiumChange: num(healthcare.monthlyPremiumChange),
      outOfPocketMaxChange: num(healthcare.outOfPocketMaxChange),
      prescriptionCostChange: num(healthcare.prescriptionCostChange),
      coverageChange: str(healthcare.coverageChange),
    },
    retirement: {
      contributionLimitChange: num(retirement.contributionLimitChange),
      socialSecurityChange: num(retirement.socialSecurityChange),
      timelineImpactYears: num(retirement.timelineImpactYears),
    },
    education: {
      studentLoanPaymentChange: num(education.studentLoanPaymentChange),
      tuitionAssistanceChange: num(education.tuitionAssistanceChange),
      childEducationCostChange: num(education.childEducationCostChange),
    },
    tax: {
      federalLiabilityChange: num(tax.federalLiabilityChange),
      stateLiabilityChange: num(tax.stateLiabilityChange),
      effectiveRateBefore: num(tax.effectiveRateBefore),
      effectiveRateAfter: num(tax.effectiveRateAfter),
      bracketChange: str(tax.bracketChange),
      deductionChanges: str(tax.deductionChanges),
      creditChanges: str(tax.creditChanges),
    },
    ripple: {
      inflationImpactPct: num(ripple.inflationImpactPct),
      costOfLivingChange: num(ripple.costOfLivingChange),
      purchasingPowerChange: num(ripple.purchasingPowerChange),
      interestRateEffect: str(ripple.interestRateEffect),
    },
    categoryImpacts,
    timeline: {
      year1: num(timeline.year1, Math.round(netAnnual)),
      year3: num(timeline.year3, Math.round(netAnnual * 3)),
      year5: num(timeline.year5, Math.round(netAnnual * 5)),
      monthly,
    },
    tradeoffs: {
      gains: labeledValues(tradeoffs.gains),
      losses: labeledValues(tradeoffs.losses),
      netAssessment: str(tradeoffs.netAssessment),
    },
    riskFactors: {
      uncertainties: Array.isArray(risk.uncertainties) ? risk.uncertainties.map((u) => str(u)).filter(Boolean) : [],
      confidence: score,
    },
    recommendations,
    macro: {
      gdpImpactPct: num(macro.gdpImpactPct),
      gdpExplanation: str(macro.gdpExplanation),
      inflationImpactPct: num(macro.inflationImpactPct, num(ripple.inflationImpactPct)),
      inflationExplanation: str(macro.inflationExplanation),
      economicUncertaintyScore: clamp100(macro.economicUncertaintyScore),
      uncertaintyExplanation: str(macro.uncertaintyExplanation),
      balanceOfPaymentsEffect: str(macro.balanceOfPaymentsEffect),
    },
    corporate: {
      sector: str(corporate.sector, policy.category || 'your sector'),
      capexDirection: enumOf(corporate.capexDirection, ['expanding', 'neutral', 'pulling_back'] as const, 'neutral'),
      capexExplanation: str(corporate.capexExplanation),
      leverageEffect: enumOf(corporate.leverageEffect, ['more_debt', 'neutral', 'conservative'] as const, 'neutral'),
      leverageExplanation: str(corporate.leverageExplanation),
      profitabilityTrend: enumOf(corporate.profitabilityTrend, ['improving', 'neutral', 'declining'] as const, 'neutral'),
      profitabilityExplanation: str(corporate.profitabilityExplanation),
      equityPortfolioImpactPct: num(corporate.equityPortfolioImpactPct),
      equityImpactRange: str(corporate.equityImpactRange),
    },
    personal: {
      disposableIncomeMonthly: num(personal.disposableIncomeMonthly, Math.round(netMonthly)),
      disposableIncomeAnnual: num(personal.disposableIncomeAnnual, Math.round(netAnnual)),
      netWorthChange1yrPct: num(personal.netWorthChange1yrPct),
      netWorthChange3yrPct: num(personal.netWorthChange3yrPct),
      realEstateEquityPct: num(personal.realEstateEquityPct, num(housing.propertyValueChangePct)),
      realEstateEquityDollar: num(personal.realEstateEquityDollar),
      savingsRateChangePct: num(personal.savingsRateChangePct),
      savingsRateExplanation: str(personal.savingsRateExplanation),
      debtToIncomeChangePct: num(personal.debtToIncomeChangePct),
      debtImpacts: labeledValues(personal.debtImpacts),
      precautionaryIndex: clamp100(personal.precautionaryIndex),
      precautionaryExplanation: str(personal.precautionaryExplanation),
    },
    vulnerability: {
      incomeStability: clamp100(vuln.incomeStability),
      housingSecurity: clamp100(vuln.housingSecurity),
      employmentRisk: clamp100(vuln.employmentRisk),
      costOfLivingPressure: clamp100(vuln.costOfLivingPressure),
      investmentExposure: clamp100(vuln.investmentExposure),
      debtBurden: clamp100(vuln.debtBurden),
    },
    spendingVelocity: Array.isArray(p.spendingVelocity)
      ? p.spendingVelocity.map((s) => {
          const o = obj(s);
          const dollarImpact = num(o.dollarImpact);
          return {
            category: str(o.category),
            dollarImpact,
            direction: dir(o.direction !== undefined ? o.direction : dollarImpact > 0 ? 'positive' : dollarImpact < 0 ? 'negative' : 'neutral'),
          };
        }).filter((s) => s.category)
      : [],
    simple: {
      sectionSummaries: Array.isArray(simple.sectionSummaries)
        ? simple.sectionSummaries.map((s) => ({ section: str(obj(s).section), text: str(obj(s).text) })).filter((s) => s.section && s.text)
        : [],
      jargon: Array.isArray(simple.jargon)
        ? simple.jargon.map((j) => ({ term: str(obj(j).term), definition: str(obj(j).definition) })).filter((j) => j.term && j.definition)
        : [],
    },
  };
}
