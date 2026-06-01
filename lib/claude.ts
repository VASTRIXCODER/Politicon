import Anthropic from '@anthropic-ai/sdk';
import {
  UserProfile,
  Policy,
  DiscoveredPolicy,
  FullAnalysis,
  ImpactDirection,
} from '@/types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-sonnet-4-20250514';

// Legacy alias kept so existing imports (`FeedPolicy`) keep compiling.
export type FeedPolicy = DiscoveredPolicy;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

/** Coerce any model value to a finite number (handles "$1,200", "-3.5%", etc.). */
function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^0-9.\-]/g, '');
    const n = parseFloat(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function str(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return fallback;
}

function dir(v: unknown): ImpactDirection {
  const s = str(v).toLowerCase();
  if (s === 'positive' || s === 'negative' || s === 'neutral') return s;
  return 'neutral';
}

/** Pull the first JSON value (object or array) out of a model response. */
function extractJson(raw: string): unknown {
  let text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  let start = -1;
  if (firstBrace === -1) start = firstBracket;
  else if (firstBracket === -1) start = firstBrace;
  else start = Math.min(firstBrace, firstBracket);
  if (start === -1) throw new Error('No JSON found');
  const opensWithArray = text[start] === '[';
  const end = opensWithArray ? text.lastIndexOf(']') : text.lastIndexOf('}');
  if (end === -1) throw new Error('Malformed JSON');
  text = text.slice(start, end + 1);
  return JSON.parse(text);
}

function buildUserContext(profile: UserProfile): string {
  return `User Financial Profile:
- Location: ${profile.city || 'Unknown city'}, ${profile.state}, ${profile.country}
- Age Range: ${profile.ageRange}
- Education: ${profile.educationStage}
- Employment: ${profile.employmentStatus} — ${profile.occupationCategory}
- Income Range: ${profile.incomeRange}
- Filing Status: ${profile.filingStatus}
- Housing: ${profile.housingSituation}
- Debt Types: ${profile.debtTypes?.join(', ') || 'None'}
- Dependents: ${profile.hasDependents ? 'Yes' : 'No'}
- Top Financial Concerns: ${profile.topFinancialConcerns?.join(', ') || 'General financial health'}`;
}

/** Stream + collect a single text response (avoids request timeouts on long output). */
async function complete(prompt: string, maxTokens: number, system?: string): Promise<string> {
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content: prompt }],
  });
  const message = await stream.finalMessage();
  const block = message.content[0];
  return block && block.type === 'text' ? block.text : '';
}

// ===========================================================================
// POLICY DISCOVERY ENGINE
// ===========================================================================
export async function discoverPolicyFeed(profile: UserProfile): Promise<DiscoveredPolicy[]> {
  const userContext = buildUserContext(profile);

  const prompt = `You are Politicon's policy discovery engine. Identify the 10 most relevant CURRENT US federal and state policies affecting this specific user right now.

${userContext}

Return ONLY a valid JSON array (no markdown, no commentary, no code fences) of exactly 10 objects. Each object MUST have these fields:
- "title": short official policy name
- "billNumber": official bill number if applicable (e.g. "H.R. 1", "S. 4361"), else ""
- "status": one of "proposed", "passed", "enacted", "repealed"
- "category": one of "taxes", "healthcare", "housing", "employment", "education", "retirement", "energy"
- "relevanceScore": integer 0-100 for how directly this affects THIS user's profile
- "summary": one plain-English sentence on what the policy does
- "direction": "positive", "negative", or "neutral" — the financial direction for this user's income bracket
- "estimatedImpact": short annual dollar estimate string, e.g. "+$1,200/yr" or "-$800/yr"
- "region": "Federal" or the US state name
- "reasons": array of EXACTLY 3 short strings, each a specific reason this policy is personally relevant to this user

Use real, current US policies. Order by relevanceScore descending. Return ONLY the JSON array.`;

  let raw = '';
  try {
    raw = await complete(prompt, 4096);
  } catch (e) {
    console.error('Policy feed generation failed:', e);
    return [];
  }

  try {
    const parsed = extractJson(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && !!(p as { title?: unknown }).title)
      .map((p) => {
        const title = str(p.title);
        const score = Math.max(0, Math.min(100, Math.round(num(p.relevanceScore, 50))));
        const summary = str(p.summary || p.description);
        const reasons = Array.isArray(p.reasons) ? p.reasons.map((r) => str(r)).filter(Boolean).slice(0, 3) : [];
        return {
          id: slugify(title),
          title,
          billNumber: str(p.billNumber),
          status: str(p.status, 'proposed').toLowerCase(),
          category: str(p.category, 'taxes'),
          relevanceScore: score,
          relevance: score >= 70 ? 'High' : score >= 40 ? 'Medium' : 'Low',
          summary,
          description: summary,
          direction: dir(p.direction),
          estimatedImpact: str(p.estimatedImpact),
          reasons,
          region: str(p.region, 'Federal'),
        } satisfies DiscoveredPolicy;
      });
  } catch (e) {
    console.error('Failed to parse policy feed JSON:', e);
    return [];
  }
}

