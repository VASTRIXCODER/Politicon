import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DiscoveredPolicy, Policy, PolicyRecord } from '@/types';
import { validRecord } from '@/lib/analysisSchema';

const POLICY_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function isValidPolicyId(id: string): boolean {
  return POLICY_ID.test(id);
}

function toPolicy(p: {
  id: string;
  title: string;
  summary: string;
  category: string;
  status: string;
  region: string;
  billNumber?: string;
  record?: PolicyRecord;
}): Policy {
  const status = (['proposed', 'passed', 'enacted', 'repealed', 'rejected'] as const).find((s) => s === p.status) || 'proposed';
  return {
    id: p.id,
    title: p.title,
    summary: p.summary,
    description: p.summary,
    category: p.category || 'taxes',
    status,
    date: new Date().toISOString(),
    source: 'Politicon policy feed',
    sourceUrl: p.record?.sourceUrl || '',
    governingBody: p.billNumber || p.region || 'Federal',
    region: p.region || 'Federal',
    confidenceLevel: 'medium',
    impacts: [],
    assumptions: [],
    tags: [],
    ...(p.record ? { record: p.record } : {}),
  };
}

/**
 * Resolve a policy id to its metadata from data the server produced for this
 * user (their feed, or an earlier analysis). Client-supplied titles and
 * descriptions are never trusted, so they can't be used to steer the model.
 */
export async function resolvePolicy(supabase: SupabaseClient, userId: string, policyId: string): Promise<Policy | null> {
  if (!isValidPolicyId(policyId)) return null;

  const { data: feed } = await supabase
    .from('user_policy_feed')
    .select('policies')
    .eq('user_id', userId)
    .maybeSingle();
  const items = Array.isArray(feed?.policies) ? (feed.policies as DiscoveredPolicy[]) : [];
  const match = items.find((p) => p && p.id === policyId);
  if (match) {
    return toPolicy({
      id: match.id,
      title: match.title,
      summary: match.summary || match.description || match.title,
      category: match.category,
      status: match.status,
      region: match.region,
      billNumber: match.billNumber,
      record: match.record,
    });
  }

  const { data: row } = await supabase
    .from('analyzed_policies')
    .select('policy_id, policy_title, category, status, bill_number, analysis')
    .eq('user_id', userId)
    .eq('policy_id', policyId)
    .maybeSingle();
  // A placeholder for a job that never produced an analysis isn't a source of policy details.
  const hasAnalysis = !!row?.analysis && Object.keys(row.analysis as object).length > 0;
  if (row && hasAnalysis) {
    const analysis = (row.analysis || {}) as { plainEnglishSummary?: string; record?: unknown };
    // The official record stored with the analysis keeps a re-analysis grounded
    // after the policy has left the feed.
    const record = validRecord(analysis.record);
    const official = record?.verified ? record : undefined;
    return toPolicy({
      id: row.policy_id,
      title: row.policy_title || policyId,
      summary: analysis.plainEnglishSummary || row.policy_title || policyId,
      category: row.category || 'taxes',
      status: official?.status || row.status || 'proposed',
      region: record?.region || 'Federal',
      billNumber: official?.billNumber || row.bill_number || undefined,
      record,
    });
  }

  return null;
}
