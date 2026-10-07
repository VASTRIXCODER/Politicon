import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { chatWithAdvisor, advisorPolicyReply } from '@/lib/claude';
import { getRequestContext } from '@/lib/server/requestContext';
import { readJson, apiError } from '@/lib/server/http';
import { rateLimit } from '@/lib/rateLimit';
import { checkAiBudget } from '@/lib/server/aiGuard';
import { aiFailure } from '@/lib/server/aiErrors';
import { resolvePolicy } from '@/lib/server/policies';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Matches what the client sends: the last 20 turns, each capped at 4,000 chars.
const MAX_TURNS = 20;
const MAX_BODY_BYTES = 128 * 1024;

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
    .min(1)
    .max(MAX_TURNS),
  policyId: z.string().min(1).max(80).optional(),
  simpleMode: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await getRequestContext();
  if (!auth.ok) return auth.response;
  const { supabase, user, profile } = auth.ctx;

  const body = await readJson(req, Body, { maxBytes: MAX_BODY_BYTES });
  if (!body.ok) return body.response;
  const { messages, policyId } = body.data;
  if (messages[messages.length - 1].role !== 'user') {
    return apiError(400, 'invalid_request', 'The last message must be from the user.');
  }
  const simple = body.data.simpleMode ?? auth.ctx.simpleMode;

  const limited = await rateLimit(req, 'advisor', { userId: user.id });
  if (!limited.ok) return limited.response;

  // Policy-focused message → structured 3-part reply with a View Full Impact CTA.
  if (policyId) {
    const policy = await resolvePolicy(supabase, user.id, policyId);
    if (!policy) return apiError(404, 'policy_not_found', 'That policy is not in your feed. Refresh your feed and try again.');
    const budget = await checkAiBudget('advisor_policy', user.id);
    if (!budget.ok) return budget.response;
    try {
      const reply = await advisorPolicyReply(policy.title, policy.summary, profile, { feature: 'advisor_policy', userId: user.id, usageId: budget.usageId }, simple);
      return NextResponse.json({
        response: reply.fullResponse,
        summary: reply.summary,
        dollarLine: reply.dollarLine,
        policyId: policy.id,
        policyTitle: policy.title,
        category: policy.category,
        hasFullAnalysis: true,
      });
    } catch (e) {
      return aiFailure(e, 'Advisor policy reply');
    }
  }

  const budget = await checkAiBudget('advisor', user.id);
  if (!budget.ok) return budget.response;
  try {
    const response = await chatWithAdvisor(messages, profile, { feature: 'advisor', userId: user.id, usageId: budget.usageId }, simple);
    return NextResponse.json({ response, hasFullAnalysis: false });
  } catch (e) {
    return aiFailure(e, 'Advisor chat');
  }
}
