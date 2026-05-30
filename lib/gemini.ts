import { GoogleGenerativeAI } from '@google/generative-ai';
import { UserProfile, Policy } from '@/types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

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
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
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

  const result = await model.generateContent(prompt);
  return result.response.text();
}

export async function chatWithAdvisor(
  messages: { role: 'user' | 'model'; parts: { text: string }[] }[],
  profile: UserProfile
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const userContext = buildUserContext(profile);

  const chat = model.startChat({
    history: messages,
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    systemInstruction: `You are Politicon's AI Financial Advisor — a non-partisan expert who translates government policies into personalized financial impact. You speak like a knowledgeable friend, not a politician.

${userContext}

Rules:
- Always ground answers in the user's specific financial situation above
- Provide specific dollar figures when possible
- Never express political opinions or party preferences
- Focus on actionable financial guidance
- When uncertain, say so clearly with a confidence qualifier
- Keep responses clear and concise — 2-4 paragraphs max unless detail is needed`,
  });

  const lastMessage = messages[messages.length - 1];
  const result = await chat.sendMessage(lastMessage.parts[0].text);
  return result.response.text();
}

export async function discoverPolicies(profile: UserProfile): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const userContext = buildUserContext(profile);

  const prompt = `You are Politicon's policy discovery engine. Based on this user's financial profile, identify the top 5 policies currently being debated or recently enacted that would have the highest financial impact on them.

${userContext}

For each policy, provide:
- Policy name and brief description (1 sentence)
- Estimated dollar impact (monthly or annual)
- Why it's relevant to this specific user
- Confidence level (high/medium/low)

Focus on real, current US federal and state policies. Order by financial impact magnitude (highest first). Be specific and data-driven.`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}
