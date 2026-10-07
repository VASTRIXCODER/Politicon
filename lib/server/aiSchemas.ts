import 'server-only';
import { z } from 'zod/v4';

/**
 * Structured-output schemas. The API constrains the model's JSON to these
 * shapes and the SDK validates the result, so there's no free-text JSON
 * extraction. Field semantics are explained in the prompts and descriptions.
 */

const direction = z.enum(['positive', 'negative', 'neutral']);
const status = z.enum(['proposed', 'passed', 'enacted', 'repealed', 'rejected']);
const labeled = z.object({ label: z.string(), value: z.number() });

// ---------------------------------------------------------------------------
// Policy feed
// ---------------------------------------------------------------------------
export const FeedOutput = z.object({
  policies: z
    .array(
      z.object({
        title: z.string().describe('Short official policy name'),
        billNumber: z.string().describe('Official bill number such as "H.R. 1" or "SB 1047", or "" if none'),
        status,
        category: z.enum(['taxes', 'healthcare', 'housing', 'employment', 'education', 'retirement', 'energy']),
        relevanceScore: z.number().int().describe('0-100: how directly this affects THIS user'),
        summary: z.string().describe('One plain-English sentence on what the policy does'),
        direction: direction.describe('Financial direction for this user'),
        estimatedImpact: z.string().describe('Short signed annual estimate, e.g. "+$1,200/yr" or "-$800/yr"'),
        region: z.string().describe('"Federal" or the US state name'),
        reasons: z.array(z.string()).describe('Up to 3 short, specific reasons this matters to this user'),
      }),
    )
    .describe('Up to 10 policies, most relevant first'),
});
export type FeedOutput = z.infer<typeof FeedOutput>;

// ---------------------------------------------------------------------------
// Advisor policy reply
// ---------------------------------------------------------------------------
export const PolicyReplyOutput = z.object({
  summary: z.string().describe('2-3 plain-English sentences on what the policy does and its direction for this user'),
  dollarLine: z.string().describe('One line with a concrete, hedged dollar estimate for this user'),
});
export type PolicyReplyOutput = z.infer<typeof PolicyReplyOutput>;

// ---------------------------------------------------------------------------
// Full analysis
// ---------------------------------------------------------------------------
export const AnalysisOutput = z.object({
  billNumber: z.string(),
  status,
  confidenceScore: z.number().int().describe('0-100, lower for proposed/contested policies or indirect exposure'),
  direction,
  plainEnglishSummary: z.string(),
  assumptions: z.array(z.string()).describe('Assumptions made about the user or the policy, 0-7 items'),
  netAnnualImpact: z.number().describe('Signed $/yr from the user’s perspective (negative = costs them)'),
  netMonthlyImpact: z.number(),
  immediate: z.object({
    monthlyBudgetImpact: z.number(),
    annualBudgetImpact: z.number(),
    effectiveTaxRateChange: z.number().describe('Percentage points'),
    takeHomePerPaycheck: z.number(),
    spendingCategories: z.array(labeled),
  }),
  housing: z.object({
    monthlyHousingEffect: z.number(),
    propertyValueChangePct: z.number(),
    affordabilityIndexChange: z.number(),
    firstTimeBuyerImpact: z.string(),
  }),
  employment: z.object({
    jobSecurityRisk: z.number().describe('0-100'),
    wageGrowthPct: z.number(),
    benefitChangeValue: z.number(),
    industryEffects: z.string(),
  }),
  healthcare: z.object({
    monthlyPremiumChange: z.number(),
    outOfPocketMaxChange: z.number(),
    prescriptionCostChange: z.number(),
    coverageChange: z.string(),
  }),
  retirement: z.object({
    contributionLimitChange: z.number(),
    socialSecurityChange: z.number(),
    timelineImpactYears: z.number(),
  }),
  education: z.object({
    studentLoanPaymentChange: z.number(),
    tuitionAssistanceChange: z.number(),
    childEducationCostChange: z.number(),
  }),
  tax: z.object({
    federalLiabilityChange: z.number().describe('Signed impact: positive = tax savings'),
    stateLiabilityChange: z.number(),
    effectiveRateBefore: z.number(),
    effectiveRateAfter: z.number(),
    bracketChange: z.string(),
    deductionChanges: z.string(),
    creditChanges: z.string(),
  }),
  ripple: z.object({
    inflationImpactPct: z.number(),
    costOfLivingChange: z.number(),
    purchasingPowerChange: z.number(),
    interestRateEffect: z.string(),
  }),
  categoryImpacts: z.object({
    taxes: z.number(),
    housing: z.number(),
    healthcare: z.number(),
    employment: z.number(),
    retirement: z.number(),
    education: z.number(),
  }),
  timeline: z.object({
    year1: z.number().describe('Cumulative $ after 1 year'),
    year3: z.number().describe('Cumulative $ after 3 years'),
    year5: z.number().describe('Cumulative $ after 5 years'),
    monthly: z.array(z.object({ month: z.number().int(), impact: z.number() })).describe('12 cumulative points'),
  }),
  tradeoffs: z.object({ gains: z.array(labeled), losses: z.array(labeled), netAssessment: z.string() }),
  riskFactors: z.object({ uncertainties: z.array(z.string()), confidence: z.number().int() }),
  recommendations: z.array(z.object({ step: z.string(), priority: z.enum(['high', 'medium', 'low']) })),
  macro: z.object({
    gdpImpactPct: z.number(),
    gdpExplanation: z.string(),
    inflationImpactPct: z.number(),
    inflationExplanation: z.string(),
    economicUncertaintyScore: z.number().describe('0-100'),
    uncertaintyExplanation: z.string(),
    balanceOfPaymentsEffect: z.string(),
  }),
  corporate: z.object({
    sector: z.string(),
    capexDirection: z.enum(['expanding', 'neutral', 'pulling_back']),
    capexExplanation: z.string(),
    leverageEffect: z.enum(['more_debt', 'neutral', 'conservative']),
    leverageExplanation: z.string(),
    profitabilityTrend: z.enum(['improving', 'neutral', 'declining']),
    profitabilityExplanation: z.string(),
    equityPortfolioImpactPct: z.number(),
    equityImpactRange: z.string(),
  }),
  personal: z.object({
    disposableIncomeMonthly: z.number(),
    disposableIncomeAnnual: z.number(),
    netWorthChange1yrPct: z.number(),
    netWorthChange3yrPct: z.number(),
    realEstateEquityPct: z.number(),
    realEstateEquityDollar: z.number(),
    savingsRateChangePct: z.number(),
    savingsRateExplanation: z.string(),
    debtToIncomeChangePct: z.number(),
    debtImpacts: z.array(labeled).describe('One entry per debt the user actually has; empty if none'),
    precautionaryIndex: z.number().describe('0-100'),
    precautionaryExplanation: z.string(),
  }),
  vulnerability: z.object({
    incomeStability: z.number(),
    housingSecurity: z.number(),
    employmentRisk: z.number(),
    costOfLivingPressure: z.number(),
    investmentExposure: z.number(),
    debtBurden: z.number(),
  }),
  spendingVelocity: z.array(z.object({ category: z.string(), dollarImpact: z.number(), direction })),
  simple: z.object({
    sectionSummaries: z.array(z.object({ section: z.string(), text: z.string() })),
    jargon: z.array(z.object({ term: z.string(), definition: z.string() })),
  }),
});
export type AnalysisOutput = z.infer<typeof AnalysisOutput>;