// ===========================================================================
// FULL POLICY ANALYSIS ENGINE
// ===========================================================================
const ANALYSIS_SKELETON = `{
  "billNumber": "", "status": "proposed", "confidenceScore": 0,
  "direction": "positive|negative|neutral",
  "plainEnglishSummary": "",
  "netAnnualImpact": 0, "netMonthlyImpact": 0,
  "immediate": { "monthlyBudgetImpact": 0, "annualBudgetImpact": 0, "effectiveTaxRateChange": 0, "takeHomePerPaycheck": 0, "spendingCategories": [ { "label": "Groceries", "value": 0 } ] },
  "housing": { "monthlyHousingEffect": 0, "propertyValueChangePct": 0, "affordabilityIndexChange": 0, "firstTimeBuyerImpact": "" },
  "employment": { "jobSecurityRisk": 0, "wageGrowthPct": 0, "benefitChangeValue": 0, "industryEffects": "" },
  "healthcare": { "monthlyPremiumChange": 0, "outOfPocketMaxChange": 0, "prescriptionCostChange": 0, "coverageChange": "" },
  "retirement": { "contributionLimitChange": 0, "socialSecurityChange": 0, "timelineImpactYears": 0 },
  "education": { "studentLoanPaymentChange": 0, "tuitionAssistanceChange": 0, "childEducationCostChange": 0 },
  "tax": { "federalLiabilityChange": 0, "stateLiabilityChange": 0, "effectiveRateBefore": 0, "effectiveRateAfter": 0, "bracketChange": "", "deductionChanges": "", "creditChanges": "" },
  "ripple": { "inflationImpactPct": 0, "costOfLivingChange": 0, "purchasingPowerChange": 0, "interestRateEffect": "" },
  "categoryImpacts": { "taxes": 0, "housing": 0, "healthcare": 0, "employment": 0, "retirement": 0, "education": 0 },
  "timeline": { "year1": 0, "year3": 0, "year5": 0, "monthly": [ { "month": 1, "impact": 0 } ] },
  "tradeoffs": { "gains": [ { "label": "", "value": 0 } ], "losses": [ { "label": "", "value": 0 } ], "netAssessment": "" },
  "riskFactors": { "uncertainties": [ "" ], "confidence": 0 },
  "recommendations": [ { "step": "", "priority": "high|medium|low" } ]
}`;

