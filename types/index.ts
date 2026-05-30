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
