import Anthropic from '@anthropic-ai/sdk';
import { UserProfile, Policy } from '@/types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-sonnet-4-20250514';

export interface FeedPolicy {
  id: string;
  title: string;
  description: string;
  category: string;
  relevance: 'High' | 'Medium' | 'Low';
  estimatedImpact: string;
  region: string;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildUserContext(profile: UserProfile): string {
  return `
User Financial Profile:
- Location: ${profile.city || 'Unknown city'}, ${profile.state}, ${profile.country}
- Age Range: ${profile.ageRange}
- Education: ${profile.educationStage}
- Employment: ${profile.employmentStatus} — ${profile.occupationCategory}
- Income Range: ${profile.incomeRange}
- Filing Status: ${profile.filingStatus}
- Housing: ${profile.housingSituation}
- Debt Types: ${profile.debtTypes?.join(', ') || 'None'}
- Dependents: ${profile.hasDependents ? 'Yes' : 'No'}
- Top Financial Concerns: ${profile.topFinancialConcerns?.join(', ') || 'General financial health'}
`.trim();
}

export async function analyzePolicy(policy: Policy, profile: UserProfile): Promise<string> {
  const userContext = buildUserContext(profile);

  const prompt = `You are Politicon's AI financial analyst. Your job is to translate government policies into precise, personalized dollar impacts — not political opinions.

${userContext}

Policy to analyze:
Title: ${policy.title}
Summary: ${policy.summary}
Description: ${policy.description}
Category: ${policy.category}
Status: ${policy.status}
Region: ${policy.region}
Governing Body: ${policy.governingBody}

Provide a detailed, structured analysis with:
1. IMMEDIATE EFFECTS (3-4 bullet points) — what changes right away for this user
2. RIPPLE EFFECTS (2-3 bullet points) — secondary economic effects on this user
3. DOLLAR BREAKDOWN — specific dollar amounts with monthly/annual timeframes
4. TRADE-OFFS — honest assessment of costs and benefits, pros and cons
5. PROJECTIONS — 1-year, 3-year, 5-year net impact in dollar terms
6. RECOMMENDATIONS — 2-3 actionable steps this user should take

Be specific to the user's income bracket, location, and situation. Use real numbers. Format using clear headers and bullet points. Do NOT give political opinions — only financial impact analysis.`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = message.content[0];
  return block.type === 'text' ? block.text : '';
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

For each policy, provide:
- Policy name and brief description (1 sentence)
- Estimated dollar impact (monthly or annual)
- Why it's relevant to this specific user
- Confidence level (high/medium/low)

Focus on real, current US federal and state policies. Order by financial impact magnitude (highest first). Be specific and data-driven.`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = message.content[0];
  return block.type === 'text' ? block.text : '';
}

/**
 * Discover a structured feed of the most financially relevant current US
 * policies for a user. Returns a typed array suitable for direct rendering
 * and for caching in the user_policy_feed table. Always returns an array
 * (empty on any failure) — never throws to the caller.
 */
export async function discoverPolicyFeed(profile: UserProfile): Promise<FeedPolicy[]> {
  const userContext = buildUserContext(profile);

  const prompt = `You are Politicon's policy discovery engine. Based on this user's financial profile, identify the 8-10 most financially relevant current US policies (federal or state) being debated or recently enacted.

${userContext}

Return ONLY a valid JSON array — no markdown, no code fences, no commentary. Each element must have exactly these fields:
- "title": short policy name
- "description": one concise sentence
- "category": one of Tax, Healthcare, Housing, Employment, Education, Energy, Other
- "relevance": one of "High", "Medium", "Low" (relative to THIS user)
- "estimatedImpact": a short dollar estimate string, e.g. "$1,200/yr" or "-$500/yr"
- "region": "Federal" or a US state name

Order by financial impact magnitude (highest first). Use real, current US policies.`;

  let raw = '';
  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = message.content[0];
    raw = block.type === 'text' ? block.text : '';
  } catch (e) {
    console.error('Policy feed generation failed:', e);
    return [];
  }

  // Strip accidental markdown fences and isolate the JSON array.
  let jsonText = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = jsonText.indexOf('[');
  const end = jsonText.lastIndexOf(']');
  if (start !== -1 && end !== -1) jsonText = jsonText.slice(start, end + 1);

  try {
    const parsed = JSON.parse(jsonText) as Partial<FeedPolicy>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && p.title)
      .map((p) => ({
        id: slugify(p.title as string),
        title: p.title as string,
        description: p.description || '',
        category: p.category || 'Other',
        relevance: (['High', 'Medium', 'Low'].includes(p.relevance as string)
          ? (p.relevance as FeedPolicy['relevance'])
          : 'Medium'),
        estimatedImpact: p.estimatedImpact || '',
        region: p.region || 'Federal',
      }));
  } catch (e) {
    console.error('Failed to parse policy feed JSON:', e);
    return [];
  }
}