export async function analyzePolicyFull(policy: Policy, profile: UserProfile): Promise<FullAnalysis> {
  const userContext = buildUserContext(profile);

  const system = `You are Politicon's AI financial analyst. You translate government policies into precise, personalized dollar impacts for a specific user — never political opinions. You always respond with a single valid JSON object and nothing else.

SIGN CONVENTION (critical): every dollar field is signed from the USER'S perspective. Positive = money the user GAINS (savings, credits, higher take-home). Negative = money the user LOSES (higher taxes, higher costs). A tax liability increase is therefore a NEGATIVE number. "netAnnualImpact" must approximately equal the sum of categoryImpacts plus ripple effects. The 12 "monthly" points must be CUMULATIVE and end near netAnnualImpact at month 12.`;

  const prompt = `Analyze the financial impact of this policy for the user below. Fill EVERY field with realistic, specific numbers grounded in the user's income bracket, location, filing status, housing, dependents and debt. Do not leave fields at 0 unless that category is genuinely unaffected.

${userContext}

Policy:
Title: ${policy.title}
Bill: ${policy.governingBody || ''}
Summary: ${policy.summary}
Description: ${policy.description}
Category: ${policy.category}
Status: ${policy.status}
Region: ${policy.region}

Return ONLY a JSON object with EXACTLY this shape (replace every value with your analysis; "spendingCategories", "gains", "losses", "uncertainties" and "recommendations" should each have 3-5 items; "monthly" must have all 12 months):
${ANALYSIS_SKELETON}`;

  let raw = '';
  try {
    raw = await complete(prompt, 8000, system);
  } catch (e) {
    console.error('Full analysis generation failed:', e);
  }

  let parsed: Record<string, unknown> = {};
  try {
    const j = extractJson(raw);
    if (j && typeof j === 'object' && !Array.isArray(j)) parsed = j as Record<string, unknown>;
  } catch (e) {
    console.error('Failed to parse full analysis JSON:', e);
  }

  return coerceFullAnalysis(parsed, policy);
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

  const score = Math.max(0, Math.min(100, Math.round(num(p.confidenceScore, num(risk.confidence, 75)))));

  return {
    policyId: policy.id,
    policyTitle: policy.title,
    billNumber: str(p.billNumber, policy.governingBody && /\b(H\.?R\.?|S\.?)\s*\d/i.test(policy.governingBody) ? policy.governingBody : ''),
    status: str(p.status, policy.status || 'proposed').toLowerCase(),
    category: policy.category || 'taxes',
    confidenceScore: score,
    direction: dir(p.direction !== undefined ? p.direction : netAnnual > 0 ? 'positive' : netAnnual < 0 ? 'negative' : 'neutral'),
    plainEnglishSummary: str(p.plainEnglishSummary, policy.summary),
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
  };
}

// ===========================================================================
// AI ADVISOR — 3-part policy response (summary + dollar line + CTA)
// ===========================================================================
export interface AdvisorPolicyReply {
  summary: string;
  dollarLine: string;
  fullResponse: string;
}

export async function advisorPolicyReply(
  policyTitle: string,
  policyContext: string,
  profile: UserProfile
): Promise<AdvisorPolicyReply> {
  const userContext = buildUserContext(profile);

  const system = `You are Politicon's AI Financial Advisor — non-partisan, dollar-specific, speaking like a knowledgeable friend. Respond ONLY with a JSON object: {"summary": "...", "dollarLine": "..."}.
- "summary": 2-3 sentences in plain English on what this policy does and its general financial direction for THIS user.
- "dollarLine": ONE line with a concrete dollar estimate derived from the user's income data, e.g. "Based on your profile this policy could cost you approximately $340 per month." Always include a real dollar figure.`;

  const prompt = `${userContext}

Policy the user asked about: ${policyTitle}
${policyContext ? `Context: ${policyContext}` : ''}

Return ONLY the JSON object.`;

  let raw = '';
  try {
    raw = await complete(prompt, 700, system);
  } catch (e) {
    console.error('Advisor policy reply failed:', e);
  }

  let summary = '';
  let dollarLine = '';
  try {
    const j = obj(extractJson(raw));
    summary = str(j.summary);
    dollarLine = str(j.dollarLine);
  } catch {
    summary = raw.trim();
  }
  if (!summary) summary = `Here's how ${policyTitle} could affect your finances based on your profile.`;
  const fullResponse = dollarLine ? `${summary}\n\n${dollarLine}` : summary;
  return { summary, dollarLine, fullResponse };
}

