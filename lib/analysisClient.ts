'use client';

import { apiFetch } from '@/lib/api';
import type { FullAnalysis } from '@/types';

const POLL_MS = 3000;
/** A little longer than the server's own limit for a pending job. */
const MAX_WAIT_MS = 6 * 60 * 1000 + 2 * POLL_MS;

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

interface JobStatus {
  status: 'none' | 'pending' | 'ready' | 'failed';
  error?: string | null;
  analysis?: FullAnalysis | null;
  profileSnapshot?: Record<string, unknown> | null;
}

/**
 * Wait for the user's analysis job for this policy to finish. The server
 * judges whether a pending job is still alive, so client clock skew can't
 * matter. With checkFirst, the first check happens immediately (used when
 * following a job that may already be dead).
 */
async function followJob(policyId: string, signal: AbortSignal | undefined, checkFirst: boolean): Promise<AnalysisResult> {
  const startedWaiting = Date.now();
  let first = true;
  while (Date.now() - startedWaiting < MAX_WAIT_MS) {
    if (!(first && checkFirst) && !(await sleep(POLL_MS, signal))) return cancelled();
    first = false;
    const res = await apiFetch<JobStatus>(`/api/analyze?policyId=${encodeURIComponent(policyId)}`, { signal });
    if (signal?.aborted) return cancelled();
    if (!res.ok) {
      if (res.status === 0 || res.status >= 500 || res.status === 429) continue; // transient; keep waiting
      return failed(res.message);
    }
    const job = res.data;
    if (job.status === 'ready' && job.analysis) {
      return { ok: true, analysis: job.analysis, profileSnapshot: job.profileSnapshot ?? null, fresh: true };
    }
    if (job.status === 'failed') return failed(job.error || 'The analysis failed. Please try again.');
    if (job.status === 'none') return failed('The analysis could not be started. Please try again.');
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
  if (opts.followOnly) return followJob(policyId, opts.signal, true);

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
  return followJob(policyId, opts.signal, false);
}
