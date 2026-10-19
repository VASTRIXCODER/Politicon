'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestAnalysis } from '@/lib/analysisClient';
import { coerceFullAnalysis } from '@/lib/analysisSchema';
import { apiFetch } from '@/lib/api';
import { playCue } from '@/lib/sound';
import { createClient } from '@/lib/supabase/client';
import { policyCategory, track } from '@/lib/track';
import type { FullAnalysis } from '@/types';
import { policyFromAnalysis, snapshotFromRow, type DetailTab, type ProfileSnapshot } from './detailModel';

/*
 * Everything the impact detail page loads and does, so page.tsx only lays
 * it out: the stored analysis and the profile it was based on, following a
 * generation already running (started from the dashboard or another tab),
 * starting one (or a forced re-analysis), staleness against the current
 * profile, and deleting the analysis.
 */

export interface ImpactDetail {
  analysis: FullAnalysis | null;
  profile: ProfileSnapshot | null;
  loading: boolean;
  generating: boolean;
  notFound: boolean;
  /** A summary-only analysis from before the full breakdown existed. */
  legacy: boolean;
  analyzedAt: string | null;
  generateError: string | null;
  /** The financial profile changed after this analysis was made. */
  stale: boolean;
  tab: DetailTab;
  setTab: (_t: DetailTab) => void;
  /** Start a generation (force: re-analyze even though one is stored). */
  generate: (_force?: boolean) => void;
  /** Deletes the analysis; on success goes to My Impact, otherwise resolves with the error to show. */
  deleteAnalysis: () => Promise<string | null>;
}

export function useImpactDetail(policyId: string): ImpactDetail {
  const router = useRouter();

  const [analysis, setAnalysis] = useState<FullAnalysis | null>(null);
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<DetailTab>('overview');
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [legacy, setLegacy] = useState(false);

  const deleteAnalysis = useCallback(async (): Promise<string | null> => {
    const res = await apiFetch(`/api/analyses/${encodeURIComponent(policyId)}`, { method: 'DELETE' });
    if (res.ok) {
      router.push('/impact');
      return null;
    }
    return res.message;
  }, [policyId, router]);

  const generationAbort = useRef<AbortController | null>(null);
  useEffect(() => () => generationAbort.current?.abort(), []);

  // The category of the analysis on screen, for the request event (read when generate() runs).
  const categoryRef = useRef<string | undefined>(undefined);
  categoryRef.current = analysis?.category;

  /** Start a generation, or with followOnly just wait for one that's already running. */
  async function run(force = false, followOnly = false) {
    generationAbort.current?.abort();
    generationAbort.current = new AbortController();
    setGenerating(true);
    setGenerateError(null);
    // Following a job started elsewhere isn't a new request.
    if (!followOnly) track('analysis_requested', { source: 'impact', category: policyCategory(categoryRef.current) });
    const res = await requestAnalysis(policyId, { force, followOnly, signal: generationAbort.current.signal });
    if (res.ok) {
      track('analysis_ready', { source: 'impact', category: policyCategory(res.analysis.category), status: res.fresh ? 'fresh' : 'cached' });
      setAnalysis(coerceFullAnalysis(res.analysis as unknown as Record<string, unknown>, policyFromAnalysis(policyId, res.analysis)));
      if (res.profileSnapshot) setProfile(res.profileSnapshot as ProfileSnapshot);
      setNotFound(false);
      setLegacy(false);
      // Only a generation that just finished is "new"; a stored result keeps its own date and staleness.
      if (res.fresh) {
        setAnalyzedAt(new Date().toISOString());
        setStale(false);
        // A warm chime when the analysis the visitor asked for arrives (silent unless sound is on).
        playCue('chime');
      }
    } else if (!res.cancelled) {
      setGenerateError(res.message);
    }
    setGenerating(false);
  }

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    // A generation already running (started from the dashboard or another tab) is followed, not restarted.
    let followRunningJob = false;

    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setNotFound(true); setLoading(false); return; }

        const [{ data: prof }, { data: row, error: rowError }] = await Promise.all([
          supabase
            .from('user_profiles')
            .select('income_range, state, filing_status, housing_situation, employment_status, dependents_count, debt_types, financial_updated_at')
            .eq('id', user.id)
            .maybeSingle(),
          supabase
            .from('analyzed_policies')
            .select('analysis, updated_at, profile_snapshot, profile_version, policy_title, category, generation_status, generation_started_at, generation_error')
            .eq('user_id', user.id)
            .eq('policy_id', policyId)
            .maybeSingle(),
        ]);
        if (cancelled) return;
        if (rowError) throw rowError;

        const stored = row?.analysis as (FullAnalysis & { legacy?: boolean }) | undefined;
        // A pending row is followed; the server's status check decides right away
        // whether that job is still alive, so no clock comparison happens here.
        const jobRunning = row?.generation_status === 'pending';
        if (row?.generation_status === 'failed' && row.generation_error) {
          setGenerateError(`The last attempt to analyze this failed: ${row.generation_error}`);
        }

        if (stored && stored.legacy) {
          // Summary-only analysis from before the full breakdown existed.
          setLegacy(true);
          followRunningJob = jobRunning;
        } else if (stored && Object.keys(stored).length > 0) {
          // Normalize on read so older analyses render with the current UI.
          setAnalysis(coerceFullAnalysis(stored as unknown as Record<string, unknown>, {
            ...policyFromAnalysis(policyId, stored), title: row!.policy_title || stored.policyTitle || policyId,
          }));
          setAnalyzedAt(row!.updated_at);
          // Show the profile the analysis was actually based on.
          setProfile((row!.profile_snapshot as ProfileSnapshot | null) || (prof ? snapshotFromRow(prof) : null));
          const profileChanged = prof?.financial_updated_at
            && (!row!.profile_version || new Date(row!.profile_version) < new Date(prof.financial_updated_at));
          setStale(!!profileChanged);
          setLoading(false);
          if (jobRunning) setGenerating(true); // a re-analysis is in progress
          followRunningJob = jobRunning;
          return;
        } else {
          followRunningJob = jobRunning;
        }

        // 2) No analysis yet: the user starts generation explicitly (see generate()),
        //    unless one is already running, which we follow.
        if (!cancelled) setNotFound(true);
      } catch (e) {
        console.error('Detail load error:', e);
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) { setGenerating(false); setLoading(false); }
      }
    }

    void load().then(() => {
      if (followRunningJob && !cancelled) void run(false, true);
    });
    return () => { cancelled = true; };
    // Loads once per policy; run() only reads policyId, refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policyId]);

  return {
    analysis, profile, loading, generating, notFound, legacy, analyzedAt, generateError, stale, tab, setTab,
    generate: (force = false) => { void run(force); },
    deleteAnalysis,
  };
}
