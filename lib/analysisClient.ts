'use client';

import { apiFetch } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';
import type { FullAnalysis } from '@/types';

const POLL_MS = 3000;
/** Matches the server: a job pending longer than this has died. */
const MAX_WAIT_MS = 6 * 60 * 1000 + POLL_MS;

export type AnalysisResult =
  | {
      ok: true;
      analysis: FullAnalysis;
      profileSnapshot: Record<string, unknown> | null;
      /** True when a generation finished during this call (not a stored result). */
      fresh: boolean;
    }
  | { ok: false; cancelled: boolean; message: string };

const cancelled = (): AnalysisResult => ({ ok: false, cancelled: true, message: 'Cancelled.' });
const failed = (message: string): AnalysisResult => ({ ok: false, cancelled: false, message });

function sleep(ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false);
    const onAbort = () => { clearTimeout(timer); resolve(false); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(true); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Wait for the user's analysis row for this policy to finish generating. */
async function followJob(policyId: string, signal?: AbortSignal): Promise<AnalysisResult> {
  const supabase = createClient();
  const startedWaiting = Date.now();
  while (Date.now() - startedWaiting < MAX_WAIT_MS) {
    if (!(await sleep(POLL_MS, signal))) return cancelled();
    let query = supabase
      .from('analyzed_policies')
      .select('analysis, generation_status, generation_error, profile_snapshot')
      .eq('policy_id', policyId);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query.maybeSingle();
    if (signal?.aborted) return cancelled();
    if (error) continue; // transient; keep waiting
    if (!data) return failed('The analysis could not be started. Please try again.');
    if (data.generation_status === 'ready' && data.analysis && Object.keys(data.analysis).length > 0) {
      return { ok: true, analysis: data.analysis as FullAnalysis, profileSnapshot: data.profile_snapshot ?? null, fresh: true };
    }
    if (data.generation_status === 'failed') {
      return failed(data.generation_error || 'The analysis failed. Please try again.');
    }
  }
  return failed('The analysis took too long. Please try again.');
}

/**
 * Get a policy's full analysis. Analyses run in the background (the API
 * answers 202), so this follows the job until it's ready or fails. With
 * `followOnly`, it only waits for a job that's already running and never
 * starts (or pays for) a new one.
 */
export async function requestAnalysis(
  policyId: string,
  opts: { force?: boolean; followOnly?: boolean; signal?: AbortSignal; onPending?: () => void } = {},
): Promise<AnalysisResult> {
  if (opts.followOnly) return followJob(policyId, opts.signal);

  const res = await apiFetch<{ status: string; analysis?: FullAnalysis; profileSnapshot?: Record<string, unknown> | null }>(
    '/api/analyze',
    { body: { policyId, ...(opts.force ? { force: true } : {}) }, signal: opts.signal },
  );
  if (opts.signal?.aborted) return cancelled();
  if (!res.ok) return failed(res.message);
  if (res.status === 200 && res.data.analysis) {
    return { ok: true, analysis: res.data.analysis, profileSnapshot: res.data.profileSnapshot ?? null, fresh: false };
  }

  opts.onPending?.();
  return followJob(policyId, opts.signal);
}
