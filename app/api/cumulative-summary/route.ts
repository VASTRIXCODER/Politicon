import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { cumulativeSummary } from '@/lib/claude';
import { getRequestContext } from '@/lib/server/requestContext';
import { readJson, apiError } from '@/lib/server/http';
import { rateLimit } from '@/lib/rateLimit';
import { checkAiBudget } from '@/lib/server/aiGuard';
import { aiFailure } from '@/lib/server/aiErrors';
import { loadPolicyLines } from '@/lib/server/analyses';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({
  policyIds: z.array(z.string().min(1).max(80)).min(1).max(50),
});

export async function POST(req: NextRequest) {
  const auth = await getRequestContext();
  if (!auth.ok) return auth.response;
  const { supabase, user, profile } = auth.ctx;

  const body = await readJson(req, Body);
  if (!body.ok) return body.response;

  const loaded = await loadPolicyLines(supabase, user.id, { policyIds: body.data.policyIds });
  if (!loaded.ok) return apiError(503, 'lookup_failed', 'Could not load your analyses. Please try again.');
  if (loaded.lines.length === 0) return NextResponse.json({ summary: '' });

  const limited = await rateLimit(req, 'cumulativeSummary', { userId: user.id });
  if (!limited.ok) return limited.response;
  const budget = await checkAiBudget('cumulative_summary', user.id);
  if (!budget.ok) return budget.response;

  try {
    const summary = await cumulativeSummary(loaded.lines, profile, { feature: 'cumulative_summary', userId: user.id, usageId: budget.usageId });
    return NextResponse.json({ summary });
  } catch (e) {
    return aiFailure(e, 'Cumulative summary');
  }
}
