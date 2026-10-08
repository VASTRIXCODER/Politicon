'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { m } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Search, MessageSquare, Zap, BookOpen, RefreshCw, BarChart2, Layers } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { timeAgo } from '@/lib/utils';
import { formatUSD, impactTone } from '@/lib/format';
import GlassCard from '@/components/ui/GlassCard';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import CountUp from '@/components/ui/CountUp';
import { Tabs, TabList, Tab, TabPanel } from '@/components/ui/Tabs';
import { requestAnalysis } from '@/lib/analysisClient';
import { apiFetch } from '@/lib/api';
import FeedbackControls from '@/components/FeedbackControls';
import AiDisclaimer from '@/components/ui/AiDisclaimer';
import type { DiscoveredPolicy } from '@/types';
import PolicyFeedCard, { FeedSkeletonCard } from '@/components/PolicyFeedCard';
import { useToast } from '@/components/ui/Toast';
import Navbar from '@/components/layout/Navbar';
import AmbientBackground from '@/components/landing/AmbientBackground';

interface PolicyAnalysisRow {
  id: string;
  policy_id: string;
  policy_title: string;
  analysis_text: string;
  dollar_impact: number;
  category: string;
  created_at: string;
}

type FeedPolicy = DiscoveredPolicy;

// Violet-tinted action: primary-300 text keeps it at AA contrast on the tint.
const TINT_BUTTON = 'bg-primary/20 hover:bg-primary/30 border-primary/20 text-primary-300';
const signedUSD = (n: number) => formatUSD(n, { signed: true });
/** A short preview; the ellipsis only appears when something was cut. */
const excerpt = (text: string, max = 160) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);

const DASHBOARD_TABS = [
  { id: 'analyzed', label: 'Analyzed Policies', icon: BarChart2 },
  { id: 'cumulative', label: 'Cumulative Impact', icon: Layers },
] as const;

