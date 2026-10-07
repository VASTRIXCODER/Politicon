import 'server-only';
import type { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiError } from '@/lib/server/http';
import { AI_MODEL, modelPrice, type AiFeature } from '@/lib/server/aiConfig';

export type { AiFeature };

/** Per-user rolling-24h call caps. Override with AI_DAILY_LIMIT_<FEATURE>. */
const DEFAULT_DAILY_LIMITS: Record<AiFeature, number> = {
  analyze: 10,
  feed: 8,
  advisor: 60,
  advisor_policy: 30,
  insight: 20,
  cumulative_summary: 40,
};

function dailyLimit(feature: AiFeature): number {
  const override = Number(process.env[`AI_DAILY_LIMIT_${feature.toUpperCase()}`]);
  return Number.isFinite(override) && override > 0 ? override : DEFAULT_DAILY_LIMITS[feature];
}

function globalDailyUsd(): number {
  const v = Number(process.env.AI_GLOBAL_DAILY_USD);
  return Number.isFinite(v) && v > 0 ? v : 50;
}

/** AI_KILL_SWITCH=1 disables every AI feature; AI_DISABLED_FEATURES=feed,insight disables some. */
function isDisabled(feature: AiFeature): boolean {
  const kill = (process.env.AI_KILL_SWITCH || '').trim().toLowerCase();
  if (kill === '1' || kill === 'true' || kill === 'on') return true;
  const disabled = (process.env.AI_DISABLED_FEATURES || '').split(',').map((s) => s.trim().toLowerCase());
  return disabled.includes(feature);
}

/**
 * Check the kill switch and atomically reserve one call against the user's
 * quota and the global spend ceiling. Pass the returned usageId through to the
 * Claude call so its token usage is written onto the reserved row.
 * Fails closed: if the budget can't be checked, the call is refused.
 */
export async function checkAiBudget(
  feature: AiFeature,
  userId: string,
): Promise<{ ok: true; usageId: number } | { ok: false; response: NextResponse }> {
  if (isDisabled(feature)) {
    return { ok: false, response: apiError(503, 'ai_disabled', 'This AI feature is temporarily turned off. Please check back soon.') };
  }
  try {
    const { data, error } = await createAdminClient().rpc('reserve_ai_call', {
      p_user_id: userId,
      p_feature: feature,
      p_model: AI_MODEL,
      p_user_daily_limit: dailyLimit(feature),
      p_global_daily_usd: globalDailyUsd(),
    });
    const row = Array.isArray(data)
      ? (data[0] as { allowed: boolean; reason: string | null; usage_id: number | null } | undefined)
      : undefined;
    if (error || !row) throw error || new Error('reserve_ai_call returned no row');
    if (row.allowed && row.usage_id) return { ok: true, usageId: row.usage_id };
    if (row.reason === 'user_quota') {
      return { ok: false, response: apiError(429, 'daily_quota', "You've reached today's limit for this feature. It resets within 24 hours.", 3600) };
    }
    return { ok: false, response: apiError(503, 'ai_capacity', 'AI features are at capacity right now. Please try again later.', 3600) };
  } catch (e) {
    console.error(`AI budget check failed (${feature}):`, e);
    return { ok: false, response: apiError(503, 'ai_unavailable', 'AI features are temporarily unavailable. Please try again shortly.', 30) };
  }
}

export interface AiUsageRecord {
  /** Row reserved by checkAiBudget. */
  usageId: number;
  feature: AiFeature;
  userId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  stopReason?: string | null;
  requestId?: string | null;
  latencyMs: number;
  ok: boolean;
}

/** Finalize the reserved ledger row for one Claude call. Never throws. */
export async function recordAiUsage(r: AiUsageRecord): Promise<void> {
  const cacheRead = r.cacheReadTokens || 0;
  const cacheWrite = r.cacheWriteTokens || 0;
  const cost =
    ((r.inputTokens + cacheWrite * 1.25 + cacheRead * 0.1) * modelPrice(r.model).input + r.outputTokens * modelPrice(r.model).output) / 1_000_000;
  try {
    const { error } = await createAdminClient().from('ai_usage').update({
      model: r.model,
      input_tokens: r.inputTokens,
      output_tokens: r.outputTokens,
      cache_read_tokens: cacheRead,
      cache_write_tokens: cacheWrite,
      cost_usd: Number(cost.toFixed(6)),
      stop_reason: r.stopReason ?? null,
      request_id: r.requestId ?? null,
      latency_ms: r.latencyMs,
      ok: r.ok,
      pending: false,
    }).eq('id', r.usageId);
    if (error) console.error('AI usage update failed:', error);
  } catch (e) {
    console.error('AI usage update failed:', e);
  }
}
