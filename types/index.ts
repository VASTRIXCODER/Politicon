export interface UserProfile {
  id: string;
  email?: string;
  firstName?: string;
  hasCompletedOnboarding: boolean;

  // Stage 1: Core Context
  country: string;
  state: string;
  city: string;
  ageRange: string;
  educationStage: string;

  // Stage 2: Economic Position
  employmentStatus: string;
  occupationCategory: string;
  incomeRange: string;
  filingStatus: string;

  // Stage 3: Life Situation
  housingSituation: string;
  debtTypes: string[];
  hasDependents: boolean;
  topFinancialConcerns: string[];
}

export interface PolicyImpact {
  category: 'income' | 'expense' | 'employment' | 'education' | 'housing' | 'healthcare';
  label: string;
  value: number;
  unit: string;
  direction: 'positive' | 'negative' | 'neutral';
  description: string;
}

export interface Policy {
  id: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  status: 'proposed' | 'passed' | 'enacted' | 'rejected';
  date: string;
  source: string;
  sourceUrl: string;
  governingBody: string;
  region: string;
  confidenceLevel: 'high' | 'medium' | 'low';
  impacts: PolicyImpact[];
  assumptions: string[];
  tags: string[];
}

export interface InsightCard {
  id: string;
  type: 'alert' | 'trend' | 'opportunity' | 'info';
  title: string;
  summary: string;
  policyId?: string;
  date: string;
  priority: number;
}

export interface SimulatorVariable {
  id: string;
  name: string;
  description: string;
  currentValue: number;
  minValue: number;
  maxValue: number;
  unit: string;
  step: number;
  category: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface PolicyAnalysis {
  policyId: string;
  immediateEffects: string[];
  rippleEffects: string[];
  dollarBreakdown: {
    label: string;
    amount: number;
    timeframe: string;
    direction: 'positive' | 'negative';
  }[];
  tradeoffs: string[];
  projections: {
    year: 1 | 3 | 5;
    netImpact: number;
    description: string;
  }[];
  recommendations: string[];
  confidenceScore: number;
  lastAnalyzed: string;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  date: string;
  category: string;
  url: string;
  relevanceScore: number;
}

export type PolicyCategory =
  | 'All'
  | 'Taxes'
  | 'Healthcare'
  | 'Housing'
  | 'Employment'
  | 'Education'
  | 'Energy'
  | 'Social Security';

// ============================================================
// Policy Discovery Engine
// ============================================================
export type ImpactDirection = 'positive' | 'negative' | 'neutral';

export interface DiscoveredPolicy {
  id: string;
  title: string;
  billNumber: string;
  status: string; // proposed | passed | enacted | repealed
  category: string;
  relevanceScore: number; // 0-100
  relevance: 'High' | 'Medium' | 'Low'; // derived from score
  summary: string;
  description: string; // alias of summary (legacy consumers)
  direction: ImpactDirection;
  estimatedImpact: string; // e.g. "+$1,200/yr"
  reasons: string[]; // 3 personalized reasons
  region: string;
}

// ============================================================
// Full Policy Analysis Engine — the comprehensive structured breakdown
// Sign convention for every dollar field: positive = money the user
// GAINS (savings / income), negative = money the user LOSES (cost).
// ============================================================
export interface MonthPoint {
  month: number; // 1-12
  impact: number; // cumulative-to-date dollar impact for that month
}

export interface LabeledValue {
  label: string;
  value: number;
}

export interface Recommendation {
  step: string;
  priority: 'high' | 'medium' | 'low';
}

export interface CategoryImpacts {
  taxes: number;
  housing: number;
  healthcare: number;
  employment: number;
  retirement: number;
  education: number;
}

export interface FullAnalysis {
  policyId: string;
  policyTitle: string;
  billNumber: string;
  status: string;
  category: string;
  confidenceScore: number; // 0-100
  direction: ImpactDirection;
  plainEnglishSummary: string;

  netAnnualImpact: number;
  netMonthlyImpact: number;

