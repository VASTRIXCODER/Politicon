'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { requestAnalysis } from '@/lib/analysisClient';
import { apiFetch } from '@/lib/api';
import { policyCategory, track } from '@/lib/track';
import { useToast } from '@/components/ui/Toast';
import type { DiscoveredPolicy } from '@/types';
import { PROFILE_COLUMNS, type AnalysisTotals, type DashboardProfileRow, type PolicyAnalysisRow } from './dashboardModel';

/*
 * Everything the dashboard loads and does, moved here unchanged from the
 * page so its sections can be plain components: the profile (the name for
 * the greeting and, from the same row, the answers the household is drawn
 * from, see profileHousehold.ts), the latest analyses and their totals, the
 * optional portfolio insight, the live subscription to the user's analyses,
 * and the policy feed with its background-build polling, analysis jobs and
 * dismissals.
 */

type FeedPolicy = DiscoveredPolicy;

const FEED_POLL_MS = 5000;
const FEED_POLL_ATTEMPTS = 60; // ~5 minutes
const RECENT_LIMIT = 12;

export interface DashboardData {
  toast: ReactNode;
  loading: boolean;
  firstName: string;
  /** The saved profile's household answers (profileHousehold.ts draws them); null until it loads, or if it didn't. */
  profile: DashboardProfileRow | null;
  analyses: PolicyAnalysisRow[];
  totals: AnalysisTotals | null;
  portfolioInsight: string;
  insightLoading: boolean;
  feed: {
    policies: FeedPolicy[];
    loading: boolean;
    refreshing: boolean;
    updatedAt: string | null;
    error: string | null;
    needsOnboarding: boolean;
    analyzingIds: Set<string>;
    analyzedIds: Set<string>;
    impactById: Map<string, number>;
    headingRef: RefObject<HTMLHeadingElement | null>;
    load: (refresh?: boolean) => Promise<void>;
    analyze: (policy: FeedPolicy) => Promise<void>;
    askAdvisor: (policy: FeedPolicy) => void;
    dismiss: (policy: FeedPolicy) => Promise<string | null>;
  };
}