function SkeletonCard() {
  return (
    <div className="glass rounded-2xl p-5 animate-pulse backdrop-filter-none" aria-hidden>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="h-3 bg-white/10 rounded w-1/4 mb-3" />
          <div className="h-4 bg-white/10 rounded w-3/4 mb-2" />
          <div className="h-3 bg-white/10 rounded w-1/2" />
        </div>
        <div className="h-6 w-16 bg-white/10 rounded" />
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

const FEED_POLL_MS = 5000;
const FEED_POLL_ATTEMPTS = 60; // ~5 minutes
const RECENT_LIMIT = 12;

export default function DashboardPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [analyses, setAnalyses] = useState<PolicyAnalysisRow[]>([]);
  const [totals, setTotals] = useState<{ count: number; netAnnual: number } | null>(null);
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
    loadFeed(false);
    return () => {
      controller.abort();
      if (feedTimer.current) clearTimeout(feedTimer.current);
    };
    // Runs once per mount; loadFeed reads the controller from the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { toast, showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'analyzed' | 'cumulative'>('analyzed');
  const [feedError, setFeedError] = useState<string | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  // The list shows the latest few; totals always cover every analysis.
  async function loadTotals() {
    const supabase = createClient();
    const { data } = await supabase.rpc('analysis_totals');
    const row = Array.isArray(data) ? data[0] : data;
    if (row) setTotals({ count: Number(row.analysis_count) || 0, netAnnual: Number(row.net_annual) || 0 });
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
    loadTotals();
  }

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      try {
        const { data: { user }, error: userErr } = await supabase.auth.getUser();
        if (userErr || !user) { setLoading(false); return; }

        try {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('first_name')
            .eq('id', user.id)
            .single();
          if (profile?.first_name) setFirstName(profile.first_name);
          else if (user.user_metadata?.first_name) setFirstName(user.user_metadata.first_name as string);
          else setFirstName(user.email?.split('@')[0] || 'there');
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
          loadTotals();

          if (analysesErr) {
            if ((analysesErr as { code?: string }).code !== '42P01') console.error('policy_analyses load error:', analysesErr);
          } else {
            setAnalyses(analysesData || []);
            if (analysesData && analysesData.length > 0) loadInsight();
          }
        } catch (e) {
          console.error('Failed to load analyses:', e);
        }
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // Realtime: keep net impact + analyzed list live as this user's analyses change
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || cancelled) return;
      channel = supabase
        .channel(`dashboard-analyses-${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'analyzed_policies', filter: `user_id=eq.${user.id}` },
          () => { refetchAnalyses(); })
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
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
        feedTimer.current = setTimeout(() => loadFeed(false, attempt + 1, baseline ?? null), FEED_POLL_MS);
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
    // Analyses run in the background; this resolves when the job finishes.
    const res = await requestAnalysis(policy.id, { signal: unmounted.current.signal });
    if (unmounted.current.signal.aborted) return;
    if (res.ok) {
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
    setFeedPolicies(prev => prev.filter(p => p.id !== policy.id));
    showToast(`Hidden “${policy.title}” from your feed.`);
    return null;
  }

  const netImpact = totals?.netAnnual ?? analyses.reduce((sum, a) => sum + (a.dollar_impact || 0), 0);
  const topGain = useMemo(
    () => analyses.filter(a => a.dollar_impact > 0).reduce<typeof analyses[number] | null>((m, a) => (!m || a.dollar_impact > m.dollar_impact ? a : m), null),
    [analyses],
  );
  const topCost = useMemo(
    () => analyses.filter(a => a.dollar_impact < 0).reduce<typeof analyses[number] | null>((m, a) => (!m || a.dollar_impact < m.dollar_impact ? a : m), null),
    [analyses],
  );
  const analysisCount = totals?.count ?? analyses.length;
  const analyzedIds = useMemo(() => new Set(analyses.map(a => a.policy_id)), [analyses]);
  const impactById = useMemo(() => new Map(analyses.map(a => [a.policy_id, a.dollar_impact] as const)), [analyses]);

  return (
    <div className="min-h-screen relative">
      <AmbientBackground />
      {toast}
      <div className="relative z-10">
        <Navbar />
        <main id="main" tabIndex={-1} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">

          <m.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-10">
            {loading ? (
              <div className="animate-pulse" role="status">
                <span className="sr-only">Loading your dashboard…</span>
                <div className="h-8 bg-white/10 rounded w-64 mb-2" />
                <div className="h-4 bg-white/10 rounded w-48" />
              </div>
            ) : (
              <div>
                <h1 className="font-display text-3xl font-bold text-text-primary">
                  Good {getGreeting()}, <span className="gradient-text capitalize">{firstName}</span>
                </h1>
                <p className="text-text-muted text-sm mt-1">Here&apos;s your personalized policy impact overview.</p>
              </div>
            )}
          </m.div>

          <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
            className="glass-strong rounded-3xl p-8 mb-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/5" />
            <div className="relative z-10">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <p className="text-xs font-mono-data text-text-muted uppercase tracking-widest mb-3">Net Annual Impact — Your Analyzed Policies</p>
                  {loading ? (
                    <div className="h-14 bg-white/10 rounded animate-pulse w-56" />
                  ) : analyses.length === 0 ? (
                    <div className="font-mono-data text-4xl font-bold text-text-muted">$0/yr</div>
                  ) : (
                    <div className={`font-mono-data text-5xl sm:text-6xl font-bold ${netImpact >= 0 ? 'gradient-text-gold' : 'text-red-400'}`}>
                      <CountUp value={Math.round(netImpact)} duration={2000} format={signedUSD} suffix="/yr" srLabel={`${signedUSD(netImpact)} per year`} />
                    </div>
                  )}
                  <p className="text-text-muted text-sm mt-2">
                    {analysisCount === 0 ? 'No policies analyzed yet' : `Across ${analysisCount} ${analysisCount === 1 ? 'policy' : 'policies'} analyzed`}
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <Button href="/advisor" variant="ghost" className={`justify-start px-5 whitespace-nowrap ${TINT_BUTTON}`} icon={<Search className="w-4 h-4" />}>
                    Analyze a Policy
                  </Button>
                  <Button href="/advisor" variant="ghost" className="justify-start px-5 whitespace-nowrap font-normal text-text-muted hover:text-text-primary hover:border-white/16" icon={<MessageSquare className="w-4 h-4" />}>
                    Ask the Policy Guide
                  </Button>
                </div>
              </div>

              {analyses.length > 0 && (
                <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 pt-6 border-t border-white/8">
                  {[
                    {
                      label: 'Biggest gain',
                      value: topGain ? formatUSD(topGain.dollar_impact, { signed: true, suffix: '/yr' }) : '—',
                      tone: topGain ? 'text-emerald-400' : 'text-text-muted',
                      sub: topGain?.policy_title || 'None among recent analyses',
                    },
                    {
                      label: 'Biggest cost',
                      value: topCost ? formatUSD(topCost.dollar_impact, { signed: true, suffix: '/yr' }) : '—',
                      tone: topCost ? 'text-red-400' : 'text-text-muted',
                      sub: topCost?.policy_title || 'None among recent analyses',
                    },
                  ].map(s => (
                    <div key={s.label} className="text-center min-w-0">
                      <dt className="text-meta font-mono-data uppercase tracking-widest text-text-muted">{s.label}</dt>
                      <dd className={`font-mono-data text-lg font-bold mt-1 ${s.tone}`}>{s.value}</dd>
                      <dd className="text-meta text-text-muted mt-0.5 truncate" title={s.sub}>{s.sub}</dd>
                    </div>
                  ))}
                  <div className="text-center">
                    <dt className="text-meta font-mono-data uppercase tracking-widest text-text-muted">Policies analyzed</dt>
                    <dd className="font-mono-data text-lg font-bold mt-1 text-text-primary">{analysisCount}</dd>
                    <dd className="text-meta mt-0.5">
                      <Link href="/impact" className="text-primary-300 hover:underline underline-offset-2">View all<span className="sr-only"> analyzed policies</span></Link>
                    </dd>
                  </div>
                </dl>
              )}
            </div>
          </m.div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabList label="Dashboard views" className="mb-6 glass rounded-2xl p-1 w-fit">
              {DASHBOARD_TABS.map(tab => (
                <Tab
                  key={tab.id}
                  value={tab.id}
                  icon={<tab.icon className="w-3.5 h-3.5" />}
                  className="border border-transparent aria-selected:bg-primary/20 aria-selected:border-primary/20"
                >
                  {tab.label}
                  {tab.id === 'analyzed' && analyses.length > 0 && (
                    <span className="text-meta font-mono-data bg-primary/10 text-primary-300 px-1.5 py-0.5 rounded-full">{analyses.length}</span>
                  )}
                </Tab>
              ))}
            </TabList>

            <TabPanel value="analyzed">
              <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="font-display text-xl font-semibold text-text-primary">Analyzed Policies</h2>
                      <Link href="/impact" className="text-xs text-primary-300 hover:text-text-primary flex items-center gap-1">
                        Full analysis <ArrowRight className="w-3 h-3" aria-hidden />
                      </Link>
                    </div>

                    {loading ? (
                      <div className="space-y-4" role="status">
                        <span className="sr-only">Loading your analyses…</span>
                        {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
                      </div>
                    ) : analyses.length === 0 ? (
                      <GlassCard className="rounded-2xl p-10 text-center">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                          <Search className="w-6 h-6 text-primary-300" aria-hidden />
                        </div>
                        <h3 className="font-medium text-text-primary mb-2">No policies analyzed yet</h3>
                        <p className="text-sm text-text-muted mb-6 max-w-xs mx-auto">Browse the policy feed below to get started.</p>
                      </GlassCard>
                    ) : (
                      <div className="space-y-4">
                        {analyses.map((analysis, i) => (
                          <GlassCard key={analysis.id} delay={Math.min(i, 6) * 0.07} className="rounded-2xl p-5 backdrop-filter-none">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge variant="default">{analysis.category}</Badge>
                                  <span className="text-meta text-text-muted">{new Date(analysis.created_at).toLocaleDateString()}</span>
                                </div>
                                <h3 className="font-medium text-text-primary text-sm leading-snug mb-1">{analysis.policy_title}</h3>
                                {analysis.analysis_text && <p className="text-xs text-text-muted line-clamp-2">{excerpt(analysis.analysis_text)}</p>}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className={`font-mono-data text-sm font-bold ${impactTone(analysis.dollar_impact || 0)}`}>
                                  {formatUSD(analysis.dollar_impact || 0, { signed: true, suffix: '/yr' })}
                                </p>
                                <Button
                                  href={`/impact/${encodeURIComponent(analysis.policy_id)}`}
                                  variant="link"
                                  className="mt-2 gap-1 text-meta"
                                  icon={<ArrowRight className="w-3 h-3" />}
                                  iconPosition="end"
                                >
                                  View full<span className="sr-only"> analysis: {analysis.policy_title}</span>
                                </Button>
                              </div>
                            </div>
                          </GlassCard>
                        ))}
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h2 ref={feedHeadingRef} tabIndex={-1} className="font-display text-xl font-semibold text-text-primary outline-none">Policy Feed</h2>
                        <div className="flex items-center gap-3">
                          {feedUpdatedAt && <span className="text-meta text-text-muted">Updated {timeAgo(feedUpdatedAt)}</span>}
                          <button type="button" onClick={() => loadFeed(true)} disabled={feedRefreshing || feedLoading} aria-busy={feedRefreshing || undefined}
                            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary glass px-3 py-1.5 rounded-xl transition-all disabled:opacity-60">
                            <RefreshCw className={`w-3 h-3 ${feedRefreshing ? 'animate-spin' : ''}`} aria-hidden />
                            {feedRefreshing ? 'Refreshing…' : 'Refresh'}<span className="sr-only"> policy feed</span>
                          </button>
                        </div>
                      </div>

                      {feedLoading ? (
                        <div className="space-y-4" role="status">
                          <span className="sr-only">Loading your policy feed…</span>
                          {[...Array(3)].map((_, i) => <FeedSkeletonCard key={i} />)}
                        </div>
                      ) : needsOnboarding ? (
                        <GlassCard className="rounded-2xl p-10 text-center">
                          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                            <BookOpen className="w-6 h-6 text-primary-300" aria-hidden />
                          </div>
                          <h3 className="font-medium text-text-primary mb-2">Finish your profile first</h3>
                          <p className="text-sm text-text-muted mb-6 max-w-xs mx-auto">Your feed is built from your financial profile. It takes about two minutes.</p>
                          <Button href="/onboarding" variant="ghost" className={`px-5 ${TINT_BUTTON}`} icon={<ArrowRight className="w-4 h-4" />} iconPosition="end">
                            Complete profile
                          </Button>
                        </GlassCard>
                      ) : feedError ? (
                        <GlassCard className="rounded-2xl p-10 text-center" role="alert">
                          <h3 className="font-medium text-text-primary mb-2">Couldn&apos;t load your feed</h3>
                          <p className="text-sm text-text-muted mb-6 max-w-xs mx-auto">{feedError}</p>
                          <Button onClick={() => loadFeed(false)} variant="ghost" className={`px-5 ${TINT_BUTTON}`}>
                            Try again
                          </Button>
                        </GlassCard>
                      ) : feedPolicies.length === 0 ? (
                        <GlassCard className="rounded-2xl p-10 text-center">
                          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                            <BookOpen className="w-6 h-6 text-primary-300" aria-hidden />
                          </div>
                          <h3 className="font-medium text-text-primary mb-2">No policies in your feed yet</h3>
                          <p className="text-sm text-text-muted mb-6 max-w-xs mx-auto">Use Refresh to build your personalized feed.</p>
                        </GlassCard>
                      ) : (
                        <div className="space-y-4">
                          {feedPolicies.map((policy) => (
                            <PolicyFeedCard
                              key={policy.id}
                              policy={policy}
                              analyzed={analyzedIds.has(policy.id)}
                              impact={impactById.get(policy.id)}
                              onAnalyze={handleAnalyze}
                              onAskAdvisor={handleAskAdvisor}
                              onDismiss={handleDismiss}
                              analyzingIds={analyzingIds}
                              focusWhenEmptyRef={feedHeadingRef}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <h2 className="font-display text-xl font-semibold text-text-primary mb-4">Your Policy Snapshot</h2>
                      {insightLoading ? (
                        <GlassCard className="rounded-2xl p-5" role="status">
                          <span className="sr-only">Generating your policy snapshot…</span>
                          <div className="space-y-2 animate-pulse" aria-hidden>
                            <div className="h-3 bg-white/10 rounded w-full" />
                            <div className="h-3 bg-white/10 rounded w-5/6" />
                            <div className="h-3 bg-white/10 rounded w-4/6" />
                          </div>
                        </GlassCard>
                      ) : portfolioInsight ? (
                        <GlassCard className="rounded-2xl p-5">
                          <div className="flex items-start gap-3">
                            <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <Zap className="w-3.5 h-3.5 text-primary-300" aria-hidden />
                            </div>
                            <p className="text-xs text-text-muted leading-relaxed">{portfolioInsight}</p>
                          </div>
                          <AiDisclaimer className="mt-3" />
                          <FeedbackControls targetType="insight" targetId="portfolio" excerpt={portfolioInsight.slice(0, 500)} className="mt-1" />
                        </GlassCard>
                      ) : (
                        <GlassCard className="rounded-2xl p-5">
                          <p className="text-xs text-text-muted">Analyze some policies to get an AI-generated portfolio insight.</p>
                        </GlassCard>
                      )}
                    </div>

                    <GlassCard className="rounded-2xl p-5 bg-gradient-to-br from-primary/10 to-secondary/5 border-primary/20">
                      <h3 className="font-display font-semibold text-text-primary mb-2">Ask the AI Policy Guide</h3>
                      <p className="text-xs text-text-muted mb-4">Get personalized answers about how any policy affects your specific situation.</p>
                      <Button href="/advisor" variant="ghost" fullWidth className={`py-2.5 ${TINT_BUTTON}`} icon={<ArrowRight className="w-3.5 h-3.5" />} iconPosition="end">
                        Start chatting
                      </Button>
                    </GlassCard>
                  </div>
                </div>
              </m.div>
            </TabPanel>

            <TabPanel value="cumulative">
              <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                {analyses.length === 0 ? (
                  <GlassCard className="rounded-2xl p-16 text-center">
                    <Layers className="w-12 h-12 text-text-muted mx-auto mb-4" aria-hidden />
                    <h3 className="font-medium text-text-primary mb-2">No data yet</h3>
                    <p className="text-sm text-text-muted max-w-xs mx-auto">Analyze at least one policy to see your cumulative financial picture.</p>
                  </GlassCard>
                ) : (
                  <div className="space-y-6">
                    {/* Category totals */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <GlassCard className="rounded-2xl p-6">
                        <p className="text-xs font-mono-data text-text-muted uppercase tracking-widest mb-5">Policy Breakdown</p>
                        <div className="space-y-3">
                          {[...analyses].sort((a, b) => Math.abs(b.dollar_impact || 0) - Math.abs(a.dollar_impact || 0)).map(a => {
                            const val = a.dollar_impact || 0;
                            const max = Math.max(...analyses.map(x => Math.abs(x.dollar_impact || 0)), 1);
                            const pct = Math.abs(val) / max * 100;
                            return (
                              <div key={a.id}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-text-primary truncate max-w-[200px]">{a.policy_title}</span>
                                  <span className={`text-xs font-mono-data font-bold ${impactTone(val)}`}>
                                    {formatUSD(val, { signed: true, suffix: '/yr' })}
                                  </span>
                                </div>
                                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden" aria-hidden>
                                  <div
                                    className={`h-full rounded-full transition-all duration-700 ${val >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </GlassCard>

                      <GlassCard className="rounded-2xl p-6">
                        <p className="text-xs font-mono-data text-text-muted uppercase tracking-widest mb-5">By Category</p>
                        <div className="space-y-3">
                          {Object.entries(
                            analyses.reduce((acc, a) => {
                              const cat = a.category || 'Other';
                              acc[cat] = (acc[cat] || 0) + (a.dollar_impact || 0);
                              return acc;
                            }, {} as Record<string, number>)
                          ).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([cat, val]) => {
                            const allCatVals = Object.values(
                              analyses.reduce((acc, a) => { const c = a.category || 'Other'; acc[c] = (acc[c] || 0) + (a.dollar_impact || 0); return acc; }, {} as Record<string, number>)
                            );
                            const max = Math.max(...allCatVals.map(Math.abs), 1);
                            return (
                              <div key={cat}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-text-primary">{cat}</span>
                                  <span className={`text-xs font-mono-data font-bold ${impactTone(val)}`}>
                                    {formatUSD(val, { signed: true, suffix: '/yr' })}
                                  </span>
                                </div>
                                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden" aria-hidden>
                                  <div
                                    className={`h-full rounded-full transition-all duration-700 ${val >= 0 ? 'bg-cyan-500' : 'bg-orange-500'}`}
                                    style={{ width: `${Math.abs(val) / max * 100}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </GlassCard>
                    </div>

                    {/* Projections table */}
                    <GlassCard className="rounded-2xl p-6">
                      <p className="text-xs font-mono-data text-text-muted uppercase tracking-widest mb-5">Cumulative Projections</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <caption className="sr-only">Cumulative projections per policy over 1, 3 and 5 years</caption>
                          <thead>
                            <tr className="border-b border-white/8">
                              <th scope="col" className="text-left text-xs text-text-muted font-normal pb-3">Policy</th>
                              <th scope="col" className="text-right text-xs text-text-muted font-normal pb-3">1 Year</th>
                              <th scope="col" className="text-right text-xs text-text-muted font-normal pb-3">3 Years</th>
                              <th scope="col" className="text-right text-xs text-text-muted font-normal pb-3">5 Years</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analyses.map(a => {
                              const yr1 = a.dollar_impact || 0;
                              const yr3 = yr1 * 3;
                              const yr5 = yr1 * 5;
                              const fmt = (n: number) => formatUSD(n, { signed: true });
                              return (
                                <tr key={a.id} className="border-b border-white/4 hover:bg-white/2 transition-colors">
                                  <th scope="row" className="py-3 text-left text-xs font-normal text-text-primary max-w-[200px] truncate">{a.policy_title}</th>
                                  <td className={`py-3 text-right font-mono-data text-xs font-bold ${impactTone(yr1)}`}>{fmt(yr1)}</td>
                                  <td className={`py-3 text-right font-mono-data text-xs font-bold ${impactTone(yr3)}`}>{fmt(yr3)}</td>
                                  <td className={`py-3 text-right font-mono-data text-xs font-bold ${impactTone(yr5)}`}>{fmt(yr5)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-white/12">
                              <th scope="row" className="pt-4 text-left text-xs font-semibold text-text-primary">Total</th>
                              {[1, 3, 5].map(yrs => {
                                const total = analyses.reduce((s, a) => s + (a.dollar_impact || 0) * yrs, 0);
                                return (
                                  <td key={yrs} className={`pt-4 text-right font-mono-data text-sm font-bold ${impactTone(total)}`}>
                                    {formatUSD(total, { signed: true })}
                                  </td>
                                );
                              })}
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </GlassCard>

                    {/* AI portfolio insight */}
                    {portfolioInsight && (
                      <GlassCard className="rounded-2xl p-6">
                        <div className="flex items-start gap-3">
                          <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Zap className="w-3.5 h-3.5 text-primary-300" aria-hidden />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-text-primary mb-1">AI Portfolio Summary</p>
                            <p className="text-xs text-text-muted leading-relaxed">{portfolioInsight}</p>
                          </div>
                        </div>
                        <AiDisclaimer className="mt-3" />
                      </GlassCard>
                    )}
                  </div>
                )}
              </m.div>
            </TabPanel>
          </Tabs>
        </main>
      </div>
    </div>
  );
}
