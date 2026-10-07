'use client';

import { apiFetch } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';
import type { FullAnalysis } from '@/types';

const POLL_MS = 3000;
/** Matches the server: a job pending longer than this has died. */
const STALE_PENDING_MS = 6 * 60 * 1000;

export type AnalysisResult =
  | { ok: true; analysis: FullAnalysis; profileSnapshot: Record<string, unknown> | null }
  | { ok: false; message: string };

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });

/**
 * Ask the server for a policy's full analysis and wait for it. Analyses run in
 * the background (202), so this follows the job until it is ready or fails.
 */
export async function requestAnalysis(
  policyId: string,
  opts: { force?: boolean; signal?: AbortSignal; onPending?: () => void } = {},
): Promise<AnalysisResult> {
  const res = await apiFetch<{ status: string; analysis?: FullAnalysis; profileSnapshot?: Record<string, unknown> | null }>(
    '/api/analyze',
    { body: { policyId, ...(opts.force ? { force: true } : {}) }, signal: opts.signal },
  );
  if (!res.ok) return { ok: false, message: res.message };
  if (res.status === 200 && res.data.analysis) {
    return { ok: true, analysis: res.data.analysis, profileSnapshot: res.data.profileSnapshot ?? null };
  }

  opts.onPending?.();
  const supabase = createClient();
  const startedWaiting = Date.now();
  try {
    while (Date.now() - startedWaiting < STALE_PENDING_MS + POLL_MS) {
      await sleep(POLL_MS, opts.signal);
      const { data, error } = await supabase
        .from('analyzed_policies')
        .select('analysis, generation_status, generation_error, generation_started_at, profile_snapshot')
        .eq('policy_id', policyId)
        .maybeSingle();
      if (error) continue; // transient; keep waiting
      if (!data) return { ok: false, message: 'The analysis could not be started. Please try again.' };
      if (data.generation_status === 'ready' && data.analysis && Object.keys(data.analysis).length > 0) {
        return { ok: true, analysis: data.analysis as FullAnalysis, profileSnapshot: data.profile_snapshot ?? null };
      }
      if (data.generation_status === 'failed') {
        return { ok: false, message: data.generation_error || 'The analysis failed. Please try again.' };
      }
      const started = data.generation_started_at ? new Date(data.generation_started_at).getTime() : startedWaiting;
      if (Date.now() - started > STALE_PENDING_MS) {
        return { ok: false, message: 'The analysis took too long. Please try again.' };
      }
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return { ok: false, message: 'Cancelled.' };
    throw e;
  }
  return { ok: false, message: 'The analysis took too long. Please try again.' };
}
