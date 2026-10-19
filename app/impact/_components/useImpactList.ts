'use client';

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { createClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/api';
import { ROW_COLUMNS, shownRows, type PolicyAnalysisRow } from './impactModel';

/*
 * Everything My Impact loads, in one place: the user's saved analyses (one
 * query, newest first), the selection the cumulative tab sums, and the AI
 * combined summary, asked for 700 ms after the selection settles. The page
 * and its views only lay this out.
 *
 * `policy` (the ?policy= deep link) opens that analysis's line when it loads.
 */

export interface ImpactList {
  analyses: PolicyAnalysisRow[];
  loading: boolean;
  /** The analyses couldn't be read (the list is then empty, but not because there are none). */
  failed: boolean;
  /** Reads them again (after a failure). */
  reload: () => void;
  /** The analysis whose line is open (its summary showing), if any. */
  openId: string | null;
  setOpenId: Dispatch<SetStateAction<string | null>>;
  checkedIds: Set<string>;
  setCheckedIds: (ids: Set<string>) => void;
  checkedAnalyses: PolicyAnalysisRow[];
  /** The selected analyses' combined yearly impact. */
  netImpact: number;
  cumSummary: string;
  cumLoading: boolean;
}

export function useImpactList(policyParam: string | null): ImpactList {
  const [analyses, setAnalyses] = useState<PolicyAnalysisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [cumSummary, setCumSummary] = useState('');
  const [cumLoading, setCumLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setLoading(false);
          return;
        }
        try {
          const { data, error: dbErr } = await supabase
            .from('analyzed_policies')
            .select(ROW_COLUMNS)
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false });
          if (cancelled) return;
          if (dbErr) {
            console.error('Analyses load error:', dbErr);
            setFailed(true);
          } else {
            const rows = shownRows((data || []) as unknown as PolicyAnalysisRow[]);
            setFailed(false);
            setAnalyses(rows);
            setCheckedIds(new Set(rows.map((r) => r.id)));
            if (policyParam) {
              const found = rows.find((r) => r.policy_id === policyParam);
              if (found) setOpenId(found.id);
            }
          }
        } catch (e) {
          console.error('Failed to load analyses:', e);
          if (!cancelled) setFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [policyParam, attempt]);

  const reload = useCallback(() => {
    setLoading(true);
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  const checkedAnalyses = useMemo(() => analyses.filter((a) => checkedIds.has(a.id)), [analyses, checkedIds]);
  const netImpact = useMemo(() => checkedAnalyses.reduce((sum, a) => sum + (a.dollar_impact || 0), 0), [checkedAnalyses]);
  const checkedKey = useMemo(() => checkedAnalyses.map((a) => a.id).sort().join(','), [checkedAnalyses]);

  // AI cumulative summary (debounced on selection change)
  useEffect(() => {
    if (checkedAnalyses.length === 0) {
      setCumSummary('');
      return;
    }
    let cancelled = false;
    setCumLoading(true);
    const policyIds = checkedAnalyses.map((a) => a.policy_id).slice(0, 50);
    const summarize = async () => {
      const res = await apiFetch<{ summary: string }>('/api/cumulative-summary', { body: { policyIds } });
      if (cancelled) return;
      setCumSummary(res.ok ? res.data.summary || '' : '');
      setCumLoading(false);
    };
    const t = setTimeout(() => {
      void summarize();
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedKey]);

  return {
    analyses,
    loading,
    failed,
    reload,
    openId,
    setOpenId,
    checkedIds,
    setCheckedIds,
    checkedAnalyses,
    netImpact,
    cumSummary,
    cumLoading,
  };
}
