import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import { UserProfile } from '@/types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-20250514';

const DEFAULT_PROFILE: UserProfile = {
  id: 'anonymous',
  hasCompletedOnboarding: false,
  country: 'United States',
  state: 'Unknown',
  city: '',
  ageRange: '31_45',
  educationStage: 'college_4yr',
  employmentStatus: 'employed_full',
  occupationCategory: 'business_finance',
  incomeRange: '75k_100k',
  filingStatus: 'single',
  housingSituation: 'rent',
  debtTypes: [],
  hasDependents: false,
  topFinancialConcerns: ['cost_of_living', 'retirement'],
};

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

export async function GET() {
  let profile = { ...DEFAULT_PROFILE };

  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      try {
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        if (profileData) profile = { ...profile, ...profileData, id: user.id };
      } catch { /* use default */ }
    }
  } catch { /* use default */ }

  const userContext = buildUserContext(profile);

  const prompt = `Return only a JSON array, no markdown, no explanation, no code fences. Based on this user profile, list the 8-10 most financially relevant current US policies being debated or recently enacted that would impact their personal finances.

${userContext}

Return a JSON array where each element has exactly these fields:
- "id": a unique kebab-case slug (e.g. "trump-tax-cuts-2025")
- "title": policy name (concise, under 60 chars)
- "description": one clear sentence about what the policy does
- "category": one of: Tax, Healthcare, Housing, Employment, Education, Energy, Social Security, Other
- "relevance": one of: High, Medium, Low (based on this user's profile)
- "estimatedImpact": dollar amount string like "+$1,200" or "-$800" (annual estimate, can be empty string if truly unknown)
- "region": one of: Federal, or a US state name

Order by relevance descending (High first). Return ONLY the JSON array.`;

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = message.content[0];
    if (block.type !== 'text') return NextResponse.json([]);

    const text = block.text.trim();

    // Strip any accidental markdown fences
    const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

    try {
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) return NextResponse.json([]);
      return NextResponse.json(parsed);
    } catch {
      console.error('Policy feed JSON parse error. Raw:', cleaned.slice(0, 300));
      return NextResponse.json([]);
    }
  } catch (error) {
    console.error('Policy feed Claude error:', error);
    return NextResponse.json([]);
  }
}