export function useDashboardData(): DashboardData {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [profile, setProfile] = useState<DashboardProfileRow | null>(null);
  const [analyses, setAnalyses] = useState<PolicyAnalysisRow[]>([]);
  const [totals, setTotals] = useState<AnalysisTotals | null>(null);
  const [portfolioInsight, setPortfolioInsight] = useState('');
  const [loading, setLoading] = useState(true);
  const [insightLoading, setInsightLoading] = useState(false);
  const [feedPolicies, setFeedPolicies] = useState<FeedPolicy[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedUpdatedAt, setFeedUpdatedAt] = useState<string | null>(null);
  const feedUpdatedAtRef = useRef<string | null>(null);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(() => new Set());
  // Everything in flight (analysis jobs, feed polling) stops when the page
  // unmounts. The controller is created per mount, so React Strict Mode's
  // mount → unmount → mount in development gets a fresh one.
  const unmounted = useRef<AbortController>(new AbortController());
  const feedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasFeed = useRef(false);
  const feedHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    unmounted.current = controller;
    void loadFeed(false);
    return () => {
      controller.abort();
      if (feedTimer.current) clearTimeout(feedTimer.current);
    };
    // Runs once per mount; loadFeed reads the controller from the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { toast, showToast } = useToast();
  const [feedError, setFeedError] = useState<string | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  // The list shows the latest few; totals always cover every analysis.
  async function loadTotals() {
    const supabase = createClient();
    const { data } = await supabase.rpc('analysis_totals');
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return;
    // pending_annual: the part of the net from policies not recorded as enacted (the ledger's "isn't law" note).
    const pending = row.pending_annual == null ? NaN : Number(row.pending_annual);
    setTotals({ count: Number(row.analysis_count) || 0, netAnnual: Number(row.net_annual) || 0, pendingAnnual: Number.isFinite(pending) ? pending : null });
  }

  async function refetchAnalyses() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('policy_analyses')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(RECENT_LIMIT);
    if (data) setAnalyses(data);
    void loadTotals();
  }

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      try {
        const { data: { user }, error: userErr } = await supabase.auth.getUser();
        if (userErr || !user) { setLoading(false); return; }

        try {
          // The same row gives the greeting its name and the avatar its household.
          const { data: row } = await supabase
            .from('user_profiles')
            .select(PROFILE_COLUMNS)
            .eq('id', user.id)
            .single<DashboardProfileRow>();
          if (row?.first_name) setFirstName(row.first_name);
          else if (user.user_metadata?.first_name) setFirstName(user.user_metadata.first_name as string);
          else setFirstName(user.email?.split('@')[0] || 'there');
          setProfile(row ?? null);
        } catch {
          if (user.user_metadata?.first_name) setFirstName(user.user_metadata.first_name as string);
          else setFirstName(user.email?.split('@')[0] || 'there');
        }

        try {
          const { data: analysesData, error: analysesErr } = await supabase
            .from('policy_analyses')
            .select('*')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false })
            .limit(RECENT_LIMIT);
          void loadTotals();

          if (analysesErr) {
            if ((analysesErr as { code?: string }).code !== '42P01') console.error('policy_analyses load error:', analysesErr);
          } else {
            setAnalyses(analysesData || []);
            if (analysesData && analysesData.length > 0) void loadInsight();
          }
        } catch (e) {
          console.error('Failed to load analyses:', e);
        }
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  // Realtime: keep net impact + analyzed list live as this user's analyses change
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || cancelled) return;
      channel = supabase
        .channel(`dashboard-analyses-${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'analyzed_policies', filter: `user_id=eq.${user.id}` },
          () => { void refetchAnalyses(); })
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
    // Subscribes once per mount; refetchAnalyses only uses the client and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The insight is optional and loads after the page is already usable.
  async function loadInsight() {
    setInsightLoading(true);
    const res = await apiFetch<{ insight: string }>('/api/insight', { method: 'POST' });
    if (res.ok && res.data.insight) setPortfolioInsight(res.data.insight);
    setInsightLoading(false);
  }

  // Feeds are built in the background: a 202 means one is being generated, so
  // keep showing whatever we have and check back until it's ready.
  async function loadFeed(refresh = false, attempt = 0, refreshStartedAt?: string | null) {
    if (unmounted.current.signal.aborted) return;
    if (attempt === 0) {
      if (refresh) setFeedRefreshing(true); else setFeedLoading(true);
      setFeedError(null);
    }
    const res = await apiFetch<{
      policies?: FeedPolicy[]; updatedAt?: string | null; generating?: boolean; stale?: boolean; failed?: boolean;
    }>('/api/policies/feed', { ...(refresh && attempt === 0 ? { method: 'POST' } : {}), signal: unmounted.current.signal });
    if (unmounted.current.signal.aborted) return;
    if (refresh && attempt === 0) track('feed_refreshed', { source: 'dashboard', status: res.ok ? 'ok' : 'error' });
    // A refresh is judged against the feed that was showing when it started.
    const baseline = attempt === 0 && refresh ? feedUpdatedAtRef.current : refreshStartedAt;

    const showPolicies = (list: FeedPolicy[] | undefined) => {
      if (!Array.isArray(list)) return;
      setFeedPolicies(list);
      hasFeed.current = list.length > 0;
    };

    if (res.ok && res.status === 202) {
      if (res.data.policies?.length) {
        showPolicies(res.data.policies);
        setFeedLoading(false);
      }
      setFeedRefreshing(true);
      if (attempt < FEED_POLL_ATTEMPTS) {
        feedTimer.current = setTimeout(() => { void loadFeed(false, attempt + 1, baseline ?? null); }, FEED_POLL_MS);
        return;
      }
      if (hasFeed.current) showToast('Your feed is taking longer than usual to update. Check back in a few minutes.', 'error');
      else setFeedError('Your feed is taking longer than usual. Please check back in a few minutes.');
    } else if (res.ok) {
      showPolicies(res.data.policies);
      if (res.data.updatedAt) {
        setFeedUpdatedAt(res.data.updatedAt);
        feedUpdatedAtRef.current = res.data.updatedAt;
      }
      // A refresh that ended without a newer feed failed, even though the old one is still showing.
      const refreshed = baseline === undefined || (res.data.updatedAt && res.data.updatedAt !== baseline);
      if (attempt > 0 && baseline !== undefined && (!refreshed || res.data.stale || res.data.failed)) {
        showToast("We couldn't refresh your feed just now. Showing your previous one.", 'error');
      }
    } else if (res.code === 'needs_onboarding') {
      setNeedsOnboarding(true);
    } else if (refresh || hasFeed.current) {
      // Keep the current feed when a refresh can't start or a poll fails.
      showToast(res.message, 'error');
    } else {
      setFeedError(res.message);
    }
    setFeedLoading(false);
    setFeedRefreshing(false);
  }

  async function handleAnalyze(policy: FeedPolicy) {
    if (analyzingIds.has(policy.id)) return;
    setAnalyzingIds(prev => new Set(prev).add(policy.id));
    const category = policyCategory(policy.category);
    track('analysis_requested', { source: 'dashboard', category });
    // Analyses run in the background; this resolves when the job finishes.
    const res = await requestAnalysis(policy.id, { signal: unmounted.current.signal });
    if (unmounted.current.signal.aborted) return;
    if (res.ok) {
      track('analysis_ready', { source: 'dashboard', category, status: res.fresh ? 'fresh' : 'cached' });
      showToast(`Analysis complete for "${policy.title}"`);
      await refetchAnalyses();
    } else if (!res.cancelled) {
      showToast(res.message, 'error');
    }
    setAnalyzingIds(prev => {
      const next = new Set(prev);
      next.delete(policy.id);
      return next;
    });
  }

  function handleAskAdvisor(policy: FeedPolicy) {
    router.push(`/advisor?policyId=${encodeURIComponent(policy.id)}`);
  }

  /** "Not relevant to me": recorded as feedback, and the policy leaves the feed. Returns an error message on failure. */
  async function handleDismiss(policy: FeedPolicy): Promise<string | null> {
    const res = await apiFetch('/api/feedback', {
      body: { targetType: 'feed_item', targetId: policy.id, rating: 'not_relevant' },
    });
    if (!res.ok) return res.message;
    track('policy_dismissed', { source: 'dashboard', category: policyCategory(policy.category) });
    setFeedPolicies(prev => prev.filter(p => p.id !== policy.id));
    showToast(`Hidden “${policy.title}” from your feed.`);
    return null;
  }

  const analyzedIds = useMemo(() => new Set(analyses.map(a => a.policy_id)), [analyses]);
  const impactById = useMemo(() => new Map(analyses.map(a => [a.policy_id, a.dollar_impact] as const)), [analyses]);

  return {
    toast,
    loading,
    firstName,
    profile,
    analyses,
    totals,
    portfolioInsight,
    insightLoading,
    feed: {
      policies: feedPolicies,
      loading: feedLoading,
      refreshing: feedRefreshing,
      updatedAt: feedUpdatedAt,
      error: feedError,
      needsOnboarding,
      analyzingIds,
      analyzedIds,
      impactById,
      headingRef: feedHeadingRef,
      load: (refresh = false) => loadFeed(refresh),
      analyze: handleAnalyze,
      askAdvisor: handleAskAdvisor,
      dismiss: handleDismiss,
    },
  };
}