  immediate: {
    monthlyBudgetImpact: number;
    annualBudgetImpact: number;
    effectiveTaxRateChange: number; // percentage points
    takeHomePerPaycheck: number;
    spendingCategories: LabeledValue[];
  };
  housing: {
    monthlyHousingEffect: number;
    propertyValueChangePct: number;
    affordabilityIndexChange: number;
    firstTimeBuyerImpact: string;
  };
  employment: {
    jobSecurityRisk: number; // 0-100
    wageGrowthPct: number;
    benefitChangeValue: number;
    industryEffects: string;
  };
  healthcare: {
    monthlyPremiumChange: number;
    outOfPocketMaxChange: number;
    prescriptionCostChange: number;
    coverageChange: string;
  };
  retirement: {
    contributionLimitChange: number;
    socialSecurityChange: number;
    timelineImpactYears: number;
  };
  education: {
    studentLoanPaymentChange: number;
    tuitionAssistanceChange: number;
    childEducationCostChange: number;
  };
  tax: {
    federalLiabilityChange: number; // signed impact (positive = tax savings)
    stateLiabilityChange: number;
    effectiveRateBefore: number;
    effectiveRateAfter: number;
    bracketChange: string;
    deductionChanges: string;
    creditChanges: string;
  };
  ripple: {
    inflationImpactPct: number;
    costOfLivingChange: number; // annual dollar
    purchasingPowerChange: number; // annual dollar
    interestRateEffect: string;
  };
  categoryImpacts: CategoryImpacts; // annual signed dollar impact per category
  timeline: {
    year1: number;
    year3: number;
    year5: number;
    monthly: MonthPoint[]; // 12 cumulative points
  };
  tradeoffs: {
    gains: LabeledValue[];
    losses: LabeledValue[];
    netAssessment: string;
  };
  riskFactors: {
    uncertainties: string[];
    confidence: number; // 0-100
  };
  recommendations: Recommendation[];

  // ==========================================================
  // EXPANDED DATA MODEL — macro → corporate → personal waterfall
  // ==========================================================
  macro: MacroIndicators;
  corporate: CorporateResponse;
  personal: PersonalFinancialData;
  vulnerability: VulnerabilityScores; // 0-100 radar across 6 dimensions
  spendingVelocity: SpendingVelocityItem[]; // heatmap source
  simple: SimpleModeContent; // plain-language callouts + jargon list
}

// TIER 1 — Macroeconomic indicators (scoped to user's state + income)
export interface MacroIndicators {
  gdpImpactPct: number; // % change in economic growth
  gdpExplanation: string; // what it means for jobs/business in user's region
  inflationImpactPct: number; // CPI/PCE % change
  inflationExplanation: string; // translated into grocery/gas/rent terms
  economicUncertaintyScore: number; // 0-100 EPU
  uncertaintyExplanation: string; // what high uncertainty does to jobs/investments
  balanceOfPaymentsEffect: string; // imports cheaper / exports competitive + ripple
}

// TIER 2 — Corporate and market response in the user's employment sector
export interface CorporateResponse {
  sector: string; // the user's employment sector
  capexDirection: 'expanding' | 'neutral' | 'pulling_back';
  capexExplanation: string; // meaning for hiring and wages
  leverageEffect: 'more_debt' | 'neutral' | 'conservative';
  leverageExplanation: string; // effect on job security
  profitabilityTrend: 'improving' | 'neutral' | 'declining';
  profitabilityExplanation: string; // one sentence on ROA/ROE
  equityPortfolioImpactPct: number; // directional effect on equity portfolios (midpoint %)
  equityImpactRange: string; // e.g. "-2% to +1%"
}

// TIER 3 — Expanded personal financial data
export interface PersonalFinancialData {
  disposableIncomeMonthly: number; // adjusted disposable income change $/mo
  disposableIncomeAnnual: number; // $/yr
  netWorthChange1yrPct: number; // household net worth directional % over 1yr
  netWorthChange3yrPct: number; // over 3yr
  realEstateEquityPct: number; // property value change %
  realEstateEquityDollar: number; // $ amount (homeowners)
  savingsRateChangePct: number; // personal savings rate change (percentage points)
  savingsRateExplanation: string;
  debtToIncomeChangePct: number; // DTI change (percentage points)
  debtImpacts: LabeledValue[]; // per debt type dollar figures (mortgage/student/auto/cc)
  precautionaryIndex: number; // 0-100 how much to build emergency savings
  precautionaryExplanation: string;
}

// Radar — vulnerability across six dimensions, scored 0-100 (higher = more at risk)
export interface VulnerabilityScores {
  incomeStability: number;
  housingSecurity: number;
  employmentRisk: number;
  costOfLivingPressure: number;
  investmentExposure: number;
  debtBurden: number;
}

// Heatmap — spending category pressure
export interface SpendingVelocityItem {
  category: string; // Dining, Travel, Utilities, Groceries, etc.
  dollarImpact: number; // signed monthly $ (negative = costs more)
  direction: ImpactDirection;
}

// Plain-language content used in Simple Mode
export interface SimpleSectionSummary {
  section: string; // key matching a page section, e.g. "overview", "macro", "personal"
  text: string; // 2-sentence high-school-level summary ("What this means for you")
}

export interface JargonTerm {
  term: string;
  definition: string; // one-sentence plain-English definition
}

export interface SimpleModeContent {
  sectionSummaries: SimpleSectionSummary[];
  jargon: JargonTerm[];
}

// User reading-level preference
export type ReadingMode = 'simple' | 'expert';