// ===========================================================================
// CUMULATIVE SUMMARY — written narrative across selected analyzed policies
// ===========================================================================
export async function cumulativeSummary(
  items: { title: string; category: string; annual: number }[],
  profile: UserProfile
): Promise<string> {
  if (items.length === 0) return '';
  const userContext = buildUserContext(profile);
  const list = items.map((i) => `- ${i.title} (${i.category}): ${i.annual >= 0 ? '+' : ''}$${i.annual.toLocaleString()}/yr`).join('\n');
  const total = items.reduce((s, i) => s + i.annual, 0);

  const prompt = `You are Politicon's AI Financial Advisor. The user has selected these analyzed policies. Their combined net annual impact is ${total >= 0 ? '+' : ''}$${total.toLocaleString()}.

${userContext}

Selected policies:
${list}

Write a concise 3-4 sentence narrative explaining what the COMBINED effect of these policies means for this user's financial future. Be specific and dollar-aware, mention the dominant drivers, and end with one concrete recommendation. Plain text only, no markdown headers.`;

  try {
    return (await complete(prompt, 600)).trim();
  } catch (e) {
    console.error('Cumulative summary failed:', e);
    return '';
  }
}

// ===========================================================================
// LEGACY EXPORTS (kept for existing callers)
// ===========================================================================
export async function analyzePolicy(policy: Policy, profile: UserProfile): Promise<string> {
  const userContext = buildUserContext(profile);
  const prompt = `You are Politicon's AI financial analyst. Translate this policy into precise, personalized dollar impacts — not political opinions.

${userContext}

Policy to analyze:
Title: ${policy.title}
Summary: ${policy.summary}
Description: ${policy.description}
Category: ${policy.category}
Status: ${policy.status}
Region: ${policy.region}

Provide a structured analysis with these exact headers:
1. IMMEDIATE EFFECTS (3-4 bullets)
2. RIPPLE EFFECTS (2-3 bullets)
3. DOLLAR BREAKDOWN (specific monthly/annual amounts)
4. TRADE-OFFS (honest pros and cons)
5. PROJECTIONS (1-year, 3-year, 5-year net impact in dollars)
6. RECOMMENDATIONS (2-3 actionable steps)

Be specific to the user's income, location and situation. Use real numbers. No political opinions.`;
  return complete(prompt, 2048);
}

export async function chatWithAdvisor(
  messages: { role: 'user' | 'model'; parts: { text: string }[] }[],
  profile: UserProfile
): Promise<string> {
  const userContext = buildUserContext(profile);
  const systemPrompt = `You are Politicon's AI Financial Advisor — a non-partisan expert who translates government policies into personalized financial impact. You speak like a knowledgeable friend, not a politician.

${userContext}

Rules:
- Always ground answers in the user's specific financial situation above
- Provide specific dollar figures when possible
- Never express political opinions or party preferences
- Focus on actionable financial guidance
- When uncertain, say so clearly with a confidence qualifier
- Keep responses clear and concise — 2-4 paragraphs max unless detail is needed`;

  const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role === 'model' ? 'assistant' : 'user',
    content: m.parts.map((p) => p.text).join(''),
  }));

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: anthropicMessages,
  });
  const block = response.content[0];
  return block.type === 'text' ? block.text : '';
}

export async function discoverPolicies(profile: UserProfile): Promise<string> {
  const userContext = buildUserContext(profile);
  const prompt = `You are Politicon's policy discovery engine. Based on this user's financial profile, identify the top 5 policies currently being debated or recently enacted that would have the highest financial impact on them.

${userContext}

For each policy, provide: name + brief description, estimated dollar impact, why it's relevant to this user, and a confidence level. Focus on real, current US policies, ordered by impact magnitude.`;
  return complete(prompt, 2048);
}
